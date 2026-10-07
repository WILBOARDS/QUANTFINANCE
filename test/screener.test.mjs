/* Tes screener: validasi periode frame, parser frame SEC, gabung per CIK, metrik, preset
   (batas eksklusif, data kurang dikecualikan), urutan, momentum. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../shared/screener.mjs';
import { parseTickers } from '../shared/fundamentals.mjs';

const fx = n => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const NOW = Date.UTC(2026, 9, 7);

test('periode frame: durasi CY####, instan CY####Q#I, tahun 2009..sekarang; tahun bawaan', () => {
  assert.equal(S.validPeriod('CY2024', 'dur', NOW), true);
  assert.equal(S.validPeriod('CY2024Q4I', 'inst', NOW), true);
  assert.equal(S.validPeriod('CY2024', 'inst', NOW), false);
  assert.equal(S.validPeriod('CY2024Q4I', 'dur', NOW), false);
  assert.equal(S.validPeriod('CY2024Q4', 'inst', NOW), false);
  assert.equal(S.validPeriod('CY2008', 'dur', NOW), false);
  assert.equal(S.validPeriod('CY2027', 'dur', NOW), false);
  assert.equal(S.validPeriod('CY2024; DROP', 'dur', NOW), false);
  assert.equal(S.defaultYear(NOW), 2025);
  assert.equal(S.defaultYear(Date.UTC(2026, 1, 1)), 2024);
  assert.equal(S.frameUrl('Assets', 'USD', 'CY2025Q4I'), 'https://data.sec.gov/api/xbrl/frames/us-gaap/Assets/USD/CY2025Q4I.json');
  for (const [c, f] of Object.entries(S.FRAME_ALLOW)) { assert.match(c, /^[A-Za-z]+$/); assert.ok(['USD', 'USD-per-shares', 'shares'].includes(f.unit)); }
});

test('parseFrame: hanya pelapor bertiker, baris rusak dibuang, format tidak dikenal melempar', () => {
  const { byCik } = parseTickers(fx('sec-tickers.json'));
  const f = S.parseFrame(fx('sec-frames-revenues.json'), byCik);
  assert.equal(f.tag, 'Revenues');
  assert.equal(f.ccp, 'CY2024');
  assert.equal(f.total, 4);
  assert.deepEqual(f.rows.map(r => r[0]), [1234567, 7654321]);
  assert.deepEqual(f.rows[0], [1234567, 1e9, '2024-01-01', '2024-12-31', '0001234567-25-000010']);
  assert.deepEqual(f.ent[7654321], ['[UJI] CONTOH BANK CORP', 'UJIB']);
  const all = S.parseFrame(fx('sec-frames-revenues.json'));
  assert.equal(all.rows.length, 3);                    // tanpa daftar ticker: semua yang valid
  assert.throws(() => S.parseFrame({ tag: 'x' }), /tidak dikenal/);
});

test('plan: semua frame setahun + pendapatan tahun lalu; EPS hanya bila diminta', () => {
  const p = S.plan(2025);
  const keys = p.map(x => x.concept + '|' + x.period);
  assert.ok(keys.includes('Revenues|CY2025') && keys.includes('Revenues|CY2024'));
  assert.ok(keys.includes('RevenueFromContractWithCustomerExcludingAssessedTax|CY2024'));
  assert.ok(keys.includes('Assets|CY2025Q4I') && keys.includes('LiabilitiesCurrent|CY2025Q4I'));
  assert.ok(!keys.some(k => k.startsWith('EarningsPerShareDiluted')));
  assert.ok(S.plan(2025, { eps: true }).some(x => x.concept === 'EarningsPerShareDiluted' && x.unit === 'USD-per-shares'));
  for (const x of p) assert.equal(S.FRAME_ALLOW[x.concept].unit, x.unit);
});

/* frame sintetis berbentuk hasil parseFrame */
const fr = (rows, ent) => ({ tag: '', uom: 'USD', ccp: '', label: '', total: rows.length, rows, ent });
const E = { 1: ['[UJI] A', 'AAA'], 2: ['[UJI] B', 'BBB'], 3: ['[UJI] BANK', 'CCC'] };
const R = (cik, val, end = '2025-12-31', start = '2025-01-01') => [cik, val, start, end, '000000000' + cik + '-26-000001'];
const RI = (cik, val) => [cik, val, '', '2025-12-31', '000000000' + cik + '-26-000002'];
function frames() {
  return {
    'Revenues|CY2025': fr([R(1, 1000), R(3, 500)], E),
    'Revenues|CY2024': fr([R(1, 800, '2024-12-31', '2024-01-01'), R(2, 400, '2024-12-31', '2024-01-01'), R(3, 0, '2024-12-31', '2024-01-01')], E),
    'RevenueFromContractWithCustomerExcludingAssessedTax|CY2025': fr([R(2, 600)], E),
    'RevenueFromContractWithCustomerExcludingAssessedTax|CY2024': fr([], E),
    'NetIncomeLoss|CY2025': fr([R(1, 150), R(2, -20), R(3, 80)], E),
    'NetCashProvidedByUsedInOperatingActivities|CY2025': fr([R(1, 200), R(2, 10), R(3, 60)], E),
    'PaymentsToAcquirePropertyPlantAndEquipment|CY2025': fr([R(1, 50)], E),
    'PaymentsOfDividends|CY2025': fr([R(1, 30), R(3, 100)], E),
    'Assets|CY2025Q4I': fr([RI(1, 2000), RI(2, 900), RI(3, 10000)], E),
    'Liabilities|CY2025Q4I': fr([RI(1, 800), RI(2, 600), RI(3, 9000)], E),
    'StockholdersEquity|CY2025Q4I': fr([RI(1, 1200), RI(2, 300), RI(3, 1000)], E),
    'AssetsCurrent|CY2025Q4I': fr([RI(1, 900), RI(2, 400)], E),
    'LiabilitiesCurrent|CY2025Q4I': fr([RI(1, 300), RI(2, 500)], E),
  };
}

