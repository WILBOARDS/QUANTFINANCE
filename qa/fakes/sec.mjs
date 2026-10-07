/* =====================================================================
   PALSU-UNTUK-UJI: SEC EDGAR (www.sec.gov + data.sec.gov), format JSON asli SEC.
   HANYA untuk qa/e2e.mjs dan tes server (sandbox tanpa internet). Nama perusahaan diberi
   "[UJI]" dan semua angka berasal dari generator berbenih, BUKAN laporan keuangan asli.
   Bentuk yang ditiru:
     company_tickers.json   {"0": {cik_str, ticker, title}, ...}
     companyfacts           {cik, entityName, facts: {dei: {...}, "us-gaap": {Konsep: {label, description, units: {USD: [{start?, end, val, accn, fy, fp, form, filed, frame?}]}}}}}
                            10-K memuat pembanding 2 tahun (durasi) / 1 tahun (neraca); 10-Q memuat kuartal 3 bulan +
                            YTD + pembanding tahun lalu; arus kas di 10-Q hanya YTD (seperti laporan asli).
     submissions            {cik, name, sic, sicDescription, fiscalYearEnd, tickers, exchanges, filings: {recent: {accessionNumber: [], form: [], ...}}}
     frames                 {taxonomy, tag, ccp, uom, label, description, pts, data: [{accn, cik, entityName, loc, start?, end, val}]}
   Khusus uji "Data kurang": AAPL palsu TIDAK melaporkan utang jangka panjang untuk FY tahun lalu.
   ===================================================================== */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(String(seed)); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const json = (o, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(o) });
const notFound = () => ({ status: 404, type: 'application/xml', body: '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>' });
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const eom = (y, m) => iso(Date.UTC(y, m, 0));                 // hari terakhir bulan m (1-12)
const addD = (s, n) => iso(Date.parse(s) + n * 864e5);
const pad = c => String(c).padStart(10, '0');

/* perusahaan uji: kode katalog (supaya halaman detail aset bisa dibuka) + perusahaan [UJI] */
const BASE = [
  [320193, 'AAPL', 'Apple Inc.', '3571', 'Electronic Computers', 9, 'RevenueFromContractWithCustomerExcludingAssessedTax'],
  [789019, 'MSFT', 'Microsoft Corp', '7372', 'Services-Prepackaged Software', 6, 'RevenueFromContractWithCustomerExcludingAssessedTax'],
  [1045810, 'NVDA', 'NVIDIA Corp', '3674', 'Semiconductors & Related Devices', 1, 'Revenues'],
  [1018724, 'AMZN', 'Amazon.com, Inc.', '5961', 'Retail-Catalog & Mail-Order Houses', 12, 'RevenueFromContractWithCustomerExcludingAssessedTax'],
  [1652044, 'GOOGL', 'Alphabet Inc.', '7370', 'Services-Computer Programming', 12, 'Revenues'],
  [1326801, 'META', 'Meta Platforms, Inc.', '7370', 'Services-Computer Programming', 12, 'Revenues'],
  [1318605, 'TSLA', 'Tesla, Inc.', '3711', 'Motor Vehicles & Passenger Car Bodies', 12, 'Revenues'],
  [19617, 'JPM', 'JPMorgan Chase & Co', '6021', 'National Commercial Banks', 12, 'Revenues'],
  [21344, 'KO', 'Coca-Cola Co', '2080', 'Beverages', 12, 'Revenues'],
  [77476, 'PEP', 'PepsiCo, Inc.', '2080', 'Beverages', 12, 'Revenues'],
  [104169, 'WMT', 'Walmart Inc.', '5331', 'Retail-Variety Stores', 1, 'Revenues'],
  [34088, 'XOM', 'Exxon Mobil Corp', '2911', 'Petroleum Refining', 12, 'Revenues'],
  [1067983, 'BRK-B', 'Berkshire Hathaway Inc', '6331', 'Fire, Marine & Casualty Insurance', 12, 'Revenues'],
  [2488, 'AMD', 'Advanced Micro Devices Inc', '3674', 'Semiconductors & Related Devices', 12, 'Revenues'],
];
const CO = [...BASE.map(([cik, ticker, title, sic, sicd, fyeM, revTag]) => ({ cik, ticker, title: '[UJI] ' + title, sic, sicd, fyeM, revTag })),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch, i) => ({ cik: 9100001 + i, ticker: 'UJI' + ch, title: `[UJI] Perusahaan Contoh ${ch} Corp`, sic: String([3570, 7372, 2834, 5411, 4911, 3674, 1311, 6022][i % 8]), sicd: 'Uji', fyeM: [12, 12, 6, 9, 12][i % 5], revTag: i % 3 ? 'Revenues' : 'RevenueFromContractWithCustomerExcludingAssessedTax' }))];
const BY_CIK = new Map(CO.map(c => [c.cik, c]));
/* pelapor tanpa ticker (trust/LP): muncul di frames, harus dibuang server */
const NO_TICKER = [[9900001, '[UJI] Trust Tanpa Ticker'], [9900002, '[UJI] Kemitraan Tanpa Ticker LP']];

