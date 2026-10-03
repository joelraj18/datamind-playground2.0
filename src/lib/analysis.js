// Shared helpers for reading an analysis produced by the streaming engine (src/engine).

export { pairKey, STRONG_CORRELATION } from '../engine/finalize';

export const NOTABLE_CORRELATION = 0.5;

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
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-4)) return value.toExponential(2);
    return value.toLocaleString(undefined, { maximumFractionDigits: Number.isInteger(value) ? 0 : digits });
}

export const formatPct = (value, digits = 1) => (value == null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}%`);

/** 1.2K, 3.4M, 1.0B — for counters and axis ticks. */
export function formatCompact(value) {
    if (value == null || Number.isNaN(value)) return '—';
    return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    if (s < 1) return 'under a second';
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Prefix for statistics estimated by the streaming sketch rather than computed exactly. */
export const approx = (exact) => (exact === false ? '≈ ' : '');
