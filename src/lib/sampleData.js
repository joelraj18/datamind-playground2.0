// Deterministic sample dataset so first-time visitors can explore without a CSV.

const mulberry32 = (seed) => () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const MODELS = [
    { name: 'Pro Max', base: 1199 },
    { name: 'Pro', base: 999 },
    { name: 'Standard', base: 799 },
    { name: 'Plus', base: 899 },
    { name: 'e', base: 599 },
];
const COLORS = ['Green', 'Blue', 'Pink', 'White', 'Black'];
const REGIONS = ['North', 'South', 'East', 'West'];
const CHANNELS = ['Online', 'Store', 'Carrier'];

export function createSampleDataset(rows = 600) {
    const rand = mulberry32(42);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    const data = Array.from({ length: rows }, (_, i) => {
        const model = MODELS[Math.min(Math.floor(rand() ** 1.4 * MODELS.length), MODELS.length - 1)];
        const storage = pick([128, 256, 512, 1024]);
        const channel = pick(CHANNELS);
        const discount = channel === 'Carrier' ? Math.round(rand() * 150) : Math.round(rand() * 40);
        const price = model.base + (storage - 128) * 0.9 - discount;
        const age = Math.round(18 + rand() * 45);
        return {
            OrderID: 10000 + i,
            Model: model.name,
            Color: pick(COLORS),
            Region: pick(REGIONS),
            Channel: channel,
            StorageGB: storage,
            Price: Math.round(price),
            Discount: discount,
            CustomerAge: age,
            Satisfaction: rand() < 0.04 ? null : Math.round((3 + rand() * 2 - (discount > 100 ? 0.4 : 0)) * 10) / 10,
        };
    });

    return {
        id: Date.now(),
        name: 'sample_phone_sales.csv',
        data,
        columns: Object.keys(data[0]),
        uploadedAt: new Date().toISOString(),
    };
}
