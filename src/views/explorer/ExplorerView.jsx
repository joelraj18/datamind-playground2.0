import React from 'react';
import { Download, FileText, NotebookPen } from 'lucide-react';
import { Callout, StatTile } from '../../components/ui';
import { STRONG_CORRELATION, formatPct } from '../../lib/analysis';
import { qualitySummary } from '../../lib/blueprints';
import { GLOSSARY } from '../../lib/glossary';
import {
    BivariateTab,
    CorrelationTab,
    DecisionTab,
    InsightsTab,
    PredictiveTab,
    QualityTab,
    SegmentationTab,
    TemplateTab,
    UnivariateTab,
} from './tabs';

export const EXPLORER_TABS = [
    { id: 'univariate', label: 'Univariate', Component: UnivariateTab },
    { id: 'correlation', label: 'Correlation', Component: CorrelationTab },
    { id: 'bivariate', label: 'Bivariate', Component: BivariateTab },
    { id: 'insights', label: 'Insights', Component: InsightsTab },
    { id: 'decision', label: 'Decision Center', Component: DecisionTab },
    { id: 'quality', label: 'Data Quality', Component: QualityTab },
    { id: 'segmentation', label: 'Segmentation', Component: SegmentationTab },
    { id: 'predictive', label: 'Predictive', Component: PredictiveTab },
    { id: 'template', label: 'Python Template', Component: TemplateTab },
];

export default function ExplorerView({ dataset, analysis, tab, onTabChange, onExport }) {
    const active = EXPLORER_TABS.find((t) => t.id === tab) || EXPLORER_TABS[0];
    const { Component } = active;
    const { completeness } = qualitySummary(analysis);
    const strong = analysis.correlations.filter((c) => Math.abs(c.correlation) > STRONG_CORRELATION).length;

    return (
        <div className="page">
            <header className="page-hero">
                <div>
                    <p className="eyebrow">Explore</p>
                    <h1 className="display display--md" title={dataset.name}>
                        {dataset.name.replace(/\.csv$/i, '')}
                    </h1>
                </div>
                <div className="page-hero__links">
                    <button type="button" className="link" onClick={() => onExport('report')}>
                        <FileText aria-hidden="true" /> Report (.md)
                    </button>
                    <button type="button" className="link" onClick={() => onExport('csv')}>
                        <Download aria-hidden="true" /> Data (.csv)
                    </button>
                    <button type="button" className="link" onClick={() => onExport('notebook')}>
                        <NotebookPen aria-hidden="true" /> Notebook (.ipynb)
                    </button>
                </div>
            </header>

            {analysis.sampled && (
                <Callout title={`Analysed the first ${analysis.recordCount.toLocaleString()} of ${analysis.totalRecords.toLocaleString()} rows`}>
                    {GLOSSARY.sampling}
                </Callout>
            )}

            <div className="kpis">
                <StatTile label="Records" value={analysis.totalRecords.toLocaleString()} info={GLOSSARY.records} />
                <StatTile label="Features" value={dataset.columns.length} info={GLOSSARY.features} />
                <StatTile label="Numeric" value={analysis.numericCols.length} info={GLOSSARY.numeric} />
                <StatTile label="Categorical" value={analysis.categoricalCols.length} info={GLOSSARY.categorical} />
                <StatTile label="Completeness" value={formatPct(completeness)} tone={completeness === 100 ? 'good' : undefined} info={GLOSSARY.completeness} />
                <StatTile label="Strong correlations" value={strong} info={GLOSSARY.strongCorrelations} />
            </div>

            <nav className="subnav" aria-label="Analysis sections">
                <ul role="tablist">
                    {EXPLORER_TABS.map((t) => (
                        <li key={t.id}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={t.id === active.id}
                                className={t.id === active.id ? 'is-active' : ''}
                                onClick={() => onTabChange(t.id)}
                            >
                                {t.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            <div role="tabpanel" aria-label={active.label} className="tabpanel">
                <Component key={dataset.id} analysis={analysis} />
            </div>
        </div>
    );
}
