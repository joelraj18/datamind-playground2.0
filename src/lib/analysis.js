// Pure, framework-free analysis helpers. Everything here takes plain data in
// and returns plain data out, so it can be unit-tested and reused anywhere.

/** Rows beyond this count are sampled out of the analysis to keep the UI responsive. */
export const MAX_ANALYSIS_ROWS = 110000;

/** Categorical columns with at least this many distinct values are skipped in charts. */
export const MAX_CHART_CATEGORIES = 15;

export const STRONG_CORRELATION = 0.7;
export const NOTABLE_CORRELATION = 0.5;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Median of an already-sorted numeric array. */
export const medianOfSorted = (sorted) => {
    const n = sorted.length;
    if (n === 0) return NaN;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/** Linear-interpolated quantile of an already-sorted numeric array. */
export const quantileOfSorted = (sorted, q) => {
    if (sorted.length === 0) return NaN;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[base + 1];
    return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
};

/** Pearson correlation between two columns, ignoring rows where either value is not numeric. */
export const pearson = (rows, colA, colB) => {
    let n = 0;
    let sumA = 0;
    let sumB = 0;
    for (const row of rows) {
        const a = row[colA];
        const b = row[colB];
        if (isNumber(a) && isNumber(b)) {
            n++;
            sumA += a;
            sumB += b;
        }
    }
    if (n < 2) return 0;

    const meanA = sumA / n;
    const meanB = sumB / n;
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (const row of rows) {
        const a = row[colA];
        const b = row[colB];
        if (isNumber(a) && isNumber(b)) {
            const da = a - meanA;
            const db = b - meanB;
            num += da * db;
            denA += da * da;
            denB += db * db;
        }
    }
    const r = num / Math.sqrt(denA * denB);
    return Number.isFinite(r) ? r : 0;
};

const niceLabel = (value, span) => {
    const abs = Math.abs(value);
    // Only abbreviate when the bins are wide enough that the abbreviation stays distinct.
    if (abs >= 1e6 && span >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e4 && span >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
    const digits = span < 1 ? 3 : span < 10 ? 2 : span < 100 ? 1 : 0;
    return value.toFixed(digits);
};

/** Equal-width histogram over a numeric array. */
export const histogram = (values, bins = 15) => {
    if (values.length === 0) return [];
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (min === max) return [{ range: niceLabel(min, 0), count: values.length, start: min, end: max }];

    const width = (max - min) / bins;
    const span = max - min;
    const out = Array.from({ length: bins }, (_, i) => {
        const start = min + i * width;
        const end = start + width;
        return { range: `${niceLabel(start, span)}–${niceLabel(end, span)}`, count: 0, start, end };
    });
    for (const v of values) {
        out[Math.min(Math.floor((v - min) / width), bins - 1)].count++;
    }
    return out;
};

const describeNumeric = (values, recordCount, presentCount) => {
    const sorted = Float64Array.from(values).sort();
    let sum = 0;
    for (const v of sorted) sum += v;
    const mean = sum / sorted.length;
    let sq = 0;
    for (const v of sorted) sq += (v - mean) ** 2;
    const std = Math.sqrt(sq / sorted.length);
    const q1 = quantileOfSorted(sorted, 0.25);
    const q3 = quantileOfSorted(sorted, 0.75);

    return {
        type: 'numeric',
        count: sorted.length,
        mean,
        median: medianOfSorted(sorted),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        q1,
        q3,
        iqr: q3 - q1,
        std,
        // CV is meaningless when the mean is zero; report null rather than Infinity.
        cv: mean !== 0 ? (std / Math.abs(mean)) * 100 : null,
        missingPct: ((recordCount - presentCount) / recordCount) * 100,
    };
};

const describeCategorical = (values, recordCount) => {
    const counts = new Map();
    for (const v of values) {
        const key = String(v);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    const distribution = [...counts.entries()]
        .map(([name, value]) => ({ name, value, percentage: (value / values.length) * 100 }))
        .sort((a, b) => b.value - a.value);

    return {
        stat: {
            type: 'categorical',
            count: values.length,
            unique: counts.size,
            mode: distribution[0]?.name ?? 'N/A',
            modePct: distribution[0]?.percentage ?? 0,
            missingPct: ((recordCount - values.length) / recordCount) * 100,
        },
        distribution,
    };
};

const groupStats = (rows, catCol, numCol) => {
    const groups = new Map();
    for (const row of rows) {
        const cat = row[catCol];
        const num = row[numCol];
        if (cat != null && cat !== '' && isNumber(num)) {
            const key = String(cat);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(num);
        }
    }
    return [...groups.entries()]
        .map(([category, values]) => {
            const sorted = Float64Array.from(values).sort();
            let sum = 0;
            for (const v of sorted) sum += v;
            return {
                category,
                mean: sum / sorted.length,
                median: medianOfSorted(sorted),
                min: sorted[0],
                max: sorted[sorted.length - 1],
                count: sorted.length,
            };
        })
        .sort((a, b) => b.mean - a.mean);
};

/** Key used to look up a categorical-vs-numeric breakdown. */
export const pairKey = (catCol, numCol) => `${catCol}\u0000${numCol}`;

/**
 * Run the full exploratory analysis on a dataset.
 * @param {{ data: object[], columns: string[] }} dataset
 */
export function analyzeDataset(dataset) {
    if (!dataset?.data?.length) return null;

    const { columns } = dataset;
    const sampled = dataset.data.length > MAX_ANALYSIS_ROWS;
    const rows = sampled ? dataset.data.slice(0, MAX_ANALYSIS_ROWS) : dataset.data;
    const recordCount = rows.length;

    const stats = {};
    const distributions = {};
    const categoricalDists = {};
    const insights = [];

    for (const col of columns) {
        const present = [];
        for (const row of rows) {
            const v = row[col];
            if (v != null && v !== '') present.push(v);
        }
        const numeric = present.filter(isNumber);

        // A column is numeric when the bulk of its non-empty values parse as numbers.
        if (numeric.length > 0 && numeric.length >= present.length * 0.9) {
            const stat = describeNumeric(numeric, recordCount, present.length);
            stats[col] = stat;
            distributions[col] = histogram(numeric, 15);

            if (stat.std > 0 && numeric.length > 30 && Math.abs(stat.mean - stat.median) / stat.std > 0.5) {
                insights.push({
                    agent: 'Analyst',
                    type: 'warning',
                    text: `Potential **skewness** in **${col}** — mean ${formatNumber(stat.mean)} vs median ${formatNumber(stat.median)}.`,
                });
            }
            if (stat.std > 0 && stat.max > stat.mean + 3 * stat.std) {
                insights.push({
                    agent: 'Analyst',
                    type: 'warning',
                    text: `Extreme high value in **${col}** (max ${formatNumber(stat.max)}, more than 3σ above the mean). This may be a **premium segment** or a data error.`,
                });
            }
        } else {
            const { stat, distribution } = describeCategorical(present, recordCount);
            stats[col] = stat;
            categoricalDists[col] = distribution;

            if (distribution.length > 1 && distribution[0].percentage > 70) {
                insights.push({
                    agent: 'Insight',
                    type: 'info',
                    text: `Dominant category in **${col}**: **${distribution[0].name}** covers ${distribution[0].percentage.toFixed(1)}% of records.`,
                });
            }
        }

        if (stats[col].missingPct > 20) {
            insights.push({
                agent: 'Quality',
                type: 'warning',
                text: `**${col}** is missing in ${stats[col].missingPct.toFixed(1)}% of records.`,
            });
        }
    }

    const numericCols = columns.filter((c) => stats[c].type === 'numeric');
    const categoricalCols = columns.filter((c) => stats[c].type === 'categorical');
    const chartableCatCols = categoricalCols.filter(
        (c) => stats[c].unique > 1 && stats[c].unique < MAX_CHART_CATEGORIES,
    );

    const correlations = [];
    for (let i = 0; i < numericCols.length; i++) {
        for (let j = i + 1; j < numericCols.length; j++) {
            const col1 = numericCols[i];
            const col2 = numericCols[j];
            const correlation = pearson(rows, col1, col2);
            correlations.push({ col1, col2, correlation });
            if (Math.abs(correlation) > STRONG_CORRELATION) {
                insights.push({
                    agent: 'Analyst',
                    type: 'info',
                    text: `Strong **${correlation > 0 ? 'positive' : 'negative'}** correlation between **${col1}** and **${col2}** (r = ${correlation.toFixed(2)}).`,
                });
            }
        }
    }
    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    const bivariate = {};
    for (const catCol of chartableCatCols) {
        for (const numCol of numericCols) {
            bivariate[pairKey(catCol, numCol)] = groupStats(rows, catCol, numCol);
        }
    }

    insights.push({
        agent: 'Insight',
        type: 'success',
        text: `Analysis complete on **${recordCount.toLocaleString()} records** across **${columns.length} features** (${numericCols.length} numeric, ${categoricalCols.length} categorical).`,
    });

    return {
        recordCount,
        totalRecords: dataset.data.length,
        sampled,
        stats,
        numericCols,
        categoricalCols,
        chartableCatCols,
        distributions,
        categoricalDists,
        correlations,
        bivariate,
        insights,
    };
}

/** Look up r for an unordered pair of numeric columns. */
export const correlationBetween = (correlations, a, b) => {
    if (a === b) return 1;
    const hit = correlations.find((c) => (c.col1 === a && c.col2 === b) || (c.col1 === b && c.col2 === a));
    return hit ? hit.correlation : 0;
};

/** Human-friendly number formatting shared across the app. */
export function formatNumber(value, digits = 2) {
    if (value == null || Number.isNaN(value)) return '—';
    if (!Number.isFinite(value)) return '∞';
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e9 || abs < 1e-3)) return value.toExponential(2);
    return value.toLocaleString(undefined, { maximumFractionDigits: Number.isInteger(value) ? 0 : digits });
}

export const formatPct = (value, digits = 1) => (value == null ? '—' : `${value.toFixed(digits)}%`);
