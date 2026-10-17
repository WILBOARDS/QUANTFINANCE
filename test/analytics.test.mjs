/* Uji kalkulasi analitik (dihitung tangan). Jalankan: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../shared/analytics.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('analyzeHeadline: tema, spekulasi, sentimen, skor dampak transparan', () => {
  const now = Date.parse('2026-10-05T10:00:00Z');
  const x = A.analyzeHeadline('Oil prices could surge as Strait of Hormuz tanker attack fuels war fears', '2026-10-05T09:00:00Z', now);
  const ids = x.themes.map(t => t.id);
  assert.ok(ids.includes('energy') && ids.includes('shipping') && ids.includes('conflict'));
  assert.equal(x.primary, 'conflict');
  assert.equal(x.speculative, true);
  assert.equal(x.sentiment.label, 'negatif');
  // tema: conflict 30 + energy 22*0.6 = 43.2 -> 43; kata keras: war, surge = 16; kebaruan <3 jam = 10
  assert.equal(x.impactParts.tema, 43);
  assert.equal(x.impactParts.kataKeras, 16);
  assert.equal(x.impactParts.kebaruan, 10);
  assert.equal(x.impact, Math.round(43.2 + 16 + 10));
});
test('analyzeHeadline: judul Indonesia dikenali', () => {
  const x = A.analyzeHeadline('Bank Indonesia diperkirakan pangkas suku bunga, rupiah menguat');
  assert.ok(x.themes.some(t => t.id === 'monetary'));
  assert.ok(x.themes.some(t => t.id === 'currency'));
  assert.equal(x.speculative, true);
  assert.equal(x.sentiment.label, 'positif');
});
test('analyzeHeadline: judul netral tanpa tema', () => {
  const x = A.analyzeHeadline('Local museum opens new wing');
  assert.equal(x.themes.length, 0);
  assert.equal(x.primary, 'other');
  assert.equal(x.impact, 0);
});
test('summarizeNews menghitung tema dan daftar spekulatif', () => {
  const s = A.summarizeNews([{ title: 'Inflation could rise again' }, { title: 'Inflation eases in September' }, { title: 'Museum opens' }]);
  assert.equal(s.total, 3);
  assert.equal(s.themes[0].id, 'inflation');
  assert.equal(s.themes[0].n, 2);
  assert.equal(s.speculative.length, 1);
});
test('countryScore: rumus linear, komponen tanpa data dilewati, butuh minimal 3 kelompok', () => {
  const s = A.countryScore({ growth: 5, unemp: 5, infl: 2.5, debt: 40, fiscal: -2, ca: 0, reservesMonths: 8, polstab: 0 });
  const g = Object.fromEntries(s.groups.map(x => [x.id, x.score]));
  // growth 50+10*3=80, unemp 100-7*2=86 -> 83; debt 100, fiscal 70-16=54 -> 77; infl 100; ca 60, res 100 -> 80; polstab 50
  assert.equal(g.economic, 83);
  assert.equal(g.fiscal, 77);
  assert.equal(g.monetary, 100);
  assert.equal(g.external, 80);
  assert.equal(g.political, 50);
  assert.equal(s.total, Math.round((83 + 77 + 100 + 80 + 50) / 5));
  const partial = A.countryScore({ growth: 2, infl: null });
  assert.equal(partial.total, null, 'satu kelompok saja tidak cukup untuk skor total');
  assert.equal(A.countryScore({ growth: 30, infl: 2.5, debt: 0 }).groups[0].score, 100, 'dibatasi 0-100');
});
test('statistik risiko: return, volatilitas, drawdown, VaR', () => {
  const p = [100, 110, 99, 108.9, 98.01, 107.811, 97.0299, 106.73289, 96.059601, 105.6655611, 95.09900499];
  const r = A.returns(p);
  close(r[0], 0.1); close(r[1], -0.1);
  close(A.maxDrawdown([100, 120, 90, 130, 65]), -0.5);
  const s = A.riskStats(p, { periodsPerYear: 252 });
  assert.equal(s.n, 10);
  assert.ok(s.var95 < 0 && s.cvar95 <= s.var95);
  assert.equal(A.riskStats([1, 2, 3]), null, 'data terlalu sedikit -> null');
});
test('korelasi dan beta', () => {
  const a = [1, 2, 3, 4, 5, 6], b = [2, 4, 6, 8, 10, 12], c = [6, 5, 4, 3, 2, 1];
  close(A.correlation(a, b), 1);
  close(A.correlation(a, c), -1);
  const x = Array.from({ length: 20 }, (_, i) => Math.sin(i)), y = x.map(v => 2 * v);
  close(A.beta(y, x), 2);
  assert.ok(Number.isNaN(A.correlation([1, 2], [3, 4])));
});
test('alignSeries hanya memakai tanggal yang sama', () => {
  const r = A.alignSeries({ a: [{ date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 2 }], b: [{ date: '2026-01-02', value: 5 }, { date: '2026-01-03', value: 6 }] });
  assert.deepEqual(r.dates, ['2026-01-02']);
  assert.deepEqual(r.cols, { a: [2], b: [5] });
});
test('rezim pasar: bukti dan keyakinan', () => {
  const off = A.marketRegime({ vix: 32, hyOas: 6, curve2s10s: -0.5, sp500VsMa200: -0.08, dxyChg1m: 0.03, oilChg1m: 0.2 });
  assert.equal(off.regime, 'Risk off');
  assert.equal(off.evidence.length, 6);
  const on = A.marketRegime({ vix: 13, hyOas: 3, curve2s10s: 0.6, sp500VsMa200: 0.07 });
  assert.equal(on.regime, 'Risk on');
  assert.equal(A.marketRegime({}).regime, 'Tidak diketahui');
});
test('uji tekanan memakai asumsi sensitivitas yang tertulis', () => {
  const r = A.stressTest([{ cls: 'equity', value: 100 }, { cls: 'bond', value: 100 }], 'rates+100');
  close(r.total, 100 * -0.07 + 100 * -0.065);
  close(r.pct, r.total / 200);
  assert.equal(A.stressTest([], 'tidak-ada'), null);
});
test('kata kunci utuh: "war" tidak cocok dengan "warns", "oil" tidak cocok dengan "turmoil"', () => {
  const x = A.analyzeHeadline('Central bank warns of turmoil in support levels');
  assert.ok(!x.themes.some(t => t.id === 'conflict'));
  assert.ok(!x.themes.some(t => t.id === 'energy'));
  assert.ok(!x.themes.some(t => t.id === 'shipping'), '"support" bukan "port"');
  const y = A.analyzeHeadline('New sanctions after wars and S&P 500 slump');
  assert.ok(y.themes.some(t => t.id === 'sanctions'));
  assert.ok(y.themes.some(t => t.id === 'conflict'));
  assert.ok(y.themes.some(t => t.id === 'markets'));
});
