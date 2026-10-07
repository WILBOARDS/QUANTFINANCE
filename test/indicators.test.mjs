/* Uji indikator teknikal (shared/indicators.mjs). Semua nilai harapan dihitung tangan;
   hitungannya ditulis di komentar supaya bisa dicek ulang tanpa komputer. Jalankan: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../shared/indicators.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} != ${b}`);
const nearArr = (got, want, eps = 1e-9) => {
  assert.equal(got.length, want.length, 'panjang larik harus sama dengan masukan');
  want.forEach((w, i) => (w === null ? assert.equal(got[i], null, `indeks ${i} harus null, dapat ${got[i]}`) : near(got[i], w, eps)));
};
const allNull = a => assert.ok(a.every(v => v === null), 'semua harus null: ' + JSON.stringify(a));
/* bar uji: time dalam detik UTC */
const bar = (time, open, high, low, close, volume) => ({ time, open, high, low, close, volume });
const closeOnlyBars = closes => closes.map((c, i) => bar(i * 86400, c, c, c, c, 0));   // bentuk FRED di Quotes.history

test('sma: rata-rata jendela, pemanasan null, lubang tidak ditambal', () => {
  // [1,2,3,4,5], n=3 -> (1+2+3)/3=2, (2+3+4)/3=3, (3+4+5)/3=4
  nearArr(I.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  // lubang di indeks 2: jendela yang memuatnya null; (4+5)/2=4.5, (5+6)/2=5.5
  nearArr(I.sma([1, 2, null, 4, 5, 6], 2), [null, 1.5, null, null, 4.5, 5.5]);
  // SMA20 dari 1..20: (1+20)/2 = 10.5 tepat di bar ke-20
  const s20 = I.sma(Array.from({ length: 20 }, (_, i) => i + 1), 20);
  near(s20[19], 10.5); allNull(s20.slice(0, 19));
  allNull(I.sma([1, 2, 3], 5));                           // data kurang -> semua null
  allNull(I.sma(Array.from({ length: 49 }, (_, i) => i), 50));
});

test('ema: awal = SMA n nilai pertama, lalu k = 2/(n+1)', () => {
  // n=3 -> k=0.5. awal (10+11+12)/3 = 11; 10*0.5+11*0.5 = 10.5; 14*0.5+10.5*0.5 = 12.25
  nearArr(I.ema([10, 11, 12, 10, 14], 3), [null, null, 11, 10.5, 12.25]);
  // EMA20 dari 1..21: awal SMA(1..20)=10.5; berikutnya 21*(2/21) + 10.5*(19/21) = 2 + 9.5 = 11.5
  const e = I.ema(Array.from({ length: 21 }, (_, i) => i + 1), 20);
  near(e[19], 10.5); near(e[20], 11.5); allNull(e.slice(0, 19));
  // nilai kosong di depan (mis. garis MACD saat pemanasan) dilewati, awal tetap SMA n nilai valid
  nearArr(I.ema([null, null, 2, 4, 6], 2), [null, null, null, 3, 5]);  // awal (2+4)/2=3; 6*(2/3)+3*(1/3)=5
  allNull(I.ema([1, 2], 3));
});

test('rsi: penghalusan Wilder, dihitung tangan dengan n=3', () => {
  // penutupan 10,11,12,11,13,12 -> perubahan +1,+1,−1,+2,−1
  // bar 3: naik (1+1+0)/3=2/3, turun (0+0+1)/3=1/3, RS=2 -> 100−100/3 = 66.666…
  // bar 4 (+2): naik (2/3·2+2)/3=10/9, turun (1/3·2+0)/3=2/9, RS=5 -> 100−100/6 = 83.333…
  // bar 5 (−1): naik (10/9·2)/3=20/27, turun (2/9·2+1)/3=13/27, RS=20/13 -> 100−100·13/33 = 60.6060…
  nearArr(I.rsi([10, 11, 12, 11, 13, 12], 3), [null, null, null, 100 - 100 / 3, 100 - 100 / 6, 100 - 100 * 13 / 33]);
  // RSI14 butuh 15 penutupan (14 perubahan). 14 penutupan -> semua null
  allNull(I.rsi(Array.from({ length: 14 }, (_, i) => i + 1), 14));
  // naik terus 15 bar: rata-rata turun 0 -> RSI 100 tepat di bar ke-15
  const up = I.rsi(Array.from({ length: 15 }, (_, i) => i + 1), 14);
  assert.equal(up[14], 100); allNull(up.slice(0, 14));
  // harga datar: naik dan turun 0 -> tidak terdefinisi (null), bukan 50 karangan
  allNull(I.rsi(new Array(20).fill(5), 14));
});

test('macd: garis, sinyal, histogram (n kecil dihitung tangan) + pemanasan bawaan 12/26/9', () => {
  // penutupan 2,4,6,4,8,10 dengan fast=2 (k=2/3), slow=3 (k=1/2), signal=2 (k=2/3)
  // EMA2: awal (2+4)/2=3; 6·2/3+3/3=5; 4·2/3+5/3=13/3; 8·2/3+13/9=61/9; 10·2/3+61/27=241/27
  // EMA3: awal (2+4+6)/3=4; 4/2+4/2=4; 8/2+4/2=6; 10/2+6/2=8
  // MACD: 5−4=1; 13/3−4=1/3; 61/9−6=7/9; 241/27−8=25/27
  // sinyal: awal (1+1/3)/2=2/3; 7/9·2/3+2/3·1/3=20/27; 25/27·2/3+20/27·1/3=70/81
  // histogram: 1/3−2/3=−1/3; 7/9−20/27=1/27; 25/27−70/81=5/81
  const m = I.macd([2, 4, 6, 4, 8, 10], 2, 3, 2);
  nearArr(m.macd, [null, null, 1, 1 / 3, 7 / 9, 25 / 27]);
  nearArr(m.signal, [null, null, null, 2 / 3, 20 / 27, 70 / 81]);
  nearArr(m.hist, [null, null, null, -1 / 3, 1 / 27, 5 / 81]);
  // bawaan 12/26/9: garis MACD mulai bar ke-26 (indeks 25), sinyal mulai bar ke-34 (indeks 33)
  const xs = Array.from({ length: 34 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
  const d = I.macd(xs);
  assert.equal(d.macd[24], null); assert.notEqual(d.macd[25], null);
  assert.equal(d.signal[32], null); assert.notEqual(d.signal[33], null);
  allNull(I.macd(xs.slice(0, 33)).signal);
  allNull(I.macd(xs.slice(0, 25)).macd);
});

test('bollinger: simpangan baku POPULASI jendela', () => {
  // n=3, k=2. Jendela [1,2,3]: tengah 2, var ((−1)²+0+1²)/3 = 2/3, sd = √(2/3)
  // jendela [3,4,8]: tengah 5, var (4+1+9)/3 = 14/3, sd = √(14/3)
  const b = I.bollinger([1, 2, 3, 4, 8], 3, 2);
  nearArr(b.mid, [null, null, 2, 3, 5]);
  near(b.upper[2], 2 + 2 * Math.sqrt(2 / 3)); near(b.lower[2], 2 - 2 * Math.sqrt(2 / 3));
  near(b.upper[4], 5 + 2 * Math.sqrt(14 / 3)); near(b.lower[4], 5 - 2 * Math.sqrt(14 / 3));
  near(b.sd[3], Math.sqrt(2 / 3));                       // jendela [2,3,4] juga sd √(2/3)
  allNull(I.bollinger([1, 2, 3], 20, 2).upper);
});

test('vwap: kumulatif sejak bar pertama, volume kosong = null, reset harian UTC', () => {
  const bars = [
    bar(0, 10, 11, 9, 10, 100),       // tipikal (11+9+10)/3=10 -> Σpv=1000, Σv=100 -> 10
    bar(3600, 11, 12, 10, 11, 0),     // volume 0 -> null, tidak dijumlah
    bar(7200, 12, 13, 11, 12, 300),   // tipikal 12 -> Σpv=1000+3600=4600, Σv=400 -> 11.5
    bar(86400, 12, 13, 11, 12),       // volume undefined -> null (hari UTC baru dimulai di sini)
    bar(90000, 9, 10, 8, 9, 100),     // tipikal 9 -> Σpv=5500, Σv=500 -> 11
  ];
  nearArr(I.vwap(bars), [10, null, 11.5, null, 11]);
  // reset per hari UTC (grafik 1D): bar terakhir ada di hari ke-1 -> hanya dirinya: 900/100 = 9
  nearArr(I.vwap(bars, { resetDaily: true }), [10, null, 11.5, null, 9]);
  allNull(I.vwap(bars, { closeOnly: true }));
  allNull(I.vwap(closeOnlyBars([1, 2, 3])));             // FRED: volume 0 -> tidak ada VWAP
});

test('atr: true range butuh penutupan sebelumnya, Wilder n=3 dihitung tangan', () => {
  const bars = [
    bar(0, 9, 10, 8, 9),
    bar(1, 9, 11, 9, 10),     // TR = maks(2, |11−9|=2, |9−9|=0) = 2
    bar(2, 10, 12, 10, 11),   // TR = maks(2, 2, 0) = 2
    bar(3, 11, 15, 11, 14),   // TR = maks(4, 4, 0) = 4
    bar(4, 14, 14, 12, 13),   // TR = maks(2, 0, 2) = 2
    bar(5, 18, 20, 18, 19),   // TR = maks(2, |20−13|=7, |18−13|=5) = 7 (celah naik)
  ];
  nearArr(I.trueRange(bars), [null, 2, 2, 4, 2, 7]);
  // ATR3 pertama = (2+2+4)/3 = 8/3; lalu (8/3·2+2)/3 = 22/9; lalu (22/9·2+7)/3 = 107/27
  nearArr(I.atr(bars, 3), [null, null, null, 8 / 3, 22 / 9, 107 / 27]);
  // ATR14 butuh 15 bar
  const many = Array.from({ length: 14 }, (_, i) => bar(i, 10, 11, 9, 10));
  allNull(I.atr(many, 14));
  allNull(I.atr(bars, 3, { closeOnly: true }));
});

test('volumeAvg: volume 0/undefined bukan nol sungguhan', () => {
  // n=3: (100+200+300)/3 = 200; jendela yang memuat 0 -> null; (500+600+700)/3 = 600
  nearArr(I.volumeAvg([100, 200, 300, 0, 500, 600, 700], 3), [null, null, 200, null, null, null, 600]);
  allNull(I.volumeAvg([undefined, undefined, undefined], 2));
});

test('compute: data kurang -> alasan jelas, semua garis kosong', () => {
  const bars = Array.from({ length: 7 }, (_, i) => bar(i * 3600, 10 + i, 11 + i, 9 + i, 10.5 + i, 50));
  const r = I.compute('rsi14', bars);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'RSI14 butuh minimal 15 bar; tersedia 7');
  assert.deepEqual(r.lines, {});
  assert.equal(I.compute('sma50', bars).reason, 'SMA50 butuh minimal 50 bar; tersedia 7');
  assert.equal(I.compute('macd', bars).reason, 'MACD(12,26,9) butuh minimal 34 bar; tersedia 7');
  assert.equal(I.compute('apa', bars).ok, false);
  // MIN_BARS dan META konsisten untuk semua indikator
  for (const m of I.META) { assert.ok(I.MIN_BARS[m.id] >= 1, m.id); for (const k of ['label', 'period', 'formula', 'basis']) assert.ok(m[k], m.id + ' ' + k); }
});

test('compute: closeOnly (FRED) -> ATR/VWAP/volume tidak tersedia dengan alasan, sisanya jalan', () => {
  const bars = closeOnlyBars(Array.from({ length: 60 }, (_, i) => 4 + Math.sin(i / 4) * 0.3));
  assert.equal(I.isCloseOnly(bars), true);
  const a = I.compute('atr14', bars, { closeOnly: true });
  assert.equal(a.ok, false); assert.match(a.reason, /ATR14 butuh high\/low/);
  const v = I.compute('vwap', bars, { closeOnly: true });
  assert.equal(v.ok, false); assert.match(v.reason, /butuh volume/);
  assert.match(I.compute('vol20', bars).reason, /butuh volume/);
  // tanpa bendera pun terdeteksi: high = low = close di semua bar
  assert.match(I.compute('atr14', bars).reason, /butuh high\/low/);
  for (const id of ['sma20', 'sma50', 'ema20', 'bb20', 'rsi14', 'macd']) {
    const r = I.compute(id, bars, { closeOnly: true });
    assert.equal(r.ok, true, id + ': ' + r.reason);
    assert.equal(r.lastIndex, 59);
    for (const val of Object.values(r.last)) assert.ok(Number.isFinite(val), id);
  }
  // OHLC tanpa volume (mis. CoinGecko OHLC): ATR jalan, VWAP tidak
  const noVol = Array.from({ length: 20 }, (_, i) => bar(i * 86400, 10, 11 + (i % 3), 9, 10 + (i % 2)));
  assert.equal(I.compute('atr14', noVol).ok, true);
  assert.equal(I.compute('vwap', noVol).reason, 'VWAP butuh volume; sumber ini tidak memberi volume');
});

test('compute: nilai terakhir dan bacaan berbasis aturan (bukan rekomendasi)', () => {
  const up = Array.from({ length: 30 }, (_, i) => bar(i * 86400, 100 + i, 101 + i, 99 + i, 100 + i, 1000));
  const r = I.compute('rsi14', up);
  assert.equal(r.ok, true); assert.equal(r.last.rsi, 100); assert.equal(r.lastIndex, 29);
  assert.equal(I.interpret(r, up), 'Jenuh beli menurut ambang umum 70.');
  const down = up.map((b, i) => ({ ...b, close: 200 - i }));
  assert.equal(I.interpret(I.compute('rsi14', down), down), 'Jenuh jual menurut ambang umum 30.');
  // SMA20 dari 100..129 di bar terakhir = (110+…+129)/20 = 119.5; penutupan 129 -> +7.9%
  const s = I.compute('sma20', up);
  near(s.last.sma, 119.5);
  assert.equal(I.interpret(s, up), 'Penutupan di atas SMA20 (+7.9%).');
  // volume bar terakhir 3000 vs rata-rata (19×1000+3000)/20 = 1100 -> 2.73×
  const spike = up.map((b, i) => (i === 29 ? { ...b, volume: 3000 } : b));
  assert.equal(I.interpret(I.compute('vol20', spike), spike), 'Volume bar terakhir 2.73× rata-rata 20 bar (jauh di atas rata-rata).');
  // ATR: semua TR = maks(2, |H−C_prev|=2, |L−C_prev|=0) = 2 -> 2/129 = 1.55%
  assert.equal(I.interpret(I.compute('atr14', up), up), 'Rentang rata-rata per bar ≈ 1.55% dari harga penutupan.');
  assert.equal(I.interpret({ ok: false }, up), '');
});

test('barSeconds/barLabel: label lebar bar dari median selisih waktu', () => {
  assert.equal(I.barSeconds([{ time: 0 }, { time: 300 }, { time: 600 }, { time: 1200 }]), 300);
  assert.equal(I.barSeconds([{ time: 0 }]), null);
  assert.equal(I.barLabel(300), '5 menit');
  assert.equal(I.barLabel(14400), '4 jam');
  assert.equal(I.barLabel(86400), 'harian');
  assert.equal(I.barLabel(604800), 'mingguan');
  assert.equal(I.barLabel(null), 'bar');
});
