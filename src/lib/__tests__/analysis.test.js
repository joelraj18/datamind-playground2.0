import { analyzeDataset, formatNumber, histogram, medianOfSorted, pairKey, pearson, quantileOfSorted } from '../analysis';
import { answer } from '../assistant';
import { buildNotebook, buildPythonTemplate, buildReport } from '../exporters';
import { predictiveSummary, qualitySummary } from '../blueprints';
import { createSampleDataset } from '../sampleData';

const dataset = {
    id: 1,
    name: 'toy.csv',
    columns: ['Price', 'Size', 'Region', 'Note'],
    data: [
        { Price: 10, Size: 1, Region: 'North', Note: 'a' },
        { Price: 20, Size: 2, Region: 'North', Note: 'b' },
        { Price: 30, Size: 3, Region: 'South', Note: 'c' },
        { Price: 40, Size: 4, Region: 'South', Note: null },
    ],
};

describe('statistics helpers', () => {
    test('median and quantiles', () => {
        expect(medianOfSorted([1, 2, 3, 4])).toBe(2.5);
        expect(medianOfSorted([1, 2, 3])).toBe(2);
        expect(quantileOfSorted([0, 10, 20, 30, 40], 0.25)).toBe(10);
    });

    test('pearson correlation', () => {
        expect(pearson(dataset.data, 'Price', 'Size')).toBeCloseTo(1);
        expect(pearson([{ a: 1, b: 'x' }], 'a', 'b')).toBe(0);
    });

    test('histogram counts every value', () => {
        const bins = histogram([1, 2, 3, 4, 5, 100], 5);
        expect(bins).toHaveLength(5);
        expect(bins.reduce((a, b) => a + b.count, 0)).toBe(6);
        expect(histogram([7, 7, 7])).toEqual([expect.objectContaining({ count: 3 })]);
    });

    test('formatNumber handles edge cases', () => {
        expect(formatNumber(null)).toBe('—');
        expect(formatNumber(Infinity)).toBe('∞');
    });
});

describe('analyzeDataset', () => {
    const analysis = analyzeDataset(dataset);

    test('classifies columns and computes stats', () => {
        expect(analysis.numericCols).toEqual(['Price', 'Size']);
        expect(analysis.categoricalCols).toEqual(['Region', 'Note']);
        expect(analysis.stats.Price.mean).toBe(25);
        expect(analysis.stats.Note.missingPct).toBe(25);
        expect(analysis.bivariate[pairKey('Region', 'Price')]).toEqual([
            expect.objectContaining({ category: 'South', mean: 35 }),
            expect.objectContaining({ category: 'North', mean: 15 }),
        ]);
    });

    test('flags strong correlations', () => {
        expect(analysis.insights.some((i) => i.text.includes('Strong **positive** correlation'))).toBe(true);
    });

    test('CV is null when the mean is zero', () => {
        const a = analyzeDataset({ columns: ['x'], data: [{ x: -1 }, { x: 1 }] });
        expect(a.stats.x.cv).toBeNull();
    });

    test('returns null for empty data', () => {
        expect(analyzeDataset({ columns: [], data: [] })).toBeNull();
    });

    test('sample dataset analyses end-to-end', () => {
        const sample = createSampleDataset();
        const a = analyzeDataset(sample);
        expect(a.numericCols).toContain('Price');
        expect(predictiveSummary(a).target).toBe('Price');
        expect(qualitySummary(a).highCardinality).toEqual([]);
    });
});

describe('assistant', () => {
    const analysis = analyzeDataset(dataset);
    test('answers averages and missing values', () => {
        expect(answer('what is the average of price?', dataset, analysis)).toContain('**25**');
        expect(answer('which columns have missing values', dataset, analysis)).toContain('**Note**');
        expect(answer('Which column has the highest CV?', dataset, analysis)).toContain('most variable');
    });
});

describe('exporters', () => {
    const analysis = analyzeDataset(dataset);
    test('report, notebook and template are well formed', () => {
        expect(buildReport(dataset, analysis)).toContain('### Price (numeric)');
        expect(JSON.parse(buildNotebook(dataset)).nbformat).toBe(4);
        const quirky = analyzeDataset({ columns: ["it's"], data: [{ "it's": 1 }, { "it's": 2 }] });
        expect(buildPythonTemplate(quirky)).toContain("['it\\'s']");
    });
});