/* ---------- model angka palsu per perusahaan dan tahun fiskal ---------- */
function model(co, fy) {
  const r = rng('m' + co.cik);
  const base = 2e9 + r() * 3e11, g = -0.12 + r() * 0.5, margin = (co.cik === 1318605 ? -0.02 : 0.04) + r() * 0.22, divOn = r() < 0.6 || co.ticker === 'KO' || co.ticker === 'AAPL';
  const k = fy - 2015;
  let rev = base;
  for (let i = 0; i < k; i++) rev *= 1 + g * (0.6 + 0.8 * rng('g' + co.cik + ':' + (2015 + i))());
  const jit = rng('j' + co.cik + ':' + fy);
  const ni = rev * (margin + (jit() - 0.5) * 0.03);
  const assets = rev * (0.9 + r() * 0.8) * (1 + (jit() - 0.5) * 0.05);
  const liab = assets * (0.35 + r() * 0.5);
  const shares = Math.round((1e9 + r() * 1.5e10) * Math.pow(0.985, k));
  const div = divOn && ni > 0 ? ni * (0.15 + r() * 0.5) : 0;
  return {
    rev: Math.round(rev), cogs: Math.round(rev * (0.45 + r() * 0.2)), ni: Math.round(ni), oi: Math.round(ni * 1.25), cfo: Math.round(ni * (1.05 + jit() * 0.4) + rev * 0.02), capex: Math.round(rev * (0.02 + r() * 0.06)),
    assets: Math.round(assets), ac: Math.round(assets * (0.3 + r() * 0.3)), lc: Math.round(assets * (0.15 + r() * 0.2)), liab: Math.round(liab), eq: Math.round(assets - liab),
    re: Math.round(assets * (0.05 + r() * 0.3)), ltd: Math.round(assets * (0.1 + r() * 0.25)), cash: Math.round(assets * (0.05 + r() * 0.1)),
    shares, div: Math.round(div), dps: div ? +(div / shares).toFixed(2) : 0, eps: +(ni / shares).toFixed(2),
  };
}
const W = [0.24, 0.23, 0.24, 0.29];                       // pembagian kuartal (jumlah = 1)
const qv = (v, k) => Math.round(v * W[k - 1]);
const ytdv = (v, k) => (k === 4 ? v : W.slice(0, k).reduce((s, w) => s + Math.round(v * w), 0));

