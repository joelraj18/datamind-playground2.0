import { analyzeFile } from '../../engine';
import { formatBytes, formatCompact, formatDuration, formatNumber } from '../analysis';
import { answer } from '../assistant';
import { guessTarget, measureCols, predictiveSummary, qualitySummary } from '../blueprints';
import { buildNotebook, buildPythonTemplate, buildReport } from '../exporters';
import { createSampleFile } from '../sampleData';
import { aggregateTimeline } from '../timeline';

let analysis;
beforeAll(async () => {
    analysis = await analyzeFile(createSampleFile(3000));
});

describe('formatters', () => {
    test('numbers, sizes and durations', () => {
        expect(formatNumber(null)).toBe('—');
        expect(formatNumber(Infinity)).toBe('∞');
        expect(formatBytes(1500)).toBe('1.5 KB');
        expect(formatDuration(65_000)).toBe('1 min 05 s');
        expect(formatCompact(1_250_000)).toMatch(/1\.3M/);
    });
});

describe('sample dataset analysis', () => {
    test('types every column and flags the ID', () => {
        expect(analysis.meta.rows).toBe(3000);
        expect(analysis.idCols).toEqual(['OrderID']);
        expect(analysis.dateCols).toEqual(['OrderDate']);
        expect(measureCols(analysis)).toEqual(['StorageGB', 'Price', 'Discount', 'CustomerAge', 'Satisfaction']);
        expect(guessTarget(analysis)).toBe('Price');
    });

    test('blueprints', () => {
        expect(qualitySummary(analysis).missing.map((m) => m.col)).toEqual(['Satisfaction']);
        expect(predictiveSummary(analysis).target).toBe('Price');
    });

    test('timeline rolls days into months without losing records', () => {
        const { points, granularity } = aggregateTimeline(analysis.timelines.OrderDate, 'month', null);
        expect(granularity).toBe('month');
        expect(points.reduce((s, p) => s + p.value, 0)).toBe(3000);
        const means = aggregateTimeline(analysis.timelines.OrderDate, 'auto', 'Price').points.filter((p) => p.value != null);
        expect(means.every((p) => p.value > 0)).toBe(true);
    });
});

describe('assistant', () => {
    test('answers from the analysis', () => {
        expect(answer('what is the average of price?', analysis)).toContain(`**${formatNumber(analysis.stats.Price.mean)}**`);
        expect(answer('which columns have missing values', analysis)).toContain('**Satisfaction**');
        expect(answer('Which column has the highest CV?', analysis)).toContain('most variable');
        expect(answer('percentiles of price', analysis)).toContain('P90');
        expect(answer('where are the outliers?', analysis)).toMatch(/1\.5 × IQR/);
        expect(answer('when did orders happen', analysis)).toContain('**OrderDate**');
    });
});

describe('exporters', () => {
    test('report, notebook and template are well formed', () => {
        expect(buildReport(analysis)).toContain('### Price (numeric)');
        expect(JSON.parse(buildNotebook(analysis)).nbformat).toBe(4);
        const template = buildPythonTemplate(analysis);
        expect(template).toContain("numerical_cols = ['StorageGB', 'Price'");
        expect(template).toContain("date_cols = ['OrderDate']");
    });
});
