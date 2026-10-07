/* =====================================================================
   DATA KRIPTO TAMBAHAN (murni, tanpa import; diuji di test/cryptox.test.mjs)
   Tiga jenis data yang SENGAJA dipisah dan diberi label berbeda di UI:
   - data bursa (Binance spot aggTrades),
   - data bursa derivatif (Binance USD-M futures: funding, open interest),
   - data on-chain (mempool.space, hanya Bitcoin),
   - turunan/kalkulasi aplikasi (transaksi besar, volume beli/jual, funding disetahunkan, perubahan OI).
   Semantik isBuyerMaker (field "m" aggTrades Binance):
     m = true  -> pembeli adalah maker (order beli menunggu di buku), jadi PENJUAL yang memukul
                  harga: transaksi dipicu penjual ("taker jual").
     m = false -> penjual adalah maker, PEMBELI yang memukul harga: "taker beli".
   Ini tentang siapa yang memulai transaksi di bursa itu, BUKAN identitas atau niat pelaku.
   ===================================================================== */

export const SYMBOL_RE = /^[A-Z0-9]{5,12}$/;
const num = v => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

/* aggTrades Binance [{a, p, q, f, l, T, m, M}] -> [{id, price, qty, quote, time, side}] (urut waktu) */
export function parseAggTrades(raw) {
  if (!Array.isArray(raw)) throw new Error('Format aggTrades Binance tidak dikenal (bukan larik)');
  const out = [];
  for (const t of raw) {
    const price = num(t && t.p), qty = num(t && t.q), time = num(t && t.T);
    if (price === null || qty === null || time === null || price <= 0 || qty <= 0 || typeof t.m !== 'boolean') continue;
    out.push({ id: num(t.a), price, qty, quote: price * qty, time, side: t.m ? 'sell' : 'buy' });
  }
  return out.sort((a, b) => a.time - b.time);
}

/* ambang bawaan "transaksi besar" (nilai dalam mata uang kuotasi, mis. USDT) */
export const defaultThreshold = sym => (/^(BTC|ETH)/.test(String(sym || '')) ? 250000 : 50000);

/* transaksi dengan nilai >= ambang, terbaru dulu */
export function largeTrades(trades, threshold) {
  if (!(threshold > 0)) return [];
  return (trades || []).filter(t => t.quote >= threshold).sort((a, b) => b.time - a.time);
}

/* volume per sisi taker. Hasil: { buy, sell, total, buyShare (0..1 | null), n, from, to } dalam mata uang kuotasi */
export function takerFlow(trades) {
  let buy = 0, sell = 0, n = 0, from = Infinity, to = -Infinity;
  for (const t of trades || []) {
    if (!(t.quote > 0)) continue;
    if (t.side === 'buy') buy += t.quote; else if (t.side === 'sell') sell += t.quote; else continue;
    n++; if (t.time < from) from = t.time; if (t.time > to) to = t.time;
  }
  const total = buy + sell;
  return { buy, sell, total, buyShare: total > 0 ? buy / total : null, n, from: n ? from : null, to: n ? to : null };
}

/* premiumIndex -> ringkas */
export function parsePremium(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Format premiumIndex tidak dikenal');
  const r = { symbol: String(raw.symbol || ''), markPrice: num(raw.markPrice), indexPrice: num(raw.indexPrice), fundingRate: num(raw.lastFundingRate), nextFundingTime: num(raw.nextFundingTime), time: num(raw.time) };
  if (!SYMBOL_RE.test(r.symbol)) throw new Error('premiumIndex tanpa simbol yang sah');
  return r;
}
/* funding per periode -> % per tahun. periodsPerDay bawaan 3 (interval 8 jam, standar Binance untuk
   sebagian besar kontrak; sebagian kontrak memakai 4 jam -> 6). Hasil dalam persen. */
export function annualizeFunding(rate, periodsPerDay = 3) {
  return Number.isFinite(rate) && periodsPerDay > 0 ? rate * periodsPerDay * 365 * 100 : null;
}
/* openInterest -> { symbol, oi, time } */
export function parseOpenInterest(raw) {
  const r = { symbol: String(raw && raw.symbol || ''), oi: num(raw && raw.openInterest), time: num(raw && raw.time) };
  if (r.oi === null) throw new Error('Format openInterest tidak dikenal');
  return r;
}
/* openInterestHist [{symbol, sumOpenInterest, sumOpenInterestValue, timestamp}] -> [{time, oi, value}] urut waktu */
export function parseOiHist(raw) {
  if (!Array.isArray(raw)) throw new Error('Format openInterestHist tidak dikenal');
  return raw.map(x => ({ time: num(x && x.timestamp), oi: num(x && x.sumOpenInterest), value: num(x && x.sumOpenInterestValue) }))
    .filter(x => x.time !== null && x.oi !== null).sort((a, b) => a.time - b.time);
}
/* perubahan OI dari titik pertama ke terakhir: { abs, pct, from, to } atau null */
export function oiChange(hist) {
  const h = (hist || []).filter(x => Number.isFinite(x.oi));
  if (h.length < 2) return null;
  const a = h[0], b = h[h.length - 1];
  return { abs: b.oi - a.oi, pct: a.oi > 0 ? (b.oi / a.oi - 1) * 100 : null, from: a.time, to: b.time, first: a.oi, last: b.oi };
}

