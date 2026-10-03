// Streams one byte range of a CSV file and accumulates every statistic in a single pass.
// Runs inside a Web Worker (one per CPU core) or, as a fallback, on the main thread.

import { createRowBuffers, fieldText, hashBytes, isBlankRow, isNAToken, parseDay, parseNumber, tokenize } from './csv';
import { readSlice } from './io';
import { createHll, hllAdd } from './sketch';
import { createNumStream, numStreamAdd, numStreamDistinct } from './stream';
import { categoryEntries, categoryFind, categoryInsert, categoryPrune, createCategoryTable } from './tables';

export const CHUNK_BYTES = 4 << 20;
const MAX_TIMELINE_DAYS = 200_000;
const INVALID_EXAMPLES = 5;

function createState(plan, rangeIndex) {
    const nNum = plan.numeric.length;
    const nCat = plan.categorical.length;
    const nDate = plan.dates.length;
    const nSlots = plan.groupCats.length;
    const nGN = plan.groupNums.length;
    const nC = plan.corrCols.length;
    const nPairs = (nC * (nC - 1)) / 2;
    const nTN = plan.timelineNums.length;
    const groupCells = nSlots * plan.maxGroups * nGN;

    const groupSlotOfCat = new Int16Array(nCat).fill(-1);
    plan.groupCats.forEach((c, slot) => (groupSlotOfCat[c] = slot));
    const groupNumIndex = new Int16Array(nNum).fill(-1);
    plan.groupNums.forEach((j, k) => (groupNumIndex[j] = k));

    return {
        rangeIndex,
        exact: plan.exact,
        buf: null,
        limit: Infinity,
        stopped: false,
        rows: 0,
        malformed: 0,
        groupSlotOfCat,
        groupNumIndex,

        // Numeric columns: shifted power sums give exact mean / variance / skew / kurtosis.
        num: {
            count: new Float64Array(nNum),
            missing: new Float64Array(nNum),
            invalid: new Float64Array(nNum),
            s1: new Float64Array(nNum),
            s2: new Float64Array(nNum),
            s3: new Float64Array(nNum),
            s4: new Float64Array(nNum),
            min: new Float64Array(nNum).fill(Infinity),
            max: new Float64Array(nNum).fill(-Infinity),
            nonInteger: new Uint8Array(nNum),
            invalidExamples: Array.from({ length: nNum }, () => []),
        },
        vals: new Float64Array(nNum),

        // Exact mode keeps every value (row-aligned, NaN = missing) plus each row's group codes.
        capacity: 0,
        buffers: plan.exact ? Array.from({ length: nNum }, () => new Float64Array(0)) : null,
        codes: plan.exact ? Array.from({ length: nSlots }, () => new Uint8Array(0)) : null,
        streams: plan.exact ? null : createStreams(plan),

        cat: {
            tables: Array.from({ length: nCat }, () => createCategoryTable()),
            missing: new Float64Array(nCat),
            hll: Array.from({ length: nCat }, createHll),
            pruned: new Uint8Array(nCat),
            dropped: new Float64Array(nCat),
        },
        hash: new Uint32Array(2),

        groups: {
            active: new Uint8Array(nSlots).fill(1),
            next: new Int16Array(nSlots),
            names: Array.from({ length: nSlots }, () => []),
            n: new Float64Array(groupCells),
            s1: new Float64Array(groupCells),
            s2: new Float64Array(groupCells),
            min: new Float64Array(groupCells).fill(Infinity),
            max: new Float64Array(groupCells).fill(-Infinity),
        },
        rowCodes: new Int16Array(nSlots).fill(-1),

        // Pearson correlation from shifted cross-products: complete rows take a fast path.
        corr: {
            x: new Float64Array(nC),
            completeN: 0,
            cs1: new Float64Array(nC),
            cs2: new Float64Array(nC),
            csxy: new Float64Array(nPairs),
            pn: new Float64Array(nPairs),
            psx: new Float64Array(nPairs),
            psy: new Float64Array(nPairs),
            psxx: new Float64Array(nPairs),
            psyy: new Float64Array(nPairs),
            psxy: new Float64Array(nPairs),
        },

        dates: {
            count: new Float64Array(nDate),
            missing: new Float64Array(nDate),
            invalid: new Float64Array(nDate),
            min: new Float64Array(nDate).fill(Infinity),
            max: new Float64Array(nDate).fill(-Infinity),
            timelines: plan.timelineDates.map(() => ({
                slotOf: new Map(),
                days: new Float64Array(256),
                counts: new Float64Array(256),
                sums: new Float64Array(256 * nTN),
                ns: new Float64Array(256 * nTN),
                size: 0,
                overflow: false,
            })),
        },

        reservoir: [],
        nextPick: 0,
        weight: 0,
        preview: rangeIndex === 0 ? [] : null,
    };
}