/* ---------- companyfacts ---------- */
function fyDates(co, fy) {
  const end = eom(fy, co.fyeM), prevEnd = eom(fy - 1, co.fyeM);
  const q = k => { const m = co.fyeM + 3 * k; return eom(fy - 1 + Math.floor((m - 1) / 12), ((m - 1) % 12) + 1); };
  return { start: addD(prevEnd, 1), end, prevEnd, q };
}
function companyFacts(co, now = Date.now()) {
  const today = iso(now);
  let latest = new Date(now).getUTCFullYear() + 1;
  while (addD(eom(latest, co.fyeM), 30) > today) latest--;
  const y0 = latest - 7;
  const facts = { dei: {}, 'us-gaap': {} };
  const put = (tax, concept, unit, f) => {
    const node = facts[tax][concept] || (facts[tax][concept] = { label: concept.replace(/([a-z])([A-Z])/g, '$1 $2'), description: '[UJI] deskripsi konsep ' + concept, units: {} });
    (node.units[unit] || (node.units[unit] = [])).push(f);
  };
  const isAapl = co.ticker === 'AAPL';
  const fin = co.sic.startsWith('6');
  /* AAPL palsu: SalesRevenueNet sampai FY2018, lalu RevenueFromContract... (menguji konsep cadangan) */
  const revTag = fy => (isAapl && fy < 2019 ? 'SalesRevenueNet' : co.revTag);
  const cogsTag = isAapl ? 'CostOfGoodsAndServicesSold' : 'CostOfRevenue';
  const skipLtd = end => isAapl && end === eom(latest - 1, co.fyeM);
  let seq = 0;
  const accn = yy => `${pad(co.cik)}-${String(yy % 100).padStart(2, '0')}-${String(100000 + (++seq) * 7).padStart(6, '0')}`;
  /* satu dokumen. durations: [{mode: 'q'|'ytd'|'fy', start, end, m, k}] ; instants: [[end, m]] */
  function filing({ form, fy, fp, filed, durations, instants, cover }) {
    const meta = { accn: accn(+filed.slice(0, 4)), fy, fp, form, filed };
    for (const { mode, start, end, m, k } of durations) {
      const v = key => (mode === 'q' ? qv(m[key], k) : mode === 'ytd' ? ytdv(m[key], k) : m[key]);
      const add = (concept, unit, val) => put('us-gaap', concept, unit, { start, end, val, ...meta });
      add(revTag(fy), 'USD', v('rev'));
      if (!fin) { add(cogsTag, 'USD', v('cogs')); add('GrossProfit', 'USD', v('rev') - v('cogs')); }
      add('OperatingIncomeLoss', 'USD', v('oi'));
      add('NetIncomeLoss', 'USD', v('ni'));
      add('EarningsPerShareDiluted', 'USD/shares', +(v('ni') / m.shares).toFixed(2));
      add('WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', m.shares);
      if (m.dps) add('CommonStockDividendsPerShareDeclared', 'USD/shares', +(m.dps * (mode === 'q' ? 1 : mode === 'ytd' ? k : 4) / 4).toFixed(2));
      /* arus kas: 10-Q hanya YTD (tidak ada angka 3 bulan, kecuali Q1 yang memang = YTD) */
      if (mode !== 'q' || k === 1) {
        add('NetCashProvidedByUsedInOperatingActivities', 'USD', v('cfo'));
        add('PaymentsToAcquirePropertyPlantAndEquipment', 'USD', v('capex'));
        if (m.div) add('PaymentsOfDividends', 'USD', v('div'));
      }
    }
    for (const [end, m] of instants) {
      const add = (concept, key) => put('us-gaap', concept, 'USD', { end, val: m[key], ...meta });
      add('Assets', 'assets'); add('Liabilities', 'liab'); add('StockholdersEquity', 'eq'); add('RetainedEarningsAccumulatedDeficit', 're'); add('CashAndCashEquivalentsAtCarryingValue', 'cash');
      if (!fin) { add('AssetsCurrent', 'ac'); add('LiabilitiesCurrent', 'lc'); }
      if (!skipLtd(end)) add('LongTermDebtNoncurrent', 'ltd');
    }
    put('dei', 'EntityCommonStockSharesOutstanding', 'shares', { end: addD(filed, -10), val: cover.shares, ...meta });
  }
  const qStart = (X, k) => (k === 1 ? X.start : addD(X.q(k - 1), 1));
  for (let fy = y0; fy <= latest + 1; fy++) {
    const D = fyDates(co, fy), m = model(co, fy), P = fyDates(co, fy - 1), pm = model(co, fy - 1);
    /* 10-Q Q1..Q3: 3 bulan + YTD tahun ini, lalu pembanding tahun lalu (harus diabaikan pembaca) */
    for (let k = 1; k <= 3; k++) {
      const qe = D.q(k), filed = addD(qe, 35);
      if (filed > today) break;
      const durations = [{ mode: 'q', start: qStart(D, k), end: qe, m, k }, { mode: 'q', start: qStart(P, k), end: P.q(k), m: pm, k }];
      if (k > 1) durations.push({ mode: 'ytd', start: D.start, end: qe, m, k }, { mode: 'ytd', start: P.start, end: P.q(k), m: pm, k });
      filing({ form: '10-Q', fy, fp: 'Q' + k, filed, durations, instants: [[qe, m], [D.prevEnd, pm]], cover: m });
    }
    /* 10-K: tahun ini + 2 pembanding (durasi), tahun ini + 1 pembanding (neraca) */
    if (fy <= latest) {
      const durations = [0, 1, 2].map(i => { const X = fyDates(co, fy - i); return { mode: 'fy', start: X.start, end: X.end, m: model(co, fy - i), k: 4 }; });
      filing({ form: '10-K', fy, fp: 'FY', filed: addD(D.end, 30), durations, instants: [[D.end, m], [D.prevEnd, pm]], cover: m });
    }
  }
  return { cik: co.cik, entityName: co.title, facts };
}

