/* =====================================================================
   PORTOFOLIO & RISIKO (murni, tanpa import; diuji di test/portfolio.test.mjs)
   Metodologi (juga ditulis di UI):
   - Imbal hasil harian SEDERHANA r_t = P_t ÷ P_{t−1} − 1 (bukan log), dari harga penutupan.
   - Penyelarasan: hanya tanggal (UTC, YYYY-MM-DD) yang dimiliki SEMUA posisi; tanggal yang hilang
     di salah satu posisi dibuang (tidak diisi/ditebak). Kripto yang diperdagangkan akhir pekan ikut
     diselaraskan ke hari bursa saham bila dicampur.
   - Bobot portofolio = nilai pasar saat ini (konstan sepanjang jendela; tanpa rebalancing harian).
   - Volatilitas tahunan = simpangan baku sampel (n−1) × √252.
   - VaR historis 1 hari 95% = −(kuantil 5% imbal hasil), ES 95% = −rata-rata imbal hasil ≤ kuantil itu.
     Kuantil: metode "lower" (nilai terurut ke-⌊p·(n−1)⌋), tanpa interpolasi.
   - Drawdown maksimum dari kurva nilai kumulatif ∏(1 + r).
   - Beta = kovarians(portofolio, acuan) ÷ varians(acuan), sampel (n−1).
   ===================================================================== */

export const MIN_RETURNS = 60;
const fin = v => typeof v === 'number' && Number.isFinite(v);