function createStreams(plan) {
    const slots = plan.groupCats.length;
    return plan.numeric.map((_, j) =>
        createNumStream(plan.groupNums.includes(j) ? slots : 0, plan.maxGroups, plan.distinctCap),
    );
}

/** Exact mode ran out of budget: replay the buffered rows into streaming accumulators. */
function switchToStreaming(st, plan) {
    st.streams = createStreams(plan);
    const codes = new Int16Array(plan.groupCats.length);
    for (let r = 0; r < st.rows - 1; r++) {
        for (let s = 0; s < codes.length; s++) codes[s] = st.codes[s][r] === 255 ? -1 : st.codes[s][r];
        for (let j = 0; j < st.buffers.length; j++) {
            const v = st.buffers[j][r];
            if (!Number.isNaN(v)) numStreamAdd(st.streams[j], v, codes);
        }
    }
    st.exact = false;
    st.buffers = null;
    st.codes = null;
}

function growBuffers(st, needed) {
    const capacity = Math.max(1024, st.capacity * 2, needed);
    st.buffers = st.buffers.map((b) => {
        const next = new Float64Array(capacity);
        next.set(b);
        return next;
    });
    st.codes = st.codes.map((b) => {
        const next = new Uint8Array(capacity);
        next.set(b);
        return next;
    });
    st.capacity = capacity;
}

function pruneCategories(st, c, cap) {
    const [table, dropped] = categoryPrune(st.cat.tables[c], Math.floor(cap / 2));
    st.cat.tables[c] = table;
    st.cat.dropped[c] += dropped;
    st.cat.pruned[c] = 1;
}

function growTimeline(tl, nTN) {
    const size = tl.days.length * 2;
    const grow = (arr, len) => {
        const next = new Float64Array(len);
        next.set(arr);
        return next;
    };
    tl.days = grow(tl.days, size);
    tl.counts = grow(tl.counts, size);
    tl.sums = grow(tl.sums, size * nTN);
    tl.ns = grow(tl.ns, size * nTN);
}

