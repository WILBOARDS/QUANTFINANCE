/* =====================================================================
   SCREENER (modul murni): SEC EDGAR frames API -> metrik per perusahaan -> filter preset
   - Frames = satu konsep XBRL untuk SEMUA pelapor pada satu periode kalender
     (CY2025 = durasi ±1 tahun; CY2025Q4I = posisi neraca sekitar 31 Des 2025).
     Perusahaan dengan tahun fiskal tidak sama dengan kalender dipasangkan SEC ke periode
     kalender yang paling dekat, jadi periode durasi dan neraca bisa sedikit berbeda.
   - Metrik = rumus eksplisit; nilai yang hilang = null (dikecualikan dari filter, dihitung
     sebagai "data kurang"). Tidak ada imputasi.
   - Hasil = "Hasil screening / hasil filter kuantitatif", BUKAN rekomendasi.
   Dipakai server (daftar konsep yang boleh diminta) dan browser (gabung + filter).
   ===================================================================== */

/* konsep yang boleh diminta ke /api/sec/frames: konsep -> { unit (di URL SEC), kind } */
export const FRAME_ALLOW = {
  Revenues: { unit: 'USD', kind: 'dur' },
  RevenueFromContractWithCustomerExcludingAssessedTax: { unit: 'USD', kind: 'dur' },
  NetIncomeLoss: { unit: 'USD', kind: 'dur' },
  NetCashProvidedByUsedInOperatingActivities: { unit: 'USD', kind: 'dur' },
  PaymentsToAcquirePropertyPlantAndEquipment: { unit: 'USD', kind: 'dur' },
  PaymentsOfDividends: { unit: 'USD', kind: 'dur' },
  EarningsPerShareDiluted: { unit: 'USD-per-shares', kind: 'dur' },
  Assets: { unit: 'USD', kind: 'inst' },
  Liabilities: { unit: 'USD', kind: 'inst' },
  StockholdersEquity: { unit: 'USD', kind: 'inst' },
  AssetsCurrent: { unit: 'USD', kind: 'inst' },
  LiabilitiesCurrent: { unit: 'USD', kind: 'inst' },
};
/* periode: CY#### (durasi tahunan) atau CY####Q#I (instan). Tahun 2009..tahun ini. */
export function validPeriod(p, kind, now = Date.now()) {
  const m = /^CY(\d{4})(Q[1-4]I)?$/.exec(String(p || ''));
  if (!m) return false;
  const y = +m[1];
  if (y < 2009 || y > new Date(now).getUTCFullYear()) return false;
  return kind === 'inst' ? !!m[2] : !m[2];
}
/* tahun kalender terakhir yang laporannya (hampir) lengkap: 10-K terakhir masuk ±90 hari setelah tutup buku */
export function defaultYear(now = Date.now()) {
  const d = new Date(now);
  return d.getUTCMonth() + 1 >= 5 ? d.getUTCFullYear() - 1 : d.getUTCFullYear() - 2;
}
export const frameUrl = (concept, unit, period) => `https://data.sec.gov/api/xbrl/frames/us-gaap/${concept}/${unit}/${period}.json`;

/* bentuk ringkas frame SEC: {taxonomy, tag, ccp, uom, label, pts, data:[{accn, cik, entityName, loc, start?, end, val}]}
   -> { tag, uom, ccp, label, total, rows: [[cik, val, start, end, accn]], ent: {cik: [nama, ticker]} }
   byCik (dari company_tickers.json): hanya pelapor yang punya ticker yang disimpan (universe saham). */
export function parseFrame(raw, byCik = null) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.data)) throw new Error('Format frames SEC tidak dikenal (tidak ada "data")');
  const rows = [], ent = {};
  for (const d of raw.data) {
    if (!d || !Number.isInteger(d.cik) || typeof d.val !== 'number' || !Number.isFinite(d.val) || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.end))) continue;
    const tk = byCik ? byCik[d.cik] : '';
    if (byCik && !tk) continue;
    rows.push([d.cik, d.val, /^\d{4}-\d{2}-\d{2}$/.test(String(d.start || '')) ? d.start : '', d.end, /^\d{10}-\d{2}-\d{6}$/.test(String(d.accn)) ? d.accn : '']);
    if (!ent[d.cik]) ent[d.cik] = [String(d.entityName || '').slice(0, 80), tk || ''];
  }
  return { tag: String(raw.tag || ''), uom: String(raw.uom || ''), ccp: String(raw.ccp || ''), label: String(raw.label || '').slice(0, 120), total: raw.data.length, rows, ent };
}

