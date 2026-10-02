// Rule-based assistant that answers questions from the precomputed analysis.
// Runs entirely in the browser; no data is sent anywhere.

import { STRONG_CORRELATION, formatNumber, formatPct } from './analysis';

export const SUGGESTED_QUESTIONS = [
    'Summarize the dataset',
    'Show strong correlations',
    'Which column has the highest CV?',
    'Which columns have missing values?',
    'What patterns or anomalies did you find?',
];

/** The column whose name appears in the query; longest match wins so "price_usd" beats "price". */
const findColumn = (query, columns) =>
    [...columns].sort((a, b) => b.length - a.length).find((c) => query.includes(c.toLowerCase()));

const has = (query, ...words) => words.some((w) => query.includes(w));

export function answer(rawQuery, dataset, analysis) {
    const query = rawQuery.toLowerCase();
    const { stats, numericCols, categoricalCols, correlations, categoricalDists, insights } = analysis;
    const numCol = findColumn(query, numericCols);
    const catCol = findColumn(query, categoricalCols);

    if (has(query, 'summary', 'summarize', 'overview')) {
        const top = correlations[0];
        return [
            `This dataset has **${dataset.data.length.toLocaleString()} records** and **${dataset.columns.length} columns** (${numericCols.length} numeric, ${categoricalCols.length} categorical).`,
            top ? `The strongest relationship is **${top.col1}** vs **${top.col2}** (r = ${top.correlation.toFixed(2)}).` : '',
        ].join(' ');
    }

    if (has(query, 'missing', 'null', 'empty', 'complete')) {
        const missing = dataset.columns.filter((c) => stats[c].missingPct > 0);
        return missing.length
            ? `Columns with missing values:\n${missing.map((c) => `- **${c}**: ${formatPct(stats[c].missingPct)}`).join('\n')}`
            : 'Good news — every column is **100% complete**.';
    }

    if (has(query, ' cv', 'variab', 'volatil', 'inconsist', 'coefficient')) {
        const ranked = numericCols.filter((c) => stats[c].cv != null).sort((a, b) => stats[b].cv - stats[a].cv);
        if (!ranked.length) return 'There are no numeric columns with a defined coefficient of variation.';
        return `**${ranked[0]}** is the most variable column (CV ${formatPct(stats[ranked[0]].cv)}). CV measures spread relative to the mean, so higher means less predictable.\n\nRanking:\n${ranked
            .slice(0, 5)
            .map((c) => `- **${c}**: ${formatPct(stats[c].cv)}`)
            .join('\n')}`;
    }

    if (has(query, 'correlat', 'relationship', 'related')) {
        const strong = correlations.filter((c) => Math.abs(c.correlation) > 0.6).slice(0, 5);
        return strong.length
            ? `Strongest correlations (|r| > 0.6):\n${strong.map((c) => `- **${c.col1}** & **${c.col2}**: ${c.correlation.toFixed(2)}`).join('\n')}`
            : `No strong correlations (|r| > 0.6) were found. The relationships may be weak or non-linear.`;
    }

    if (has(query, 'distribution', 'spread', 'range', 'iqr')) {
        if (!numCol) return `Which numeric column? Try one of: ${numericCols.map((c) => `**${c}**`).join(', ')}.`;
        const s = stats[numCol];
        return `**${numCol}** ranges from **${formatNumber(s.min)}** to **${formatNumber(s.max)}**. The interquartile range is **${formatNumber(s.iqr)}**, so the middle 50% of values fall between ${formatNumber(s.q1)} and ${formatNumber(s.q3)}.`;
    }

    if (has(query, 'category', 'categories', 'mode', 'frequent', 'common', 'top')) {
        if (!catCol) return `Which categorical column? Try one of: ${categoricalCols.map((c) => `**${c}**`).join(', ')}.`;
        const top = (categoricalDists[catCol] || []).slice(0, 3);
        return `The most frequent value in **${catCol}** is **${top[0]?.name}** (${top[0]?.percentage.toFixed(1)}%).${
            top.length > 1 ? ` Next: ${top.slice(1).map((d) => `${d.name} (${d.percentage.toFixed(1)}%)`).join(', ')}.` : ''
        }`;
    }

    if (has(query, 'highest', 'maximum', 'max', 'largest')) {
        return numCol
            ? `The maximum of **${numCol}** is **${formatNumber(stats[numCol].max)}**.`
            : 'Which numeric column should I look at?';
    }

    if (has(query, 'lowest', 'minimum', 'min', 'smallest')) {
        return numCol
            ? `The minimum of **${numCol}** is **${formatNumber(stats[numCol].min)}**.`
            : 'Which numeric column should I look at?';
    }

    if (has(query, 'average', 'mean', 'median')) {
        return numCol
            ? `The average of **${numCol}** is **${formatNumber(stats[numCol].mean)}** (median ${formatNumber(stats[numCol].median)}).`
            : 'Which numeric column should I average?';
    }

    if (has(query, 'insight', 'pattern', 'anomal', 'outlier', 'finding')) {
        const findings = insights.filter((i) => i.type !== 'success');
        return findings.length
            ? `Key findings:\n${findings.map((i) => `- ${i.text}`).join('\n')}`
            : 'No notable patterns or anomalies were detected.';
    }

    if (has(query, 'column', 'feature', 'field')) {
        return `**Numeric:** ${numericCols.join(', ') || 'none'}\n**Categorical:** ${categoricalCols.join(', ') || 'none'}`;
    }

    const strongCount = correlations.filter((c) => Math.abs(c.correlation) > STRONG_CORRELATION).length;
    return `I can answer questions about this dataset's ${dataset.columns.length} columns and ${strongCount} strong correlations. Try:\n- "**Summarize** the dataset"\n- "What is the **average** of ${numericCols[0] ?? '[column]'}?"\n- "What is the **distribution** of ${numericCols[0] ?? '[column]'}?"\n- "**Top categories** in ${categoricalCols[0] ?? '[column]'}"`;
}