function makeRowHandler(st, plan, rb) {
    const ncols = plan.columns.length;
    const { numeric, categorical, dates, shifts, corrCols, groupNums, timelineDates, timelineNums, maxGroups } = plan;
    const nNum = numeric.length;
    const nCat = categorical.length;
    const nDate = dates.length;
    const nSlots = plan.groupCats.length;
    const nGN = groupNums.length;
    const nC = corrCols.length;
    const nTN = timelineNums.length;
    const timelineOf = new Int16Array(nDate).fill(-1);
    timelineDates.forEach((d, t) => (timelineOf[d] = t));
    const { num, cat, groups, corr, vals, rowCodes, hash } = st;
    const reservoirSize = plan.reservoirSize;

    const decodeRow = (buf, n) => {
        const row = new Array(ncols);
        for (let k = 0; k < ncols; k++) row[k] = k < n ? fieldText(buf, rb, k) : '';
        return row;
    };

    return (n, rowStart) => {
        if (rowStart >= st.limit) {
            st.stopped = true;
            return false;
        }
        if (isBlankRow(n, rb)) return true;
        const buf = st.buf;
        const starts = rb.starts;
        const ends = rb.ends;
        const row = st.rows++;
        if (n !== ncols) st.malformed++;
        if (st.preview && st.preview.length < plan.previewRows) st.preview.push(decodeRow(buf, n));

        /* Categorical columns: counts, distinct estimate, and group codes. */
        for (let c = 0; c < nCat; c++) {
            const col = categorical[c];
            const slot = st.groupSlotOfCat[c];
            let code = -1;
            const s = col < n ? starts[col] : 0;
            const e = col < n ? ends[col] : 0;
            if (col >= n || isNAToken(buf, s, e)) {
                cat.missing[c]++;
            } else {
                hashBytes(buf, s, e, hash);
                const h1 = hash[0];
                const h2 = hash[1];
                let table = cat.tables[c];
                let ent = categoryFind(table, h1, h2);
                if (ent < 0) {
                    const name = fieldText(buf, rb, col);
                    [table, ent] = categoryInsert(table, h1, h2, name);
                    cat.tables[c] = table;
                    if (slot >= 0 && groups.active[slot]) {
                        if (groups.next[slot] < maxGroups) {
                            table.codes[ent] = groups.next[slot]++;
                            groups.names[slot].push(name);
                        } else {
                            groups.active[slot] = 0; // too many categories to compare
                        }
                    }
                }
                table.counts[ent]++;
                hllAdd(cat.hll[c], h1, h2);
                code = table.codes[ent];
                if (table.size > plan.categoryCap) pruneCategories(st, c, plan.categoryCap);
            }
            if (slot >= 0) rowCodes[slot] = groups.active[slot] ? code : -1;
        }

        /* Numeric columns: moments, extremes and the value itself. */
        for (let j = 0; j < nNum; j++) {
            const col = numeric[j];
            let v = NaN;
            if (col < n) {
                const s = starts[col];
                const e = ends[col];
                if (s !== e) {
                    v = parseNumber(buf, s, e);
                    if (Number.isNaN(v)) {
                        if (isNAToken(buf, s, e)) num.missing[j]++;
                        else {
                            num.invalid[j]++;
                            const examples = num.invalidExamples[j];
                            if (examples.length < INVALID_EXAMPLES) {
                                const text = fieldText(buf, rb, col);
                                if (!examples.includes(text)) examples.push(text);
                            }
                        }
                    }
                } else num.missing[j]++;
            } else num.missing[j]++;
            vals[j] = v;
            if (!Number.isNaN(v)) {
                num.count[j]++;
                const d = v - shifts[j];
                const d2 = d * d;
                num.s1[j] += d;
                num.s2[j] += d2;
                num.s3[j] += d2 * d;
                num.s4[j] += d2 * d2;
                if (v < num.min[j]) num.min[j] = v;
                if (v > num.max[j]) num.max[j] = v;
                if (num.nonInteger[j] === 0 && v % 1 !== 0) num.nonInteger[j] = 1;
            }
        }

        /* Value distributions: keep everything (exact) or stream into distinct maps / sketches. */
        if (st.exact && row >= plan.bufferCap) switchToStreaming(st, plan);
        if (st.exact) {
            if (row >= st.capacity) growBuffers(st, row + 1);
            for (let j = 0; j < nNum; j++) st.buffers[j][row] = vals[j];
            for (let s = 0; s < nSlots; s++) st.codes[s][row] = rowCodes[s] < 0 ? 255 : rowCodes[s];
        } else {
            for (let j = 0; j < nNum; j++) {
                const v = vals[j];
                if (!Number.isNaN(v)) numStreamAdd(st.streams[j], v, rowCodes);
            }
        }

        /* Group sums for bivariate means. */
        for (let s = 0; s < nSlots; s++) {
            const code = rowCodes[s];
            if (code < 0) continue;
            const base = (s * maxGroups + code) * nGN;
            for (let k = 0; k < nGN; k++) {
                const j = groupNums[k];
                const v = vals[j];
                if (Number.isNaN(v)) continue;
                const idx = base + k;
                const d = v - shifts[j];
                groups.n[idx]++;
                groups.s1[idx] += d;
                groups.s2[idx] += d * d;
                if (v < groups.min[idx]) groups.min[idx] = v;
                if (v > groups.max[idx]) groups.max[idx] = v;
            }
        }

        /* Correlation cross-products. */
        if (nC > 1) {
            const x = corr.x;
            let complete = true;
            for (let a = 0; a < nC; a++) {
                const j = corrCols[a];
                x[a] = vals[j] - shifts[j];
                if (Number.isNaN(x[a])) complete = false;
            }
            let p = 0;
            if (complete) {
                corr.completeN++;
                for (let a = 0; a < nC; a++) {
                    const xa = x[a];
                    corr.cs1[a] += xa;
                    corr.cs2[a] += xa * xa;
                    for (let b = a + 1; b < nC; b++) corr.csxy[p++] += xa * x[b];
                }
            } else {
                for (let a = 0; a < nC; a++) {
                    const xa = x[a];
                    if (Number.isNaN(xa)) {
                        p += nC - a - 1;
                        continue;
                    }
                    for (let b = a + 1; b < nC; b++, p++) {
                        const xb = x[b];
                        if (Number.isNaN(xb)) continue;
                        corr.pn[p]++;
                        corr.psx[p] += xa;
                        corr.psy[p] += xb;
                        corr.psxx[p] += xa * xa;
                        corr.psyy[p] += xb * xb;
                        corr.psxy[p] += xa * xb;
                    }
                }
            }
        }

        /* Dates: range plus a per-day timeline. */
        for (let d = 0; d < nDate; d++) {
            const col = dates[d];
            const s = col < n ? starts[col] : 0;
            const e = col < n ? ends[col] : 0;
            if (col >= n || isNAToken(buf, s, e)) {
                st.dates.missing[d]++;
                continue;
            }
            const day = parseDay(buf, s, e);
            if (Number.isNaN(day)) {
                st.dates.invalid[d]++;
                continue;
            }
            st.dates.count[d]++;
            if (day < st.dates.min[d]) st.dates.min[d] = day;
            if (day > st.dates.max[d]) st.dates.max[d] = day;
            const t = timelineOf[d];
            if (t < 0) continue;
            const tl = st.dates.timelines[t];
            let slot = tl.slotOf.get(day);
            if (slot === undefined) {
                if (tl.size >= MAX_TIMELINE_DAYS) {
                    tl.overflow = true;
                    continue;
                }
                if (tl.size === tl.days.length) growTimeline(tl, nTN);
                slot = tl.size++;
                tl.slotOf.set(day, slot);
                tl.days[slot] = day;
            }
            tl.counts[slot]++;
            const base = slot * nTN;
            for (let k = 0; k < nTN; k++) {
                const v = vals[timelineNums[k]];
                if (!Number.isNaN(v)) {
                    tl.sums[base + k] += v;
                    tl.ns[base + k]++;
                }
            }
        }

        /* Uniform random sample of rows (reservoir sampling, Algorithm L). */
        const seen = row + 1;
        if (seen <= reservoirSize) {
            st.reservoir.push(decodeRow(buf, n));
            if (seen === reservoirSize) {
                st.weight = Math.exp(Math.log(Math.random()) / reservoirSize);
                st.nextPick = seen + Math.floor(Math.log(Math.random()) / Math.log(1 - st.weight)) + 1;
            }
        } else if (seen === st.nextPick) {
            st.reservoir[Math.floor(Math.random() * reservoirSize)] = decodeRow(buf, n);
            st.weight *= Math.exp(Math.log(Math.random()) / reservoirSize);
            st.nextPick += Math.floor(Math.log(Math.random()) / Math.log(1 - st.weight)) + 1;
        }
        return true;
    };
}

