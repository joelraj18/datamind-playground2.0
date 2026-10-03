// Per-numeric-column value accumulator for files too large to keep every value.
//
// It starts as an exact table of distinct values (so discrete columns — ages, ratings, sizes —
// stay exact forever) and switches to a ±0.1% quantile sketch once the column shows more than
// `distinctCap` distinct values. Optional per-group tracking feeds bivariate box plots.

import { GROUP_WIDTH, MIN_ABS, bucketKey, createSketch, sketchAddValue, sketchMerge, storeAdd } from './sketch';
import { createDistinctTable, distinctIndex } from './tables';

/**
 * @param groupSlots number of tracked categorical columns (0 disables group tracking)
 * @param maxGroups  categories tracked per categorical column
 */
export function createNumStream(groupSlots, maxGroups, distinctCap) {
    const width = groupSlots * maxGroups;
    return {
        groupSlots,
        maxGroups,
        width,
        distinct: createDistinctTable(distinctCap, width),
        sketch: null,
        groups: null, // sketch per (slot * maxGroups + code), created lazily
    };
}

function groupSketch(ns, i) {
    return ns.groups[i] || (ns.groups[i] = createSketch(GROUP_WIDTH));
}

function toSketch(ns) {
    const t = ns.distinct;
    ns.sketch = createSketch(1);
    if (ns.width) ns.groups = new Array(ns.width).fill(null);
    for (let e = 0; e < t.size; e++) {
        sketchAddValue(ns.sketch, t.values[e], t.counts[e]);
        if (t.groups) {
            for (let i = 0; i < ns.width; i++) {
                const c = t.groups[e * ns.width + i];
                if (c !== 0) sketchAddValue(groupSketch(ns, i), t.values[e], c);
            }
        }
    }
    ns.distinct = null;
}

/** Adds one observation; `codes[slot]` is its category code per tracked column, or -1. */
export function numStreamAdd(ns, v, codes) {
    const t = ns.distinct;
    if (t !== null) {
        const e = distinctIndex(t, v);
        if (e >= 0) {
            t.counts[e]++;
            if (t.groups !== null) {
                const base = e * ns.width;
                for (let s = 0; s < ns.groupSlots; s++) {
                    const code = codes[s];
                    if (code >= 0) t.groups[base + s * ns.maxGroups + code]++;
                }
            }
            return;
        }
        toSketch(ns);
    }

    // Sketch mode: compute the bucket once and reuse it for the column and its groups.
    let key = 0;
    let sign = 0;
    if (v > MIN_ABS) {
        key = bucketKey(v);
        sign = 1;
        storeAdd(ns.sketch.pos, key, 1);
    } else if (v < -MIN_ABS) {
        key = bucketKey(-v);
        sign = -1;
        storeAdd(ns.sketch.neg, key, 1);
    } else {
        ns.sketch.zero++;
    }
    if (ns.groups !== null) {
        const groupKey = Math.floor(key / GROUP_WIDTH);
        for (let s = 0; s < ns.groupSlots; s++) {
            const code = codes[s];
            if (code < 0) continue;
            const sk = groupSketch(ns, s * ns.maxGroups + code);
            if (sign > 0) storeAdd(sk.pos, groupKey, 1);
            else if (sign < 0) storeAdd(sk.neg, groupKey, 1);
            else sk.zero++;
        }
    }
}

/** Adds `count` copies of v whose per-group counts are in `g` (already in this stream's layout). */
export function numStreamAddWeighted(ns, v, count, g) {
    const t = ns.distinct;
    if (t !== null) {
        const e = distinctIndex(t, v);
        if (e >= 0) {
            t.counts[e] += count;
            if (t.groups && g) for (let i = 0; i < ns.width; i++) t.groups[e * ns.width + i] += g[i];
            return;
        }
        toSketch(ns);
    }
    sketchAddValue(ns.sketch, v, count);
    if (ns.groups && g) for (let i = 0; i < ns.width; i++) if (g[i] !== 0) sketchAddValue(groupSketch(ns, i), v, g[i]);
}

/** Merges another sketch-mode stream whose group indexes are remapped via `remap(i) → i' | -1`. */
export function numStreamMergeSketch(ns, other, remap) {
    if (ns.distinct !== null) toSketch(ns);
    sketchMerge(ns.sketch, other.sketch);
    if (ns.groups && other.groups) {
        other.groups.forEach((sk, i) => {
            const target = sk ? remap(i) : -1;
            if (target >= 0) sketchMerge(groupSketch(ns, target), sk);
        });
    }
}

/** Distinct values (ascending) with counts and group counts, or null in sketch mode. */
export function numStreamDistinct(ns) {
    const t = ns.distinct;
    if (t === null) return null;
    const order = Array.from({ length: t.size }, (_, i) => i).sort((a, b) => t.values[a] - t.values[b]);
    const values = new Float64Array(t.size);
    const counts = new Float64Array(t.size);
    const g = t.groups ? new Float64Array(t.size * ns.width) : null;
    order.forEach((e, i) => {
        values[i] = t.values[e];
        counts[i] = t.counts[e];
        if (g) g.set(t.groups.subarray(e * ns.width, (e + 1) * ns.width), i * ns.width);
    });
    return { values, counts, g, width: ns.width };
}
