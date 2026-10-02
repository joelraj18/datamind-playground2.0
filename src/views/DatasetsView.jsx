import React, { useRef, useState } from 'react';
import {
    ArrowUpRight,
    BarChart3,
    Brain,
    FileSpreadsheet,
    Grid3x3,
    Layers,
    Loader2,
    ShieldCheck,
    Target,
    Trash2,
    UploadCloud,
} from 'lucide-react';
import { Carousel, EmptyState, InfoTip, SectionTitle } from '../components/ui';
import { GLOSSARY } from '../lib/glossary';

const EXPERIENCE = [
    { icon: BarChart3, title: 'Univariate analysis', text: 'Mean, median, spread, CV and a histogram for every numeric column; frequency donuts for every category.' },
    { icon: Grid3x3, title: 'Correlation matrix', text: 'A colour-coded grid of Pearson’s r between every pair of numeric columns, with the strongest pairs called out.' },
    { icon: Layers, title: 'Bivariate breakdowns', text: 'How each category shifts a numeric column — means and medians side by side.' },
    { icon: Brain, title: 'Insights engine', text: 'Skew, outliers, dominant categories and missing data flagged automatically, in plain English.' },
    { icon: Target, title: 'Predictive blueprint', text: 'Ranks the features most likely to predict your target, and the segments with outsized value.' },
    { icon: ShieldCheck, title: 'Private by design', text: 'Parsing and analysis run on your device. Your files are never uploaded anywhere.' },
];

/** Column-type dots on a dataset card, like the colour swatches on a product tile. */
function ColumnDots({ dataset }) {
    const sample = dataset.data[0] || {};
    const shown = dataset.columns.slice(0, 12);
    const numeric = dataset.columns.filter((c) => typeof sample[c] === 'number').length;
    return (
        <div className="swatches">
            <span className="swatches__dots" aria-hidden="true">
                {shown.map((c) => (
                    <span key={c} className={`swatch ${typeof sample[c] === 'number' ? 'swatch--num' : 'swatch--cat'}`} title={c} />
                ))}
                {dataset.columns.length > shown.length && <span className="swatches__more">+{dataset.columns.length - shown.length}</span>}
            </span>
            <span className="swatches__caption">
                {numeric} numeric · {dataset.columns.length - numeric} text
            </span>
        </div>
    );
}

function DatasetCard({ dataset, active, onOpen, onDelete }) {
    const uploaded = new Date(dataset.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return (
        <article className={`product-card ${active ? 'is-active' : ''}`}>
            <p className="eyebrow">{active ? 'Currently open' : `Added ${uploaded}`}</p>
            <h3 className="product-card__title" title={dataset.name}>
                {dataset.name.replace(/\.csv$/i, '')}
            </h3>
            <div className="product-card__visual" aria-hidden="true">
                <FileSpreadsheet />
            </div>
            <ColumnDots dataset={dataset} />
            <footer className="product-card__footer">
                <p className="product-card__meta">
                    <strong>{dataset.data.length.toLocaleString()}</strong> records
                    <br />
                    <strong>{dataset.columns.length}</strong> features{dataset.unsaved && ' · this session only'}
                </p>
                <div className="product-card__actions">
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => onDelete(dataset)} aria-label={`Delete ${dataset.name}`} title="Delete">
                        <Trash2 aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn--primary" onClick={() => onOpen(dataset)}>
                        {active ? 'Explore' : 'Open'}
                    </button>
                </div>
            </footer>
        </article>
    );
}

function UploadZone({ onFile, busy }) {
    const input = useRef(null);
    const [dragging, setDragging] = useState(false);

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
    };

    return (
        <div
            className={`upload ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
        >
            {busy ? <Loader2 className="upload__icon spin" aria-hidden="true" /> : <UploadCloud className="upload__icon" aria-hidden="true" />}
            <div className="upload__text">
                <p className="upload__title">{busy ? 'Reading and analysing your file…' : 'Drop a CSV here to begin.'}</p>
                <p className="upload__hint">The first row should contain column names. Large files are read in chunks so the page stays responsive.</p>
            </div>
            <button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={() => input.current?.click()}>
                Choose file
            </button>
            <input
                ref={input}
                type="file"
                accept=".csv,text/csv"
                className="visually-hidden"
                tabIndex={-1}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onFile(file);
                }}
            />
        </div>
    );
}

export default function DatasetsView({ datasets, activeId, busy, onFile, onOpen, onDelete, onSample }) {
    return (
        <div className="page">
            <header className="page-hero">
                <h1 className="display">Datasets</h1>
                <div className="page-hero__links">
                    <button type="button" className="link" onClick={onSample}>
                        Try a sample dataset <ArrowUpRight aria-hidden="true" />
                    </button>
                    <span className="link link--muted">
                        Where is my data stored?
                        <InfoTip text={GLOSSARY.privacy} align="end" />
                    </span>
                </div>
            </header>

            <UploadZone onFile={onFile} busy={busy} />

            <section className="shelf">
                <SectionTitle strong="Your datasets." soft={datasets.length ? 'Pick one to explore.' : 'Nothing here yet.'} />
                {datasets.length === 0 ? (
                    <EmptyState icon={FileSpreadsheet} title="Upload a CSV, or start with sample data.">
                        <button type="button" className="btn btn--secondary" onClick={onSample}>
                            Load sample phone sales
                        </button>
                    </EmptyState>
                ) : (
                    <Carousel label="Your datasets">
                        {datasets.map((d) => (
                            <DatasetCard key={d.id} dataset={d} active={d.id === activeId} onOpen={onOpen} onDelete={onDelete} />
                        ))}
                    </Carousel>
                )}
            </section>

            <section className="shelf">
                <SectionTitle strong="The DataMind experience." soft="Everything you get from a single upload." />
                <Carousel label="Features">
                    {EXPERIENCE.map(({ icon: Icon, title, text }) => (
                        <article key={title} className="feature-card">
                            <Icon className="feature-card__icon" aria-hidden="true" />
                            <h3 className="feature-card__title">{title}</h3>
                            <p className="feature-card__text">{text}</p>
                        </article>
                    ))}
                </Carousel>
            </section>
        </div>
    );
}
