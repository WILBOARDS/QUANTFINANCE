/* Tes data kripto tambahan (shared/cryptox.mjs). Angka uji dihitung tangan. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../shared/cryptox.mjs';

const AGG = [
  { a: 3, p: '60000.00', q: '5.0', f: 1, l: 2, T: 1700000002000, m: false, M: true },   // 300.000 taker beli
  { a: 1, p: '60000.00', q: '0.5', f: 1, l: 1, T: 1700000000000, m: true, M: true },    // 30.000 taker jual
  { a: 2, p: '59990.00', q: '10', f: 1, l: 1, T: 1700000001000, m: true, M: true },     // 599.900 taker jual
  { a: 4, p: 'x', q: '1', T: 1700000003000, m: true },                                  // rusak: dibuang
  { a: 5, p: '60000', q: '1', T: 1700000004000 },                                       // tanpa m: dibuang
];

test('parseAggTrades: m=true berarti taker jual, urut waktu, baris rusak dibuang', () => {
  const t = X.parseAggTrades(AGG);
  assert.equal(t.length, 3);
  assert.deepEqual(t.map(x => x.id), [1, 2, 3]);
  assert.deepEqual(t.map(x => x.side), ['sell', 'sell', 'buy']);
  assert.equal(t[1].quote, 599900);
  assert.throws(() => X.parseAggTrades({}), /larik/);
});

test('largeTrades & takerFlow: ambang dan pembagian sisi', () => {
  const t = X.parseAggTrades(AGG);
  assert.deepEqual(X.largeTrades(t, 250000).map(x => x.id), [3, 2]);
  assert.deepEqual(X.largeTrades(t, 1e6), []);
  assert.deepEqual(X.largeTrades(t, 0), []);
  const f = X.takerFlow(t);
  assert.equal(f.buy, 300000);
  assert.equal(f.sell, 629900);
  assert.equal(f.total, 929900);
  assert.equal(f.n, 3);
  assert.ok(Math.abs(f.buyShare - 300000 / 929900) < 1e-12);
  assert.equal(X.takerFlow([]).buyShare, null);
  assert.equal(X.defaultThreshold('BTCUSDT'), 250000);
  assert.equal(X.defaultThreshold('SOLUSDT'), 50000);
});

test('funding disetahunkan: 0,01% per 8 jam = 10,95% per tahun', () => {
  assert.ok(Math.abs(X.annualizeFunding(0.0001) - 10.95) < 1e-9);
  assert.ok(Math.abs(X.annualizeFunding(0.0001, 6) - 21.9) < 1e-9);
  assert.equal(X.annualizeFunding(null), null);
  const p = X.parsePremium({ symbol: 'BTCUSDT', markPrice: '60010.5', indexPrice: '60000.1', lastFundingRate: '0.00010000', nextFundingTime: 1700006400000, time: 1700000000000 });
  assert.equal(p.fundingRate, 0.0001);
  assert.throws(() => X.parsePremium({ symbol: 'x' }), /simbol/);
});

test('open interest: parse, riwayat, perubahan', () => {
  assert.deepEqual(X.parseOpenInterest({ symbol: 'BTCUSDT', openInterest: '80000.5', time: 1 }), { symbol: 'BTCUSDT', oi: 80000.5, time: 1 });
  const h = X.parseOiHist([{ symbol: 'BTCUSDT', sumOpenInterest: '110', sumOpenInterestValue: '6600000', timestamp: 2000 }, { symbol: 'BTCUSDT', sumOpenInterest: '100', sumOpenInterestValue: '6000000', timestamp: 1000 }]);
  assert.deepEqual(h.map(x => x.time), [1000, 2000]);
  const c = X.oiChange(h);
  assert.equal(c.abs, 10);
  assert.ok(Math.abs(c.pct - 10) < 1e-12);
  assert.equal(X.oiChange(h.slice(0, 1)), null);
});

test('mempool.space: fees, blocks, mempool, jarak blok', () => {
  assert.deepEqual(X.parseFees({ fastestFee: 12, halfHourFee: 10, hourFee: 8, economyFee: 4, minimumFee: 2 }), { fastestFee: 12, halfHourFee: 10, hourFee: 8, economyFee: 4, minimumFee: 2 });
  assert.throws(() => X.parseFees({}), /tidak dikenal/);
  const b = X.parseBlocks([{ id: 'a'.repeat(64), height: 102, timestamp: 1200, tx_count: 3000, size: 1.5e6, weight: 4e6 }, { id: 'b'.repeat(64), height: 101, timestamp: 600 }, { id: 'c'.repeat(64), height: 100, timestamp: 0 }]);
  assert.equal(b.length, 3);
  assert.equal(X.blockInterval(b), 10);           // (1200 − 0) detik ÷ 2 jarak = 600 detik = 10 menit
  assert.equal(X.parseMempool({ count: 5000, vsize: 2e6, total_fee: 1e7 }).count, 5000);
});

test('squarify: luas sebanding nilai, tidak keluar batas, nilai <= 0 dibuang', () => {
  const items = [{ k: 'a', value: 6 }, { k: 'b', value: 6 }, { k: 'c', value: 4 }, { k: 'd', value: 3 }, { k: 'e', value: 2 }, { k: 'f', value: 2 }, { k: 'g', value: 1 }, { k: 'h', value: 0 }, { k: 'i', value: NaN }];
  const r = X.squarify(items, 0, 0, 6, 4);
  assert.equal(r.length, 7);
  const area = r.reduce((s, z) => s + z.w * z.h, 0);
  assert.ok(Math.abs(area - 24) < 1e-9);
  for (const z of r) {
    assert.ok(Math.abs(z.w * z.h - z.value) < 1e-9, z.k);               // total nilai 24 = luas 24
    assert.ok(z.x >= -1e-9 && z.y >= -1e-9 && z.x + z.w <= 6 + 1e-9 && z.y + z.h <= 4 + 1e-9, z.k);
  }
  assert.deepEqual(X.squarify([], 0, 0, 10, 10), []);
});

test('changeColor: datar abu-abu, jenuh pada batas', () => {
  assert.equal(X.changeColor(0), '#2a3a4c');
  assert.equal(X.changeColor(10), X.changeColor(5));
  assert.notEqual(X.changeColor(-3), X.changeColor(3));
  assert.equal(X.changeColor(NaN), '#2a3a4c');
});