test('joinFrames + computeMetrics: rumus per perusahaan, pertumbuhan hanya dengan tag yang sama', () => {
  const rows = S.joinFrames(frames(), 2025).map(r => S.computeMetrics(r));
  const by = Object.fromEntries(rows.map(r => [r.ticker, r]));
  const a = by.AAA.m;
  close(a.netMargin, 0.15); close(a.roa, 0.075); close(a.roe, 0.125); close(a.liabEquity, 800 / 1200); close(a.currentRatio, 3);
  close(a.revGrowth, 0.25); assert.equal(a.fcf, 150); close(a.fcfMargin, 0.15); close(a.payout, 0.2);
  assert.equal(a.health, 3);
  assert.equal(by.AAA.v.revenue.concept, 'Revenues');
  assert.equal(by.AAA.v.revenuePrev.period, 'CY2024');
  /* BBB: tahun ini RFCC, tahun lalu Revenues -> pertumbuhan TIDAK dihitung (tag berbeda) */
  assert.equal(by.BBB.v.revenue.concept, 'RevenueFromContractWithCustomerExcludingAssessedTax');
  assert.equal(by.BBB.m.revGrowth, null);
  assert.equal(by.BBB.m.fcf, null);                     // capex tidak ada
  assert.equal(by.BBB.m.payout, null);                  // laba negatif
  assert.equal(by.BBB.health.score, 2);                 // F1 gagal (rugi), F2 dan F4 lolos
  assert.deepEqual(by.BBB.health.criteria.map(c => c.pass), [false, true, true]);
  assert.equal(by.BBB.m.health, 2);
  /* CCC (bank): tanpa aset lancar -> current ratio null; pendapatan tahun lalu 0 -> pertumbuhan null */
  assert.equal(by.CCC.m.currentRatio, null);
  assert.equal(by.CCC.m.revGrowth, null);
  close(by.CCC.m.payout, 100 / 80);
});

test('preset: batas eksklusif, data kurang dikecualikan dan dihitung', () => {
  const rows = S.joinFrames(frames(), 2025).map(r => S.computeMetrics(r));
  const g = S.applyFilters(rows, S.PRESETS.GROWTH.filters);
  assert.deepEqual(g.pass.map(r => r.ticker), ['AAA']);
  assert.equal(g.missing, 2);                           // BBB dan CCC tanpa pertumbuhan
  const lev = S.applyFilters(rows, S.PRESETS.LOWLEV.filters);
  assert.deepEqual(lev.pass.map(r => r.ticker), []);    // AAA: 0.667 tidak < 0.5
  const q = S.applyFilters(rows, { roe: { min: 0.125 } });
  assert.deepEqual(q.pass.map(r => r.ticker), []);      // 0.125 tidak > 0.125 (eksklusif)
  const d = S.applyFilters(rows, S.PRESETS.DIVIDEND.filters);
  assert.deepEqual(d.pass.map(r => r.ticker), ['AAA']);  // CCC payout 125% ditolak, BBB tanpa dividen
  const h = S.applyFilters(rows, S.PRESETS.HEALTH.filters);
  assert.deepEqual(h.pass.map(r => r.ticker), ['AAA']);
  assert.match(S.PRESETS.HEALTH.note, /SUBSET/);
  const none = S.applyFilters(rows, { roe: { min: null, max: NaN } });
  assert.equal(none.pass.length, 3);                    // filter kosong = tidak aktif
  /* Value butuh harga: tanpa P/E nyata tidak ada yang lolos, semuanya dihitung "data kurang" */
  const v = S.applyFilters(rows, S.PRESETS.VALUE.filters);
  assert.equal(v.pass.length, 0);
  assert.equal(v.missing, 3);
  const withPe = rows.map(r => S.computeMetrics({ ...r }, r.ticker === 'AAA' ? { pe: 12 } : {}));
  assert.deepEqual(S.applyFilters(withPe, S.PRESETS.VALUE.filters).pass.map(r => r.ticker), ['AAA']);
});

test('sortRows: nilai kosong selalu di bawah, kedua arah', () => {
  const rows = S.joinFrames(frames(), 2025).map(r => S.computeMetrics(r));
  assert.deepEqual(S.sortRows(rows, 'revGrowth', 'desc').map(r => r.ticker)[0], 'AAA');
  assert.deepEqual(S.sortRows(rows, 'payout', 'asc').map(r => r.ticker), ['AAA', 'CCC', 'BBB']);
  assert.deepEqual(S.sortRows(rows, 'payout', 'desc').map(r => r.ticker), ['CCC', 'AAA', 'BBB']);
  assert.deepEqual(S.sortRows(rows, 'ticker', 'asc').map(r => r.ticker), ['AAA', 'BBB', 'CCC']);
});

test('momentum: butuh riwayat yang benar-benar menjangkau 6 bulan', () => {
  const day = 86400, t0 = 1.7e9;
  const bars = Array.from({ length: 300 }, (_, i) => ({ time: t0 + i * day, close: 100 + i }));
  const m = S.momentum(bars);
  const last = bars[299], base = bars[299 - 182];
  close(m.value, last.close / base.close - 1);
  assert.equal(m.from, base.time);
  assert.equal(S.momentum(bars.slice(-100)), null);
  assert.equal(S.momentum([]), null);
  assert.equal(S.momentum([{ time: t0, close: NaN }, { time: t0 + day, close: 1 }]), null);
});