/* ---------- CSV aman (RFC 4180 sederhana: kutip ganda, koma, baris baru di dalam kutip) ---------- */
export function parseCsv(text, { maxRows = 2000 } = {}) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  /* pemisah dari baris pertama: ';' (Excel lokal Indonesia, koma = desimal) atau ',' */
  const first = s.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
      if (rows.length > maxRows) throw new Error(`CSV terlalu besar (maksimal ${maxRows} baris)`);
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}
/* angka gaya Indonesia/Inggris: "1.234,5" / "1,234.5" / "1234.5" -> 1234.5 */
export function parseNum(v) {
  let t = String(v ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  /* buang awalan kutip tunggal dari ekspor CSV yang dinetralkan (='...) */
  t = t.replace(/^'/, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
/* baris CSV -> posisi. Kolom dikenali dari header: ticker/kode, quantity/jumlah, avg_price/harga_rata, currency/mata_uang.
   Hasil: { holdings: [{ symbol, qty, avg, cur }], errors: ['baris 3: ...'] } */
export function holdingsFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { holdings: [], errors: ['CSV kosong'] };
  const h = rows[0].map(x => x.trim().toLowerCase());
  const col = names => h.findIndex(x => names.includes(x));
  const ci = { sym: col(['ticker', 'kode', 'symbol', 'simbol']), qty: col(['quantity', 'jumlah', 'qty']), avg: col(['avg_price', 'harga_rata', 'harga_rata_rata', 'average_price', 'avg']), cur: col(['currency', 'mata_uang', 'cur']) };
  if (ci.sym < 0 || ci.qty < 0) return { holdings: [], errors: ['Header wajib: ticker, quantity (opsional: avg_price, currency)'] };
  const holdings = [], errors = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const sym = String(r[ci.sym] || '').trim().replace(/^'/, '').toUpperCase();
    if (!/^[A-Z0-9.^=\-/]{1,20}$/.test(sym)) { errors.push(`baris ${line}: kode tidak sah`); return; }
    const qty = parseNum(r[ci.qty]);
    if (!(qty > 0)) { errors.push(`baris ${line}: jumlah harus > 0`); return; }
    const avg = ci.avg >= 0 ? parseNum(r[ci.avg]) : null;
    if (avg !== null && !(avg >= 0)) { errors.push(`baris ${line}: harga rata-rata tidak sah`); return; }
    const cur = ci.cur >= 0 ? String(r[ci.cur] || '').trim().toUpperCase() : '';
    if (cur && !/^[A-Z]{3,4}$/.test(cur)) { errors.push(`baris ${line}: mata uang tidak sah`); return; }
    holdings.push({ symbol: sym, qty, avg, cur: cur || null });
  });
  return { holdings, errors };
}

/* ---------- valuasi ---------- */
/* laba/rugi belum terealisasi dalam mata uang harga. avg null -> P/L tidak dihitung */
export function pnl(qty, avg, price) {
  if (!(qty > 0) || !fin(price)) return { value: null, cost: null, abs: null, pct: null };
  const value = qty * price;
  if (!fin(avg)) return { value, cost: null, abs: null, pct: null };
  const cost = qty * avg;
  return { value, cost, abs: value - cost, pct: cost > 0 ? (value - cost) / cost * 100 : null };
}
/* alokasi: items [{ key, value }] -> [{ key, value, share }] urut terbesar; nilai bukan angka dibuang */
export function allocation(items) {
  const m = new Map();
  for (const it of items || []) if (fin(it.value) && it.value > 0) m.set(it.key, (m.get(it.key) || 0) + it.value);
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  return [...m.entries()].map(([key, value]) => ({ key, value, share: total > 0 ? value / total : 0 })).sort((a, b) => b.value - a.value);
}

/* ---------- deret harga ---------- */
/* bar {time detik, close} -> Map tanggal UTC -> close (penutupan terakhir hari itu) */
export function dailyCloses(bars) {
  const m = new Map();
  for (const b of bars || []) if (b && fin(b.time) && fin(b.close) && b.close > 0) m.set(new Date(b.time * 1000).toISOString().slice(0, 10), b.close);
  return m;
}
/* seriesMap { id: Map(tanggal -> harga) } -> { dates, prices: { id: [harga sejajar dates] } } hanya tanggal milik semua */
export function align(seriesMap) {
  const ids = Object.keys(seriesMap);
  if (!ids.length) return { dates: [], prices: {} };
  let dates = [...seriesMap[ids[0]].keys()];
  for (const id of ids.slice(1)) dates = dates.filter(d => seriesMap[id].has(d));
  dates.sort();
  return { dates, prices: Object.fromEntries(ids.map(id => [id, dates.map(d => seriesMap[id].get(d))])) };
}
export function returns(prices) {
  const out = [];
  for (let i = 1; i < prices.length; i++) out.push(prices[i] / prices[i - 1] - 1);
  return out;
}
/* imbal hasil portofolio dengan bobot tetap: Σ w_i r_i,t ; bobot dinormalisasi ke jumlah 1 */
export function portfolioReturns(retMap, weights) {
  const ids = Object.keys(retMap).filter(id => fin(weights[id]) && weights[id] > 0);
  const W = ids.reduce((s, id) => s + weights[id], 0);
  if (!ids.length || !(W > 0)) return [];
  const n = Math.min(...ids.map(id => retMap[id].length));
  const out = [];
  for (let t = 0; t < n; t++) out.push(ids.reduce((s, id) => s + weights[id] / W * retMap[id][t], 0));
  return out;
}

/* ---------- statistik ---------- */
export const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function stdev(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
export const annualVol = (r, periods = 252) => stdev(r) * Math.sqrt(periods);
export function maxDrawdown(r) {
  let v = 1, peak = 1, mdd = 0;
  for (const x of r) { v *= 1 + x; if (v > peak) peak = v; const dd = v / peak - 1; if (dd < mdd) mdd = dd; }
  return mdd;
}
export function quantileLower(a, p) {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.floor(p * (s.length - 1))] : NaN;
}
/* VaR & ES historis (positif = kerugian), tingkat keyakinan conf (0.95) */
export function historicalVaR(r, conf = 0.95) {
  if (!r.length) return { var: NaN, es: NaN, q: NaN, tail: 0 };
  const q = quantileLower(r, 1 - conf);
  const tail = r.filter(x => x <= q);
  return { var: -q, es: -mean(tail), q, tail: tail.length };
}
export function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}
export function beta(r, bench) { const v = covariance(bench, bench); return v > 0 ? covariance(r, bench) / v : NaN; }
export function correlation(a, b) { const sa = stdev(a), sb = stdev(b); return sa > 0 && sb > 0 ? covariance(a, b) / (sa * sb) : NaN; }
export function corrMatrix(retMap) {
  const ids = Object.keys(retMap);
  return { ids, m: ids.map(a => ids.map(b => (a === b ? 1 : correlation(retMap[a], retMap[b])))) };
}