/* ---------- submissions ---------- */
function submissions(co, now = Date.now()) {
  const cf = companyFacts(co, now);
  const seen = new Map();
  for (const tax of Object.values(cf.facts)) for (const c of Object.values(tax)) for (const arr of Object.values(c.units)) for (const f of arr) if (!seen.has(f.accn)) seen.set(f.accn, f);
  const rows = [];
  for (const f of seen.values()) {
    const rep = f.form === '10-K' ? eom(f.fy, co.fyeM) : fyDates(co, f.fy).q(+f.fp.slice(1));
    rows.push([f.accn, f.filed, rep, f.form, `${co.ticker.toLowerCase().replace(/[^a-z]/g, '')}-${rep.replace(/-/g, '')}.htm`, f.form === '10-K' ? '10-K' : '10-Q', '']);
  }
  const today = iso(now);
  for (let i = 0; i < 6; i++) { const d = addD(today, -20 - i * 41); rows.push([`${pad(co.cik)}-${d.slice(2, 4)}-${String(500000 + i).padStart(6, '0')}`, d, d, '8-K', `uji8k-${i}.htm`, '[UJI] 8-K', i % 2 ? '2.02,9.01' : '5.02']); }
  for (let i = 0; i < 12; i++) { const d = addD(today, -3 - i * 17); rows.push([`${pad(1900000 + i)}-${d.slice(2, 4)}-${String(600000 + i).padStart(6, '0')}`, d, addD(d, -2), i === 4 ? '4/A' : '4', `xslF345X05/wk-form4_${1700000000 + i}.xml`, '[UJI] FORM 4', '']); }
  { const d = addD(today, -60); rows.push([`0000102909-${d.slice(2, 4)}-700001`, d, '', 'SCHEDULE 13G/A', 'uji13g.xml', '[UJI] SCHEDULE 13G/A', '']); }
  rows.sort((a, b) => (a[1] < b[1] ? 1 : -1));
  const col = i => rows.map(r => r[i]);
  return {
    cik: String(co.cik), entityType: 'operating', sic: co.sic, sicDescription: co.sicd, name: co.title, tickers: [co.ticker], exchanges: ['Nasdaq'],
    fiscalYearEnd: String(co.fyeM).padStart(2, '0') + eom(2001, co.fyeM).slice(8), stateOfIncorporation: 'DE',
    filings: { recent: { accessionNumber: col(0), filingDate: col(1), reportDate: col(2), acceptanceDateTime: col(1).map(d => d + 'T06:01:36.000Z'), act: rows.map(() => '34'), form: col(3), fileNumber: rows.map(() => '001-00000'), filmNumber: rows.map(() => '00000000'), items: col(6), size: rows.map(() => 12345), isXBRL: rows.map(r => (/^10-/.test(r[3]) ? 1 : 0)), isInlineXBRL: rows.map(r => (/^10-/.test(r[3]) ? 1 : 0)), primaryDocument: col(4), primaryDocDescription: col(5) }, files: [] },
  };
}

