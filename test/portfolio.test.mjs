/* Tes portofolio & risiko (shared/portfolio.mjs). Angka uji dihitung tangan. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../shared/portfolio.mjs';

const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('parseCsv: kutip, koma di dalam kutip, CRLF, BOM, baris kosong', () => {
  const r = P.parseCsv('﻿ticker,quantity\r\n"AAPL",10\r\n\r\n"BRK, B",2\n"a""b",1');
  assert.deepEqual(r, [['ticker', 'quantity'], ['AAPL', '10'], ['BRK, B', '2'], ['a"b', '1']]);
});

test('parseNum: format Indonesia dan Inggris', () => {
  assert.equal(P.parseNum('1.234,5'), 1234.5);
  assert.equal(P.parseNum('1,234.5'), 1234.5);
  assert.equal(P.parseNum('12,5'), 12.5);
  assert.equal(P.parseNum("'250"), 250);
  assert.equal(P.parseNum('=1+1'), null);
  assert.equal(P.parseNum(''), null);
});

test('holdingsFromCsv: header dikenali, baris salah dilaporkan, injeksi rumus tidak dieksekusi', () => {
  const { holdings, errors } = P.holdingsFromCsv('kode;jumlah;harga_rata;mata_uang\nAAPL;10;150,5;USD\nBTC;0,5;;\n=CMD();1;1;USD\nEURUSD;-1;1;USD\nBBCA;100;9.000;IDR');
  assert.deepEqual(holdings, [{ symbol: 'AAPL', qty: 10, avg: 150.5, cur: 'USD' }, { symbol: 'BTC', qty: 0.5, avg: null, cur: null }, { symbol: 'BBCA', qty: 100, avg: 9000, cur: 'IDR' }]);
  assert.deepEqual(errors, ['baris 4: kode tidak sah', 'baris 5: jumlah harus > 0']);
  assert.match(P.holdingsFromCsv('a,b\n1,2').errors[0], /Header wajib/);
});

test('pnl dan allocation', () => {
  assert.deepEqual(P.pnl(10, 100, 120), { value: 1200, cost: 1000, abs: 200, pct: 20 });
  assert.deepEqual(P.pnl(10, null, 120), { value: 1200, cost: null, abs: null, pct: null });
  assert.equal(P.pnl(10, 100, NaN).value, null);
  const a = P.allocation([{ key: 'stock', value: 300 }, { key: 'crypto', value: 100 }, { key: 'stock', value: 100 }, { key: 'x', value: NaN }]);
  assert.deepEqual(a, [{ key: 'stock', value: 400, share: 0.8 }, { key: 'crypto', value: 100, share: 0.2 }]);
});

test('align + returns: hanya tanggal milik semua, imbal hasil sederhana', () => {
  const A = P.dailyCloses([{ time: Date.UTC(2026, 0, 1) / 1000, close: 100 }, { time: Date.UTC(2026, 0, 2) / 1000, close: 110 }, { time: Date.UTC(2026, 0, 3) / 1000, close: 99 }, { time: Date.UTC(2026, 0, 4) / 1000, close: 120 }]);
  const B = new Map([['2026-01-01', 50], ['2026-01-03', 55], ['2026-01-04', 44]]);
  const al = P.align({ A, B });
  assert.deepEqual(al.dates, ['2026-01-01', '2026-01-03', '2026-01-04']);
  assert.deepEqual(al.prices.A, [100, 99, 120]);
  const r = P.returns(al.prices.B);
  close(r[0], 0.1); close(r[1], -0.2);
});

test('portfolioReturns: bobot dinormalisasi', () => {
  const r = P.portfolioReturns({ a: [0.1, -0.1], b: [0, 0.2] }, { a: 300, b: 100 });
  close(r[0], 0.075); close(r[1], -0.025);
});

test('statistik: stdev sampel, vol tahunan, drawdown, VaR/ES, beta, korelasi (hitung tangan)', () => {
  const r = [0.01, -0.02, 0.03, -0.01, 0.0];
  /* rata-rata 0,002; deviasi kuadrat: 0,000064+0,000484+0,000784+0,000144+0,000004 = 0,00148; /4 = 0,00037 */
  close(P.stdev(r), Math.sqrt(0.00037));
  close(P.annualVol(r), Math.sqrt(0.00037) * Math.sqrt(252));
  /* nilai: 1,01 -> 0,9898 -> 1,019494 -> 1,00929906 -> sama; puncak 1,01; dd terdalam 0,9898/1,01 − 1 = −0,02 */
  close(P.maxDrawdown(r), 0.9898 / 1.01 - 1);
  /* 20 imbal hasil −10..9 (%) ; kuantil 5% lower = urutan ke-floor(0,05×19)=0 -> −0,10 ; ES = rata-rata ≤ −0,10 = 0,10 */
  const r20 = Array.from({ length: 20 }, (_, i) => (i - 10) / 100);
  const v = P.historicalVaR(r20, 0.95);
  close(v.var, 0.10); close(v.es, 0.10); assert.equal(v.tail, 1);
  const v90 = P.historicalVaR(r20, 0.9);       // floor(0,1×19)=1 -> −0,09 ; ekor {−0,10, −0,09} -> ES 0,095
  close(v90.var, 0.09); close(v90.es, 0.095);
  const bench = [0.01, -0.01, 0.02, 0.0, -0.02];
  close(P.beta(bench.map(x => 2 * x), bench), 2);
  close(P.correlation(bench, bench.map(x => -3 * x + 0.001)), -1);
  const cm = P.corrMatrix({ a: bench, b: bench.map(x => 2 * x) });
  assert.deepEqual(cm.ids, ['a', 'b']);
  close(cm.m[0][1], 1);
  assert.ok(Number.isNaN(P.correlation([1, 1, 1], [1, 2, 3])));
});
