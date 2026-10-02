import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { GlobalNav, Ribbon } from './components/GlobalNav';
import { Toast } from './components/ui';
import { analyzeDataset } from './lib/analysis';
import { baseName, buildCsv, buildNotebook, buildReport, downloadFile } from './lib/exporters';
import { createSampleDataset } from './lib/sampleData';
import * as storage from './lib/storage';
import AssistantView from './views/AssistantView';
import AuthView from './views/AuthView';
import DatasetsView from './views/DatasetsView';
import ExplorerView from './views/explorer/ExplorerView';

const TOAST_MS = 4500;

export default function DataMind() {
    const [user, setUser] = useState(storage.getSessionUser);
    const [datasets, setDatasets] = useState([]);
    const [loadingDatasets, setLoadingDatasets] = useState(false);
    const [activeId, setActiveId] = useState(null);
    const [view, setView] = useState('datasets');
    const [explorerTab, setExplorerTab] = useState('univariate');
    const [messages, setMessages] = useState([]);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState(null);

    const activeDataset = datasets.find((d) => d.id === activeId) || null;
    const analysis = useMemo(() => analyzeDataset(activeDataset), [activeDataset]);

    const notify = useCallback((message, type = 'info') => setToast({ message, type, at: Date.now() }), []);

    useEffect(() => {
        if (!toast) return undefined;
        const t = setTimeout(() => setToast(null), TOAST_MS);
        return () => clearTimeout(t);
    }, [toast]);

    useEffect(() => {
        window.scrollTo?.(0, 0);
    }, [view]);

    const email = user?.email;
    useEffect(() => {
        if (!email) return undefined;
        let cancelled = false;
        setLoadingDatasets(true);
        storage.loadDatasets(email).then((saved) => {
            if (cancelled) return;
            // Keep anything added while loading (e.g. a sample opened straight away).
            setDatasets((current) => [...saved, ...current.filter((d) => !saved.some((s) => s.id === d.id))]);
            setLoadingDatasets(false);
        });
        return () => {
            cancelled = true;
        };
    }, [email]);

    /* ---------- Session ---------- */

    const startSession = (profile, greeting) => {
        setUser(profile);
        setDatasets([]);
        setActiveId(null);
        setView('datasets');
        notify(greeting, 'success');
    };

    const signOut = () => {
        storage.clearSession();
        setUser(null);
        setDatasets([]);
        setActiveId(null);
        setMessages([]);
        notify('You’ve been signed out.');
    };

    /* ---------- Datasets ---------- */

    const openDataset = (dataset) => {
        if (dataset.id !== activeId) {
            setActiveId(dataset.id);
            setMessages([]);
            setExplorerTab('univariate');
        }
        setView('explorer');
    };

    const addDataset = (dataset) => {
        setDatasets((current) => [...current, dataset]);
        openDataset(dataset);
        notify(`“${dataset.name}” is ready to explore.`, 'success');

        storage.saveDataset(user.email, dataset).then((saved) => {
            if (saved) return;
            // Browser storage is full or disabled. Keep the dataset for this session only.
            setDatasets((current) => current.map((d) => (d.id === dataset.id ? { ...d, unsaved: true } : d)));
            notify(`“${dataset.name}” couldn’t be saved in this browser, so it’s available for this session only.`, 'info');
        });
    };

    const handleFile = (file) => {
        if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
            notify('Please choose a .csv file.', 'error');
            return;
        }
        setBusy(true);
        const rows = [];
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            worker: true,
            chunkSize: 1024 * 1024,
            chunk: (results) => {
                for (const row of results.data) rows.push(row);
            },
            complete: () => {
                setBusy(false);
                if (!rows.length) {
                    notify('That file has no data rows.', 'error');
                    return;
                }
                addDataset({
                    id: Date.now(),
                    name: file.name,
                    data: rows,
                    columns: Object.keys(rows[0]).filter((c) => c !== '__parsed_extra'),
                    uploadedAt: new Date().toISOString(),
                });
            },
            error: (err) => {
                setBusy(false);
                notify(`Couldn’t read the file: ${err.message}`, 'error');
            },
        });
    };

    const deleteDataset = (dataset) => {
        if (!window.confirm(`Delete “${dataset.name}”? This can’t be undone.`)) return;
        storage.deleteDataset(user.email, dataset.id);
        setDatasets((current) => current.filter((d) => d.id !== dataset.id));
        if (dataset.id === activeId) {
            setActiveId(null);
            setMessages([]);
            setView('datasets');
        }
        notify('Dataset deleted.', 'success');
    };

    const exportAs = (kind) => {
        const name = baseName(activeDataset.name);
        if (kind === 'csv') downloadFile(`${name}_export.csv`, buildCsv(activeDataset), 'text/csv');
        if (kind === 'report') downloadFile(`${name}_report.md`, buildReport(activeDataset, analysis), 'text/markdown');
        if (kind === 'notebook') downloadFile(`${name}_analysis.ipynb`, buildNotebook(activeDataset), 'application/x-ipynb+json');
        notify('Download started.', 'success');
    };

    /* ---------- Render ---------- */

    const toastNode = toast && <Toast key={toast.at} message={toast.message} type={toast.type} onClose={() => setToast(null)} />;

    if (!user) {
        return (
            <div className="app app--auth">
                {toastNode}
                <AuthView
                    onSignIn={(creds) => {
                        const profile = storage.signIn(creds);
                        startSession(profile, `Welcome back, ${profile.name}.`);
                    }}
                    onRegister={(details) => {
                        const profile = storage.register(details);
                        startSession(profile, `Welcome to DataMind, ${profile.name}.`);
                    }}
                />
            </div>
        );
    }

    const currentView = analysis ? view : 'datasets';

    return (
        <div className="app">
            {toastNode}
            <GlobalNav view={currentView} onNavigate={setView} hasDataset={!!analysis} user={user} onSignOut={signOut} />
            <Ribbon>Your data never leaves this device — every chart and statistic is computed right in your browser.</Ribbon>

            <main id="main">
                {currentView === 'datasets' && (
                    <DatasetsView
                        datasets={datasets}
                        activeId={activeId}
                        busy={busy}
                        loading={loadingDatasets}
                        onFile={handleFile}
                        onOpen={openDataset}
                        onDelete={deleteDataset}
                        onSample={() => addDataset(createSampleDataset())}
                    />
                )}
                {currentView === 'explorer' && (
                    <ExplorerView dataset={activeDataset} analysis={analysis} tab={explorerTab} onTabChange={setExplorerTab} onExport={exportAs} />
                )}
                {currentView === 'assistant' && (
                    <AssistantView dataset={activeDataset} analysis={analysis} messages={messages} onMessages={setMessages} />
                )}
            </main>

            <footer className="footer">
                <p>
                    DataMind runs entirely in your browser. Large files are analysed on an even 110,000-row sample; counts and exports always include every row.
                </p>
                <p className="footer__fine">Built with React, Recharts and PapaParse.</p>
            </footer>
        </div>
    );
}