/**
 * Scans the rows whose first byte lies in [range.start, range.end).
 * @param onProgress ({ bytesDone, rows }) after every chunk
 * @param isCancelled () => boolean, polled between chunks
 */
export async function scanRange(file, range, plan, onProgress, isCancelled) {
    const st = createState(plan, range.index);
    const rb = createRowBuffers(Math.max(64, plan.columns.length + 4));
    const onRow = makeRowHandler(st, plan, rb);

    // Every range but the first starts mid-line: skip ahead to the first row that starts inside it.
    let skipPartial = range.start > plan.dataStart;
    let readPos = skipPartial ? range.start - 1 : range.start;
    let carry = null;

    for (;;) {
        const readEnd = Math.min(file.size, readPos + CHUNK_BYTES);
        const chunk = new Uint8Array(await readSlice(file, readPos, readEnd));
        let buf = chunk;
        if (carry && carry.length) {
            buf = new Uint8Array(carry.length + chunk.length);
            buf.set(carry);
            buf.set(chunk, carry.length);
        }
        const bufStart = readPos - (carry ? carry.length : 0);
        readPos = readEnd;
        const isFinal = readEnd >= file.size;

        let from = 0;
        if (skipPartial) {
            while (from < buf.length && buf[from] !== 10) from++;
            if (from === buf.length) {
                carry = null;
                if (isFinal || bufStart + from >= range.end) break;
                continue;
            }
            from++;
            skipPartial = false;
        }

        st.buf = buf;
        st.limit = range.end - bufStart;
        const consumed = tokenize(buf, from, buf.length, plan.delimiter, isFinal, rb, onRow);
        st.buf = null;

        onProgress?.({ bytesDone: Math.min(readEnd, range.end) - range.start, rows: st.rows });
        if (st.stopped || isFinal) break;
        if (isCancelled?.()) throw new Error('cancelled');
        carry = buf.subarray(consumed);
    }
    return finishState(st, plan, range);
}

