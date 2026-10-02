import React from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Line,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { correlationBetween, formatNumber } from '../lib/analysis';
import { CATEGORICAL, CHART, OTHER_COLOR, divergingColor, divergingInk } from '../lib/palette';

const AXIS_PROPS = {
    stroke: CHART.axis,
    tick: { fill: CHART.axis, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: CHART.grid },
};

const truncate = (s, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function ChartTooltip({ active, payload, label, title }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tooltip">
            <p className="chart-tooltip__title">{title ? title(payload[0].payload) : label}</p>
            {payload.map((p) => (
                <p key={p.dataKey} className="chart-tooltip__row">
                    <span className="chart-tooltip__swatch" style={{ background: p.dataKey === 'median' ? CHART.accent : CHART.primary }} />
                    {p.name}
                    <strong>{formatNumber(p.value)}</strong>
                </p>
            ))}
        </div>
    );
}

export function Histogram({ data, label }) {
    return (
        <div className="chart chart--md" role="img" aria-label={`Histogram of ${label}`}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="range" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis {...AXIS_PROPS} axisLine={false} allowDecimals={false} width={48} />
                    <Tooltip cursor={{ fill: 'rgba(95,127,69,0.08)' }} content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Records" fill={CHART.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

const MAX_SLICES = 7;

/** Folds the long tail into a single "Other" slice so colors are never cycled. */
const foldCategories = (data) => {
    if (data.length <= MAX_SLICES + 1) return data.map((d, i) => ({ ...d, fill: CATEGORICAL[i] }));
    const head = data.slice(0, MAX_SLICES).map((d, i) => ({ ...d, fill: CATEGORICAL[i] }));
    const tail = data.slice(MAX_SLICES);
    const value = tail.reduce((a, d) => a + d.value, 0);
    const percentage = tail.reduce((a, d) => a + d.percentage, 0);
    return [...head, { name: `Other (${tail.length})`, value, percentage, fill: OTHER_COLOR }];
};

export function CategoryDonut({ data, label }) {
    const slices = foldCategories(data);
    return (
        <div className="donut">
            <div className="chart chart--donut" role="img" aria-label={`Category share for ${label}`}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={slices}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="58%"
                            outerRadius="92%"
                            paddingAngle={slices.length > 1 ? 1.5 : 0}
                            stroke="#ffffff"
                            strokeWidth={2}
                            isAnimationActive={false}
                        >
                            {slices.map((s) => (
                                <Cell key={s.name} fill={s.fill} />
                            ))}
                        </Pie>
                        <Tooltip
                            content={({ active, payload }) =>
                                active && payload?.length ? (
                                    <div className="chart-tooltip">
                                        <p className="chart-tooltip__title">{payload[0].name}</p>
                                        <p className="chart-tooltip__row">
                                            {formatNumber(payload[0].value)} records
                                            <strong>{payload[0].payload.percentage.toFixed(1)}%</strong>
                                        </p>
                                    </div>
                                ) : null
                            }
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <ul className="legend" aria-label={`${label} categories`}>
                {slices.map((s) => (
                    <li key={s.name}>
                        <span className="legend__swatch" style={{ background: s.fill }} />
                        <span className="legend__name" title={s.name}>
                            {s.name}
                        </span>
                        <span className="legend__value">{s.percentage.toFixed(1)}%</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Mean per category (bars) with the median overlaid (dots), on one shared axis. */
export function GroupComparisonChart({ data, catCol, numCol }) {
    const rows = data.map((d) => ({ ...d, label: truncate(d.category) }));
    return (
        <div className="chart chart--lg" role="img" aria-label={`Mean and median of ${numCol} by ${catCol}`}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="label" {...AXIS_PROPS} interval={0} angle={rows.length > 5 ? -30 : 0} textAnchor={rows.length > 5 ? 'end' : 'middle'} height={rows.length > 5 ? 56 : 28} />
                    <YAxis {...AXIS_PROPS} axisLine={false} width={56} tickFormatter={(v) => formatNumber(v, 0)} />
                    <Tooltip cursor={{ fill: 'rgba(95,127,69,0.08)' }} content={<ChartTooltip title={(p) => `${catCol}: ${p.category} (${p.count} records)`} />} />
                    <Bar dataKey="mean" name="Mean" fill={CHART.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line
                        dataKey="median"
                        name="Median"
                        stroke="transparent"
                        dot={{ r: 5, fill: CHART.accent, stroke: '#ffffff', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: CHART.accent, stroke: '#ffffff', strokeWidth: 2 }}
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

export function CorrelationMatrix({ columns, correlations }) {
    return (
        <div className="matrix-wrap">
            <table className="matrix">
                <thead>
                    <tr>
                        <td />
                        {columns.map((c) => (
                            <th key={c} scope="col" title={c}>
                                <span>{truncate(c, 12)}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {columns.map((row) => (
                        <tr key={row}>
                            <th scope="row" title={row}>
                                {truncate(row, 16)}
                            </th>
                            {columns.map((col) => {
                                const r = correlationBetween(correlations, row, col);
                                return (
                                    <td
                                        key={col}
                                        style={{ background: divergingColor(r), color: divergingInk(r) }}
                                        title={`${row} × ${col}: r = ${r.toFixed(3)}`}
                                        className={row === col ? 'is-diagonal' : ''}
                                    >
                                        {r.toFixed(2)}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="matrix-scale" aria-hidden="true">
                <span>−1 · moves opposite</span>
                <span className="matrix-scale__bar" />
                <span>+1 · moves together</span>
            </div>
        </div>
    );
}