/* ---------- mempool.space (Bitcoin) ---------- */
export function parseFees(raw) {
  const k = ['fastestFee', 'halfHourFee', 'hourFee', 'economyFee', 'minimumFee'];
  if (!raw || typeof raw !== 'object' || !k.some(x => Number.isFinite(raw[x]))) throw new Error('Format fees/recommended tidak dikenal');
  return Object.fromEntries(k.map(x => [x, Number.isFinite(raw[x]) ? raw[x] : null]));
}
export function parseBlocks(raw) {
  if (!Array.isArray(raw)) throw new Error('Format blocks tidak dikenal');
  return raw.filter(b => b && Number.isInteger(b.height) && Number.isFinite(b.timestamp)).slice(0, 15).map(b => ({
    height: b.height, id: /^[0-9a-f]{64}$/.test(String(b.id)) ? b.id : '', time: b.timestamp * 1000, txCount: num(b.tx_count), size: num(b.size), weight: num(b.weight),
  }));
}
export function parseMempool(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.count)) throw new Error('Format mempool tidak dikenal');
  return { count: raw.count, vsize: num(raw.vsize), totalFee: num(raw.total_fee) };
}
/* rata-rata jarak antar blok (menit) dari daftar blok terbaru */
export function blockInterval(blocks) {
  const b = (blocks || []).slice().sort((x, y) => y.height - x.height);
  if (b.length < 2) return null;
  return (b[0].time - b[b.length - 1].time) / (b.length - 1) / 60000;
}

/* ---------- treemap squarified (Bruls, Huizing, van Wijk 2000) ----------
   items: [{ value > 0, ... }] -> [{ ...item, x, y, w, h }] dalam persegi (x, y, w, h).
   Item dengan value <= 0 / bukan angka dibuang (pemanggil menampilkannya terpisah). */
export function squarify(items, x, y, w, h) {
  const list = (items || []).filter(i => Number.isFinite(i.value) && i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  const out = [];
  if (!list.length || !(w > 0) || !(h > 0)) return out;
  const scale = (w * h) / total;
  let rect = { x, y, w, h }, row = [], i = 0;
  const worst = (r, side) => {
    const s = r.reduce((a, b) => a + b.area, 0), mx = Math.max(...r.map(z => z.area)), mn = Math.min(...r.map(z => z.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const layout = r => {
    const s = r.reduce((a, b) => a + b.area, 0);
    if (rect.w >= rect.h) {
      const cw = s / rect.h; let yy = rect.y;
      for (const z of r) { const hh = z.area / cw; out.push({ ...z.item, x: rect.x, y: yy, w: cw, h: hh }); yy += hh; }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const ch = s / rect.w; let xx = rect.x;
      for (const z of r) { const ww = z.area / ch; out.push({ ...z.item, x: xx, y: rect.y, w: ww, h: ch }); xx += ww; }
      rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
    }
  };
  const nodes = list.map(item => ({ item, area: item.value * scale }));
  while (i < nodes.length) {
    const side = Math.min(rect.w, rect.h), n = nodes[i];
    if (!row.length || worst([...row, n], side) <= worst(row, side)) { row.push(n); i++; }
    else { layout(row); row = []; }
  }
  if (row.length) layout(row);
  return out;
}
/* warna perubahan %: merah (turun) .. abu (datar) .. hijau (naik), jenuh pada ±limit */
export function changeColor(pct, limit = 5) {
  if (!Number.isFinite(pct)) return '#2a3a4c';
  const t = Math.max(-1, Math.min(1, pct / limit));
  const base = [42, 58, 76], up = [26, 150, 110], dn = [200, 70, 60];
  const tgt = t >= 0 ? up : dn, k = Math.abs(t);
  return '#' + base.map((c, j) => Math.round(c + (tgt[j] - c) * k).toString(16).padStart(2, '0')).join('');
}