/** Converts the scan state into a compact, transferable partial result. */
function finishState(st, plan, range) {
    const rows = st.rows;
    const trim = (arr) => (arr ? arr.slice(0, rows) : null);
    const streams = st.streams
        ? st.streams.map((ns) => numStreamDistinct(ns) || { sketch: ns.sketch, groups: ns.groups })
        : null;

    return {
        index: range.index,
        rows,
        malformed: st.malformed,
        exact: st.exact,
        num: st.num,
        buffers: st.exact ? st.buffers.map(trim) : null,
        codes: st.exact ? st.codes.map(trim) : null,
        streams,
        cat: {
            entries: st.cat.tables.map(categoryEntries),
            missing: st.cat.missing,
            hll: st.cat.hll,
            pruned: st.cat.pruned,
            dropped: st.cat.dropped,
        },
        groups: st.groups,
        corr: { ...st.corr, x: undefined },
        dates: {
            ...st.dates,
            timelines: st.dates.timelines.map((tl) => ({
                size: tl.size,
                overflow: tl.overflow,
                days: tl.days.slice(0, tl.size),
                counts: tl.counts.slice(0, tl.size),
                sums: tl.sums.slice(0, tl.size * plan.timelineNums.length),
                ns: tl.ns.slice(0, tl.size * plan.timelineNums.length),
            })),
        },
        reservoir: st.reservoir,
        preview: st.preview,
    };
}

/** ArrayBuffers in a partial that can be transferred (not copied) between threads. */
export function transferables(partial) {
    const out = new Set();
    const visit = (v) => {
        if (!v || typeof v !== 'object') return;
        if (ArrayBuffer.isView(v)) {
            out.add(v.buffer);
            return;
        }
        if (Array.isArray(v)) v.forEach(visit);
        else if (!(v instanceof Map)) Object.values(v).forEach(visit);
    };
    visit(partial);
    return [...out];
}
