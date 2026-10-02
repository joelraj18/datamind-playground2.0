import React, { useState } from 'react';
import { Check, Copy, Gem, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { CategoryDonut, CorrelationMatrix, GroupComparisonChart, Histogram } from '../../components/charts';
import { Callout, Card, DataTable, EmptyState, InfoTip, RichText, SectionTitle, StatTile } from '../../components/ui';
import { NOTABLE_CORRELATION, STRONG_CORRELATION, formatNumber, formatPct, pairKey } from '../../lib/analysis';
import { decisionSummary, guessTarget, predictiveSummary, qualitySummary, segmentationSummary } from '../../lib/blueprints';
import { buildPythonTemplate } from '../../lib/exporters';
import { GLOSSARY } from '../../lib/glossary';

const cvTone = (cv) => (cv == null ? '' : cv > 75 ? 'text-warn' : cv > 50 ? 'text-caution' : '');

/* ---------- Univariate ---------- */

export function UnivariateTab({ analysis }) {
    const { stats, numericCols, categoricalCols, chartableCatCols, distributions, categoricalDists } = analysis;
    const skipped = categoricalCols.filter((c) => !chartableCatCols.includes(c));

    const columns = [
        { key: 'col', label: 'Feature' },
        { key: 'mean', label: 'Mean', numeric: true, info: GLOSSARY.mean, render: (r) => formatNumber(r.mean) },
        { key: 'median', label: 'Median', numeric: true, info: GLOSSARY.median, render: (r) => formatNumber(r.median) },
        { key: 'std', label: 'Std dev', numeric: true, info: GLOSSARY.std, render: (r) => formatNumber(r.std) },
        { key: 'cv', label: 'CV', numeric: true, info: GLOSSARY.cv, render: (r) => <span className={cvTone(r.cv)}>{r.cv == null ? '—' : formatPct(r.cv)}</span> },
        { key: 'min', label: 'Min', numeric: true, info: GLOSSARY.min, render: (r) => formatNumber(r.min) },
        { key: 'max', label: 'Max', numeric: true, info: GLOSSARY.max, render: (r) => formatNumber(r.max) },
        { key: 'missingPct', label: 'Missing', numeric: true, info: GLOSSARY.missing, render: (r) => <span className={r.missingPct > 0 ? 'text-warn' : 'text-muted'}>{formatPct(r.missingPct)}</span> },
    ];

    return (
        <div className="stack-xl">
            <section>
                <SectionTitle strong="Numbers." soft="Center, spread and shape of every numeric column." />
                {numericCols.length === 0 ? (
                    <EmptyState title="No numeric columns found." />
                ) : (
                    <>
                        <Card>
                            <DataTable columns={columns} rows={numericCols.map((col) => ({ col, ...stats[col] }))} rowKey={(r) => r.col} />
                        </Card>
                        <div className="grid grid--2">
                            {numericCols.map((col) => (
                                <Card key={col} eyebrow="Distribution" title={col} info={GLOSSARY.histogram}>
                                    <p className="card__sub">
                                        Mean <strong>{formatNumber(stats[col].mean)}</strong> · Median <strong>{formatNumber(stats[col].median)}</strong> · IQR{' '}
                                        <strong>{formatNumber(stats[col].iqr)}</strong>
                                    </p>
                                    <Histogram data={distributions[col]} label={col} />
                                </Card>
                            ))}
                        </div>
                    </>
                )}
            </section>

            <section>
                <SectionTitle strong="Categories." soft="How records split across each label." />
                {chartableCatCols.length === 0 ? (
                    <EmptyState title="No categorical columns with 2–14 distinct values to chart." />
                ) : (
                    <div className="grid grid--2">
                        {chartableCatCols.map((col) => (
                            <Card key={col} eyebrow={`${stats[col].unique} categories`} title={col} info={GLOSSARY.donut}>
                                <p className="card__sub">
                                    Most common <strong>{stats[col].mode}</strong> ({formatPct(stats[col].modePct)}) · Missing {formatPct(stats[col].missingPct)}
                                </p>
                                <CategoryDonut data={categoricalDists[col]} label={col} />
                            </Card>
                        ))}
                    </div>
                )}
                {skipped.length > 0 && (
                    <Callout title="Some text columns aren’t charted">
                        {skipped.map((c) => `${c} (${stats[c].unique.toLocaleString()} distinct)`).join(', ')} — too many or too few distinct values for a
                        meaningful breakdown. Check the Data Quality tab for likely ID columns.
                    </Callout>
                )}
            </section>
        </div>
    );
}

/* ---------- Correlation ---------- */

export function CorrelationTab({ analysis }) {
    const { numericCols, correlations } = analysis;
    if (numericCols.length < 2) return <EmptyState title="Correlation needs at least two numeric columns." />;
    const top = correlations.filter((c) => Math.abs(c.correlation) > NOTABLE_CORRELATION).slice(0, 8);

    return (
        <div className="stack-xl">
            <SectionTitle strong="Correlation." soft="Which columns move together." info={GLOSSARY.correlation} />
            <Card title="Correlation matrix" eyebrow="Pearson’s r">
                <CorrelationMatrix columns={numericCols} correlations={correlations} />
            </Card>
            <Card title={`Most related pairs (|r| > ${NOTABLE_CORRELATION})`}>
                {top.length === 0 ? (
                    <p className="text-muted">No pairs above |r| = {NOTABLE_CORRELATION}. Relationships here are weak or non-linear.</p>
                ) : (
                    <ul className="pair-list">
                        {top.map((c) => (
                            <li key={`${c.col1}-${c.col2}`}>
                                <span>
                                    <strong>{c.col1}</strong> and <strong>{c.col2}</strong>
                                </span>
                                <span className={`pill ${c.correlation > 0 ? 'pill--pos' : 'pill--neg'}`}>
                                    {c.correlation > 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                                    r = {c.correlation.toFixed(2)} · {Math.abs(c.correlation) > STRONG_CORRELATION ? 'strong' : 'moderate'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
            <Callout title="Correlation is not causation">
                A high r means two columns tend to move together. It doesn’t tell you that one causes the other — a third factor may drive both.
            </Callout>
        </div>
    );
}

/* ---------- Bivariate ---------- */

export function BivariateTab({ analysis }) {
    const { chartableCatCols, numericCols, bivariate } = analysis;
    const [catCol, setCatCol] = useState(chartableCatCols[0]);
    const [numCol, setNumCol] = useState(() => guessTarget(numericCols));

    if (!chartableCatCols.length || !numericCols.length) {
        return <EmptyState title="Bivariate analysis needs a numeric column and a categorical column with 2–14 values." />;
    }

    const data = bivariate[pairKey(catCol, numCol)] || [];
    const columns = [
        { key: 'category', label: catCol },
        { key: 'count', label: 'Records', numeric: true, render: (r) => r.count.toLocaleString() },
        { key: 'mean', label: 'Mean', numeric: true, info: GLOSSARY.mean, render: (r) => formatNumber(r.mean) },
        { key: 'median', label: 'Median', numeric: true, info: GLOSSARY.median, render: (r) => formatNumber(r.median) },
        { key: 'min', label: 'Min', numeric: true, render: (r) => formatNumber(r.min) },
        { key: 'max', label: 'Max', numeric: true, render: (r) => formatNumber(r.max) },
    ];

    return (
        <div className="stack-xl">
            <SectionTitle strong="Compare groups." soft="See how a category shifts a number." info={GLOSSARY.bivariate} />
            <div className="filters">
                <label className="select">
                    <span>Group by</span>
                    <select value={catCol} onChange={(e) => setCatCol(e.target.value)}>
                        {chartableCatCols.map((c) => (
                            <option key={c}>{c}</option>
                        ))}
                    </select>
                </label>
                <label className="select">
                    <span>Measure</span>
                    <select value={numCol} onChange={(e) => setNumCol(e.target.value)}>
                        {numericCols.map((c) => (
                            <option key={c}>{c}</option>
                        ))}
                    </select>
                </label>
            </div>
            <Card eyebrow={`${numCol} by ${catCol}`} title="Mean and median per group">
                <div className="chart-legend" aria-hidden="true">
                    <span>
                        <i className="key key--bar" /> Mean
                    </span>
                    <span>
                        <i className="key key--dot" /> Median
                    </span>
                </div>
                <GroupComparisonChart data={data} catCol={catCol} numCol={numCol} />
            </Card>
            <Card title="Group table">
                <DataTable columns={columns} rows={data} rowKey={(r) => r.category} />
            </Card>
        </div>
    );
}

/* ---------- Insights ---------- */

const AGENT_TONE = { warning: 'warning', success: 'success', info: 'info' };

export function InsightsTab({ analysis }) {
    return (
        <div className="stack-xl">
            <SectionTitle strong="Insights." soft="What stood out in your data." info={GLOSSARY.insights} />
            <div className="stack">
                {analysis.insights.map((insight, i) => (
                    <Callout key={i} tone={AGENT_TONE[insight.type]} title={insight.agent}>
                        <RichText text={insight.text} />
                    </Callout>
                ))}
            </div>
        </div>
    );
}

/* ---------- Decision center ---------- */

export function DecisionTab({ analysis }) {
    const { unstable, drivers, risks } = decisionSummary(analysis);

    return (
        <div className="stack-xl">
            <SectionTitle strong="Decision Center." soft="The few things worth acting on." info={GLOSSARY.decision} />
            <div className="grid grid--3">
                <StatTile label="Risks flagged" value={risks.length} tone={risks.length ? 'warn' : 'good'} hint="Skew, outliers or gaps" />
                <StatTile label="Strong drivers" value={drivers.length} hint={`Pairs with |r| ≥ ${STRONG_CORRELATION}`} info={GLOSSARY.strongCorrelations} />
                <StatTile label="Unstable features" value={unstable.length} tone={unstable.length ? 'warn' : 'good'} hint="CV above 50%" info={GLOSSARY.cv} />
            </div>

            <Card eyebrow="01" title="Risks and imbalances">
                {risks.length ? (
                    <div className="stack">
                        {risks.map((r, i) => (
                            <Callout key={i} tone="warning" title={r.agent}>
                                <RichText text={r.text} />
                            </Callout>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted">No skew, extreme outliers or heavy missing data detected.</p>
                )}
            </Card>

            <Card eyebrow="02" title="Strongest drivers">
                {drivers.length ? (
                    <ul className="action-list">
                        {drivers.map((c) => (
                            <li key={`${c.col1}-${c.col2}`}>
                                <p>
                                    <strong>{c.col1}</strong> and <strong>{c.col2}</strong> move {c.correlation > 0 ? 'together' : 'in opposite directions'} (r = {c.correlation.toFixed(2)}).
                                </p>
                                <p className="text-muted">Action: use one to forecast or segment the other, and avoid feeding both into the same linear model.</p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-muted">No strong linear relationships (|r| ≥ {STRONG_CORRELATION}). Relationships may be weak or non-linear.</p>
                )}
            </Card>

            <Card eyebrow="03" title="Stability" info={GLOSSARY.cv}>
                {unstable.length ? (
                    <ul className="action-list">
                        {unstable.map((u) => (
                            <li key={u.col}>
                                <p>
                                    <strong>{u.col}</strong> varies widely (CV {formatPct(u.cv)}).
                                </p>
                                <p className="text-muted">Action: treat single values with caution; the spread may hide distinct high-value segments worth splitting out.</p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-muted">Every numeric feature has CV below 50%. The data is stable.</p>
                )}
            </Card>
        </div>
    );
}

/* ---------- Data quality ---------- */

export function QualityTab({ analysis }) {
    const { missing, highCardinality, inconsistent, completeness } = qualitySummary(analysis);
    const { recordCount, numericCols, categoricalCols } = analysis;

    return (
        <div className="stack-xl">
            <SectionTitle strong="Data quality." soft="A health check before you trust the numbers." info={GLOSSARY.quality} />
            <div className="grid grid--3">
                <StatTile label="Completeness" value={formatPct(completeness)} tone={completeness === 100 ? 'good' : 'warn'} info={GLOSSARY.completeness} />
                <StatTile label="Records analysed" value={recordCount.toLocaleString()} info={GLOSSARY.records} />
                <StatTile label="Column types" value={`${numericCols.length} · ${categoricalCols.length}`} hint="numeric · categorical" info={GLOSSARY.numeric} />
            </div>

            <div className="grid grid--3">
                <Card title="Missing values" info={GLOSSARY.missing}>
                    {missing.length ? (
                        <ul className="meter-list">
                            {missing.map((m) => (
                                <li key={m.col}>
                                    <span className="meter-list__label">
                                        <strong>{m.col}</strong>
                                        <span className="text-muted">
                                            {formatPct(m.pct)} · {m.rows.toLocaleString()} rows
                                        </span>
                                    </span>
                                    <span className="meter">
                                        <span style={{ width: `${Math.max(m.pct, 1)}%` }} />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted">100% complete. No missing values.</p>
                    )}
                </Card>
                <Card title="Inconsistent features" info={GLOSSARY.cv}>
                    {inconsistent.length ? (
                        <ul className="plain-list">
                            {inconsistent.map((i) => (
                                <li key={i.col}>
                                    <strong>{i.col}</strong> <span className="text-warn">CV {formatPct(i.cv)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted">All numeric features have CV below 75%.</p>
                    )}
                </Card>
                <Card title="Likely identifiers" info={GLOSSARY.cardinality}>
                    {highCardinality.length ? (
                        <ul className="plain-list">
                            {highCardinality.map((c) => (
                                <li key={c}>
                                    <strong>{c}</strong> <span className="text-muted">behaves like an ID</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted">No text column is more than 80% unique.</p>
                    )}
                </Card>
            </div>
        </div>
    );
}

/* ---------- Segmentation ---------- */

export function SegmentationTab({ analysis }) {
    const { target, driver, premium, volume } = segmentationSummary(analysis);

    return (
        <div className="stack-xl">
            <SectionTitle strong="Segmentation." soft="Two profiles to start from." info={GLOSSARY.segmentation} />
            <div className="grid grid--2">
                <Card className="segment" eyebrow="Value" title={<><Gem aria-hidden="true" className="segment__icon" /> Premium segment</>}>
                    {premium ? (
                        <>
                            <p className="segment__profile">
                                {premium.column} = <strong>{premium.category}</strong>
                            </p>
                            <dl className="facts">
                                <dt>Average {target}</dt>
                                <dd>{formatNumber(premium.mean)}</dd>
                                <dt>Records</dt>
                                <dd>{premium.count.toLocaleString()}</dd>
                                {driver && (
                                    <>
                                        <dt>Closest driver</dt>
                                        <dd>
                                            {driver.col} (r = {driver.r.toFixed(2)})
                                        </dd>
                                    </>
                                )}
                            </dl>
                            <p className="text-muted">Action: lead with premium features and service for this group — it carries the highest value per record.</p>
                        </>
                    ) : (
                        <p className="text-muted">Needs a numeric target and a categorical column with 2–14 values.</p>
                    )}
                </Card>
                <Card className="segment" eyebrow="Volume" title={<><Users aria-hidden="true" className="segment__icon" /> Core segment</>}>
                    {volume ? (
                        <>
                            <p className="segment__profile">
                                {volume.column} = <strong>{volume.group}</strong>
                            </p>
                            <dl className="facts">
                                <dt>Share of records</dt>
                                <dd>{formatPct(volume.pct)}</dd>
                            </dl>
                            <p className="text-muted">Action: optimise for reliability and affordability here — this group provides scale and stability.</p>
                        </>
                    ) : (
                        <p className="text-muted">No categorical column with a clear majority group.</p>
                    )}
                </Card>
            </div>
            {target && (
                <Callout title="How the target was chosen">
                    <strong>{target}</strong> was picked as the value column because its name suggests price, revenue or similar. If that’s wrong, the
                    profiles above still describe the column’s highest-mean group.
                </Callout>
            )}
        </div>
    );
}

/* ---------- Predictive ---------- */

export function PredictiveTab({ analysis }) {
    const { target, predictors, skewed, best, worst } = predictiveSummary(analysis);
    if (!target || analysis.numericCols.length < 2) return <EmptyState title="Predictive analysis needs at least two numeric columns." />;

    const columns = [
        { key: 'col', label: 'Feature' },
        { key: 'score', label: 'Score', numeric: true, info: GLOSSARY.riskScore, render: (r) => <strong className="text-brand">{r.score.toFixed(3)}</strong> },
        { key: 'r', label: `|r| with ${target}`, numeric: true, info: GLOSSARY.correlation, render: (r) => r.r.toFixed(2) },
        { key: 'cv', label: 'CV', numeric: true, info: GLOSSARY.cv, render: (r) => <span className={cvTone(r.cv)}>{formatPct(r.cv)}</span> },
    ];

    return (
        <div className="stack-xl">
            <SectionTitle strong="Predictive blueprint." soft={`What best explains ${target}.`} info={GLOSSARY.predictive} />
            <Card eyebrow="01" title="Top risk-adjusted predictors" info={GLOSSARY.riskScore}>
                {predictors.length ? (
                    <DataTable columns={columns} rows={predictors} rowKey={(r) => r.col} />
                ) : (
                    <p className="text-muted">No other numeric feature has a defined CV to score.</p>
                )}
            </Card>
            <div className="grid grid--2">
                <Card eyebrow="02" title="Outlier opportunities" info={GLOSSARY.skew}>
                    {skewed.length ? (
                        <ul className="plain-list">
                            {skewed.map((s) => (
                                <li key={`${s.column}-${s.group}`}>
                                    {s.column} = <strong>{s.group}</strong> <span className="text-muted">mean exceeds median by {formatNumber(s.gap, 0)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted">No group is strongly right-skewed.</p>
                    )}
                </Card>
                <Card eyebrow="03" title="Best vs worst case">
                    {best && worst ? (
                        <dl className="facts">
                            <dt>Best</dt>
                            <dd>
                                {best.column} = <strong>{best.category}</strong> · avg {formatNumber(best.mean)}
                            </dd>
                            <dt>Worst</dt>
                            <dd>
                                {worst.column} = <strong>{worst.category}</strong> · avg {formatNumber(worst.mean)}
                            </dd>
                        </dl>
                    ) : (
                        <p className="text-muted">Needs a categorical column with 2–14 values.</p>
                    )}
                </Card>
            </div>
        </div>
    );
}

/* ---------- Python template ---------- */

export function TemplateTab({ analysis }) {
    const [copied, setCopied] = useState(false);
    const code = buildPythonTemplate(analysis);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="stack-xl">
            <SectionTitle strong="Python template." soft="Reproduce it in Jupyter." info={GLOSSARY.template} />
            <Card
                title="Paste into a notebook cell"
                actions={
                    <button type="button" className="btn btn--secondary" onClick={copy}>
                        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        {copied ? 'Copied' : 'Copy code'}
                    </button>
                }
            >
                <pre className="code">
                    <code>{code}</code>
                </pre>
            </Card>
            <p className="footnote">
                Requires pandas, numpy, matplotlib and seaborn. Uncomment the <code>read_csv</code> line and point it at your file.
                <InfoTip text="Install with: pip install pandas numpy matplotlib seaborn" />
            </p>
        </div>
    );
}
