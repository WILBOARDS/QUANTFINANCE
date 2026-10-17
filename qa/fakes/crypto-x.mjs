/* =====================================================================
   PALSU-UNTUK-UJI: Binance aggTrades, Binance USD-M futures, mempool.space.
   HANYA untuk qa/e2e.mjs dan tes server (sandbox tanpa internet). Format JSON meniru
   dokumentasi resmi; angka dari generator berbenih, BUKAN data pasar asli.
   ===================================================================== */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(String(seed)); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const json = (o, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(o) });
const BASE = { BTCUSDT: 97100, ETHUSDT: 3590, SOLUSDT: 194, BNBUSDT: 719 };
const priceOf = s => BASE[s] || 10;

function aggTrades(sym, limit) {
  const r = rng('agg' + sym + Math.floor(Date.now() / 60000));
  const now = Date.now(), n = Math.min(limit, 500), out = [];
  let p = priceOf(sym), id = 3000000000;
  for (let i = n - 1; i >= 0; i--) {
    p *= 1 + (r() - 0.5) * 0.0004;
    /* sebagian kecil transaksi besar supaya bagian "Transaksi besar" teruji */
    const big = r() < 0.03;
    const qty = (big ? 300000 + r() * 900000 : 50 + r() * 20000) / p;
    out.push({ a: id++, p: p.toFixed(2), q: qty.toFixed(5), f: id * 2, l: id * 2 + 1, T: now - i * 400, m: r() < 0.5, M: true });
  }
  return json(out);
}
function futures(url) {
  const s = url.searchParams.get('symbol') || '';
  if (!/^[A-Z0-9]{5,12}$/.test(s)) return json({ code: -1121, msg: 'Invalid symbol.' }, 400);
  if (!BASE[s]) return json({ code: -1121, msg: 'Invalid symbol.' }, 400);
  const now = Date.now(), p = priceOf(s), r = rng('fut' + s);
  if (url.pathname === '/fapi/v1/premiumIndex') return json({ symbol: s, markPrice: (p * 1.0002).toFixed(2), indexPrice: p.toFixed(2), estimatedSettlePrice: p.toFixed(2), lastFundingRate: (0.00005 + r() * 0.0001).toFixed(8), interestRate: '0.00010000', nextFundingTime: Math.ceil(now / 28800000) * 28800000, time: now });
  if (url.pathname === '/fapi/v1/openInterest') return json({ openInterest: (80000 + r() * 5000).toFixed(3), symbol: s, time: now });
  if (url.pathname === '/futures/data/openInterestHist') {
    const per = url.searchParams.get('period') === '4h' ? 4 : 1, lim = Math.min(+url.searchParams.get('limit') || 30, 500);
    let oi = 78000;
    return json(Array.from({ length: lim }, (_, i) => { oi *= 1 + (r() - 0.48) * 0.01; return { symbol: s, sumOpenInterest: oi.toFixed(5), sumOpenInterestValue: (oi * p).toFixed(2), timestamp: now - (lim - 1 - i) * per * 3600e3 }; }));
  }
  return json({ code: -5000, msg: 'Path not found' }, 404);
}
function mempool(url) {
  const now = Math.floor(Date.now() / 1000);
  if (url.pathname === '/api/v1/fees/recommended') return json({ fastestFee: 9, halfHourFee: 7, hourFee: 5, economyFee: 3, minimumFee: 1 });
  if (url.pathname === '/api/blocks') return json(Array.from({ length: 10 }, (_, i) => ({ id: (hash('b' + i).toString(16).padStart(8, '0')).repeat(8), height: 920000 - i, version: 536870912, timestamp: now - i * 590 - 120, tx_count: 2500 + i * 37, size: 1500000 + i * 1000, weight: 3990000, merkle_root: '0'.repeat(64), previousblockhash: '0'.repeat(64), mediantime: now - i * 600, nonce: 1, bits: 1, difficulty: 1 })));
  if (url.pathname === '/api/mempool') return json({ count: 41234, vsize: 21000000, total_fee: 15000000, fee_histogram: [[5, 100000]] });
  return { status: 404, type: 'text/plain', body: 'Not Found' };
}

export default function cryptoX(url) {
  const h = url.hostname;
  if ((h === 'api.binance.com' || h === 'data-api.binance.vision') && url.pathname === '/api/v3/aggTrades') {
    const s = url.searchParams.get('symbol') || '';
    if (!BASE[s]) return json({ code: -1121, msg: 'Invalid symbol.' }, 400);
    return aggTrades(s, +url.searchParams.get('limit') || 500);
  }
  if (h === 'fapi.binance.com') return futures(url);
  if (h === 'mempool.space') return mempool(url);
  return null;
}