/* ---------- frames ---------- */
const FRAME_VAL = {
  Revenues: m => m.rev, RevenueFromContractWithCustomerExcludingAssessedTax: m => m.rev, NetIncomeLoss: m => m.ni, NetCashProvidedByUsedInOperatingActivities: m => m.cfo,
  PaymentsToAcquirePropertyPlantAndEquipment: m => m.capex, PaymentsOfDividends: m => m.div || null, EarningsPerShareDiluted: m => m.eps,
  Assets: m => m.assets, Liabilities: m => m.liab, StockholdersEquity: m => m.eq, AssetsCurrent: m => m.ac, LiabilitiesCurrent: m => m.lc,
};
function frame(tag, unit, period) {
  const mm = /^CY(\d{4})(Q4I)?$/.exec(period);
  if (!FRAME_VAL[tag] || !mm) return notFound();
  const y = +mm[1], inst = !!mm[2];
  const data = [];
  for (const co of CO) {
    if ((tag === 'Revenues' || tag === 'RevenueFromContractWithCustomerExcludingAssessedTax') && co.revTag !== tag) continue;
    if (co.sic.startsWith('6') && /Current/.test(tag)) continue;
    if (rng('miss' + co.cik + tag)() < 0.06) continue;           // sebagian pelapor tidak memakai konsep ini
    const v = FRAME_VAL[tag](model(co, y));
    if (v === null || v === undefined) continue;
    const D = fyDates({ ...co, fyeM: 12 }, y);
    data.push({ accn: `${pad(co.cik)}-${String((y + 1) % 100).padStart(2, '0')}-${String(100000 + hash(co.cik + tag + y) % 800000).padStart(6, '0')}`, cik: co.cik, entityName: co.title.toUpperCase(), loc: 'US-CA', ...(inst ? {} : { start: D.start }), end: D.end, val: v });
  }
  for (const [cik, name] of NO_TICKER) data.push({ accn: `${pad(cik)}-${String((y + 1) % 100).padStart(2, '0')}-000001`, cik, entityName: name, loc: 'US-NY', ...(inst ? {} : { start: `${y}-01-01` }), end: `${y}-12-31`, val: 123456789 });
  return json({ taxonomy: 'us-gaap', tag, ccp: period, uom: unit.replace('-per-', '/'), label: tag.replace(/([a-z])([A-Z])/g, '$1 $2'), description: '[UJI] deskripsi', pts: data.length, data });
}

export default function sec(url) {
  const h = url.hostname, p = url.pathname;
  if (h === 'www.sec.gov' && p === '/files/company_tickers.json') {
    const out = {};
    CO.forEach((c, i) => { out[String(i)] = { cik_str: c.cik, ticker: c.ticker, title: c.title }; });
    out[String(CO.length)] = { cik_str: 1652044, ticker: 'GOOG', title: '[UJI] Alphabet Inc.' };   // kelas kedua: CIK sama
    return json(out);
  }
  if (h !== 'data.sec.gov') return null;
  let m = /^\/api\/xbrl\/companyfacts\/CIK(\d{10})\.json$/.exec(p);
  if (m) { const co = BY_CIK.get(+m[1]); return co ? json(companyFacts(co)) : notFound(); }
  m = /^\/submissions\/CIK(\d{10})\.json$/.exec(p);
  if (m) { const co = BY_CIK.get(+m[1]); return co ? json(submissions(co)) : notFound(); }
  m = /^\/api\/xbrl\/frames\/us-gaap\/([A-Za-z]+)\/([A-Za-z-]+)\/(CY\d{4}(?:Q[1-4]I)?)\.json$/.exec(p);
  if (m) return frame(m[1], m[2], m[3]);
  return notFound();
}
export { companyFacts, submissions, CO };