/* pos yang dipakai screener -> konsep frame (berurutan prioritas) */
export const FRAME_FIELDS = {
  revenue: { label: 'Pendapatan', concepts: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'], kind: 'dur' },
  netIncome: { label: 'Laba bersih', concepts: ['NetIncomeLoss'], kind: 'dur' },
  cfo: { label: 'Arus kas operasi', concepts: ['NetCashProvidedByUsedInOperatingActivities'], kind: 'dur' },
  capex: { label: 'Belanja modal', concepts: ['PaymentsToAcquirePropertyPlantAndEquipment'], kind: 'dur' },
  dividendsPaid: { label: 'Dividen dibayar', concepts: ['PaymentsOfDividends'], kind: 'dur' },
  assets: { label: 'Total aset', concepts: ['Assets'], kind: 'inst' },
  liabilities: { label: 'Total liabilitas', concepts: ['Liabilities'], kind: 'inst' },
  equity: { label: 'Ekuitas', concepts: ['StockholdersEquity'], kind: 'inst' },
  assetsCurrent: { label: 'Aset lancar', concepts: ['AssetsCurrent'], kind: 'inst' },
  liabilitiesCurrent: { label: 'Liabilitas jangka pendek', concepts: ['LiabilitiesCurrent'], kind: 'inst' },
  eps: { label: 'EPS dilusian', concepts: ['EarningsPerShareDiluted'], kind: 'dur', optional: true },
};
const periodFor = (kind, y) => (kind === 'inst' ? `CY${y}Q4I` : `CY${y}`);
/* daftar permintaan frame untuk satu tahun. Pendapatan juga tahun sebelumnya (pertumbuhan). */
export function plan(year, { eps = false } = {}) {
  const out = [];
  for (const [key, f] of Object.entries(FRAME_FIELDS)) {
    if (f.optional && !(key === 'eps' && eps)) continue;
    for (const c of f.concepts) {
      out.push({ key, concept: c, unit: FRAME_ALLOW[c].unit, period: periodFor(f.kind, year) });
      if (key === 'revenue') out.push({ key: 'revenuePrev', concept: c, unit: FRAME_ALLOW[c].unit, period: periodFor(f.kind, year - 1) });
    }
  }
  return out;
}
export const frameKey = (concept, period) => concept + '|' + period;

/* gabung frame per CIK. frames: { 'Konsep|CY2025': frameRingkas }. Nilai per pos:
   { value, concept, period, start, end, accn } */
export function joinFrames(frames, year) {
  const rows = new Map();
  const get = cik => {
    let r = rows.get(cik);
    if (!r) { r = { cik, ticker: '', name: '', v: {} }; rows.set(cik, r); }
    return r;
  };
  const take = (key, concept, period) => {
    const f = frames[frameKey(concept, period)];
    if (!f) return;
    for (const [cik, val, start, end, accn] of f.rows) {
      const r = get(cik);
      if (!r.name && f.ent[cik]) { r.name = f.ent[cik][0]; r.ticker = f.ent[cik][1]; }
      if (!r.v[key]) r.v[key] = { value: val, concept, period, start: start || null, end, accn };
    }
  };
  for (const [key, f] of Object.entries(FRAME_FIELDS)) for (const c of f.concepts) take(key, c, periodFor(f.kind, year));
  /* pendapatan tahun lalu: konsep yang SAMA dengan tahun ini, supaya pertumbuhan tidak membandingkan tag berbeda */
  const prevIdx = {};
  for (const c of FRAME_FIELDS.revenue.concepts) {
    const f = frames[frameKey(c, periodFor('dur', year - 1))];
    if (f) prevIdx[c] = new Map(f.rows.map(x => [x[0], x]));
  }
  for (const r of rows.values()) {
    const cur = r.v.revenue;
    const row = cur && prevIdx[cur.concept] ? prevIdx[cur.concept].get(r.cik) : null;
    if (row) r.v.revenuePrev = { value: row[1], concept: cur.concept, period: periodFor('dur', year - 1), start: row[2] || null, end: row[3], accn: row[4] };
  }
  return [...rows.values()].filter(r => r.ticker);
}

/* metrik: label, rumus, input (pos frame), dan cara format */
export const METRICS = {
  revenue: { label: 'Pendapatan', fmt: 'usd', raw: true },
  netIncome: { label: 'Laba bersih', fmt: 'usd', raw: true },
  netMargin: { label: 'Margin bersih', fmt: 'pct', formula: 'Laba bersih ÷ Pendapatan', inputs: ['netIncome', 'revenue'] },
  roa: { label: 'ROA', fmt: 'pct', formula: 'Laba bersih ÷ Total aset (posisi akhir tahun kalender)', inputs: ['netIncome', 'assets'] },
  roe: { label: 'ROE', fmt: 'pct', formula: 'Laba bersih ÷ Ekuitas pemegang saham', inputs: ['netIncome', 'equity'] },
  liabEquity: { label: 'Liabilitas/ekuitas', fmt: 'x', formula: 'Total liabilitas ÷ Ekuitas (D/E versi total liabilitas)', inputs: ['liabilities', 'equity'] },
  currentRatio: { label: 'Current ratio', fmt: 'x', formula: 'Aset lancar ÷ Liabilitas jangka pendek', inputs: ['assetsCurrent', 'liabilitiesCurrent'] },
  revGrowth: { label: 'Pertumbuhan pendapatan', fmt: 'pct', formula: 'Pendapatan tahun ini ÷ tahun lalu − 1 (tag XBRL yang sama)', inputs: ['revenue', 'revenuePrev'] },
  fcf: { label: 'FCF (perkiraan)', fmt: 'usd', formula: 'Arus kas operasi − pembelian aset tetap. PERKIRAAN: tidak termasuk capex lain (sewa, akuisisi).', inputs: ['cfo', 'capex'] },
  fcfMargin: { label: 'Margin FCF (perkiraan)', fmt: 'pct', formula: '(Arus kas operasi − pembelian aset tetap) ÷ Pendapatan. PERKIRAAN.', inputs: ['cfo', 'capex', 'revenue'] },
  dividendsPaid: { label: 'Dividen dibayar', fmt: 'usd', raw: true },
  payout: { label: 'Payout', fmt: 'pct', formula: 'Dividen tunai dibayar ÷ Laba bersih', inputs: ['dividendsPaid', 'netIncome'] },
  health: { label: 'Kesehatan (SUBSET)', fmt: 'score', formula: 'SUBSET Piotroski: jumlah lolos dari F1 ROA > 0 (laba bersih ÷ total aset), F2 arus kas operasi > 0, F4 arus kas operasi > laba bersih. Kriteria perubahan (Δ) tidak dihitung.', inputs: ['netIncome', 'assets', 'cfo'] },
  pe: { label: 'P/E', fmt: 'x', ext: 'price', formula: 'Harga terakhir ÷ EPS dilusian tahun frame (bukan TTM)', inputs: ['eps'] },
  mom6: { label: 'Momentum 6 bln', fmt: 'pct', ext: 'history', formula: 'Harga terakhir ÷ harga ±182 hari lalu − 1 (dari riwayat harga)' },
};
const n = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const val = (r, k) => (r.v[k] ? n(r.v[k].value) : null);
const ratio = (a, b) => (a === null || b === null || !(b > 0) ? null : a / b);
/* hitung metrik satu baris (r.m). ext: { pe, mom6 } dari harga nyata (opsional) */
export function computeMetrics(r, ext = {}) {
  const rev = val(r, 'revenue'), ni = val(r, 'netIncome'), ta = val(r, 'assets'), tl = val(r, 'liabilities'), eq = val(r, 'equity');
  const ac = val(r, 'assetsCurrent'), lc = val(r, 'liabilitiesCurrent'), cfo = val(r, 'cfo'), cap = val(r, 'capex'), div = val(r, 'dividendsPaid'), prev = val(r, 'revenuePrev');
  const fcf = cfo !== null && cap !== null ? cfo - cap : null;
  const crit = [
    { id: 'F1', label: 'ROA > 0', pass: ni === null || ta === null || !(ta > 0) ? null : ni / ta > 0 },
    { id: 'F2', label: 'Arus kas operasi > 0', pass: cfo === null ? null : cfo > 0 },
    { id: 'F4', label: 'Arus kas operasi > laba bersih', pass: cfo === null || ni === null ? null : cfo > ni },
  ];
  const complete = crit.filter(c => c.pass !== null).length;
  r.health = { criteria: crit, score: crit.filter(c => c.pass === true).length, complete };
  r.m = {
    revenue: rev, netIncome: ni, netMargin: ratio(ni, rev), roa: ratio(ni, ta), roe: ratio(ni, eq), liabEquity: ratio(tl, eq), currentRatio: ratio(ac, lc),
    revGrowth: prev !== null && prev > 0 && rev !== null ? rev / prev - 1 : null, fcf, fcfMargin: ratio(fcf, rev), dividendsPaid: div, payout: ratio(div, ni),
    health: complete === 3 ? r.health.score : null,
    pe: n(ext.pe), mom6: n(ext.mom6),
  };
  return r;
}

/* preset: filter = { metrik: { min, max } } dengan batas EKSKLUSIF (nilai > min dan < max) */
export const PRESETS = {
  VALUE: { label: 'Value', filters: { pe: { min: 0, max: 15 }, netIncome: { min: 0 } }, sort: ['pe', 'asc'], needs: 'price', note: 'P/E antara 0 dan 15 dan laba bersih > 0. P/E butuh harga nyata, jadi hanya dihitung untuk aset yang punya harga.' },
  GROWTH: { label: 'Growth', filters: { revGrowth: { min: 0.15 }, netIncome: { min: 0 } }, sort: ['revGrowth', 'desc'], note: 'Pertumbuhan pendapatan > 15% dan laba bersih > 0.' },
  QUALITY: { label: 'Quality', filters: { roe: { min: 0.15 }, netMargin: { min: 0.10 }, liabEquity: { max: 1 } }, sort: ['roe', 'desc'], note: 'ROE > 15%, margin bersih > 10%, liabilitas/ekuitas < 1.' },
  DIVIDEND: { label: 'Dividend', filters: { dividendsPaid: { min: 0 }, payout: { max: 1 } }, sort: ['dividendsPaid', 'desc'], note: 'Dividen tunai dibayar > 0 dan payout (dividen ÷ laba bersih) < 100%.' },
  MOMENTUM: { label: 'Momentum', filters: { mom6: { min: 0.10 } }, sort: ['mom6', 'desc'], needs: 'history', note: 'Kenaikan harga 6 bulan > 10%. Butuh riwayat harga nyata, jadi hanya dihitung untuk aset yang punya riwayat.' },
  LOWLEV: { label: 'Low leverage', filters: { liabEquity: { max: 0.5 }, currentRatio: { min: 1.5 } }, sort: ['liabEquity', 'asc'], note: 'Liabilitas/ekuitas < 0,5 dan current ratio > 1,5.' },
  HEALTH: { label: 'Financial health', filters: { health: { min: 2 } }, sort: ['roa', 'desc'], note: 'SUBSET Piotroski (3 dari 9 kriteria): F1 ROA > 0, F2 arus kas operasi > 0, F4 arus kas operasi > laba bersih. Lolos = 3 dari 3. Kriteria perubahan tahunan (F3, F5–F9) butuh dua tahun neraca dan tidak dihitung di sini.' },
};
const active = f => f && ((f.min !== null && f.min !== undefined && Number.isFinite(f.min)) || (f.max !== null && f.max !== undefined && Number.isFinite(f.max)));
/* hasil: { pass, missing } ; missing = baris yang dikecualikan karena nilai metrik yang difilter tidak ada */
export function applyFilters(rows, filters = {}) {
  const fs = Object.entries(filters).filter(([, f]) => active(f));
  const pass = [];
  let missing = 0;
  for (const r of rows) {
    let ok = true, miss = false;
    for (const [k, f] of fs) {
      const v = r.m ? r.m[k] : null;
      if (v === null || v === undefined) { ok = false; miss = true; break; }
      if (Number.isFinite(f.min) && !(v > f.min)) { ok = false; break; }
      if (Number.isFinite(f.max) && !(v < f.max)) { ok = false; break; }
    }
    if (ok) pass.push(r); else if (miss) missing++;
  }
  return { pass, missing };
}
/* urutkan; nilai kosong selalu di bawah */
export function sortRows(rows, key, dir = 'desc') {
  const s = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const x = key === 'ticker' || key === 'name' ? a[key] : a.m && a.m[key], y = key === 'ticker' || key === 'name' ? b[key] : b.m && b.m[key];
    const xn = x === null || x === undefined, yn = y === null || y === undefined;
    if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1;
    if (typeof x === 'string') return x.localeCompare(y) * s;
    return (x - y) * s;
  });
}
/* momentum dari bar riwayat (time dalam detik, urut naik): harga terakhir ÷ harga ±days lalu − 1 */
export function momentum(bars, days = 182) {
  const pts = (bars || []).filter(b => b && Number.isFinite(b.time) && Number.isFinite(b.close) && b.close > 0);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1], target = last.time - days * 86400;
  let base = null;
  for (const b of pts) { if (b.time <= target) base = b; else break; }
  /* riwayat harus benar-benar menjangkau ±days ke belakang (toleransi 10 hari) */
  if (!base || target - base.time > 10 * 86400) return null;
  return { value: last.close / base.close - 1, from: base.time, to: last.time, base: base.close, last: last.close };
}
