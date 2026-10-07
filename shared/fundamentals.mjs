/* =====================================================================
   FUNDAMENTAL DARI SEC EDGAR (XBRL) — modul murni, dipakai server DAN browser
   - compactFacts(raw): companyfacts (bisa beberapa MB) diringkas jadi deret tahunan dan
     kuartalan kecil. Setiap nilai menyimpan {value, unit, end, start, fy, fp, form, filed,
     accn, concept} supaya tampilan bisa menunjuk periode, konsep XBRL, nomor accession,
     tanggal lapor, dan mata uang.
   - ratios/growth/valuation/piotroski/altman: rumus eksplisit (string), input yang hilang
     = null ("Data kurang"). TIDAK pernah diisi, ditebak, atau dinormalisasi.
   Catatan format SEC (companyfacts):
     facts["us-gaap"][konsep].units[satuan] = [{start?, end, val, accn, fy, fp, form, filed, frame?}]
     fy/fp = tahun/periode fiskal DOKUMEN yang melaporkan, bukan periode fakta itu sendiri:
     10-K juga memuat angka pembanding tahun lalu dengan fy/fp yang sama. Karena itu periode
     fakta ditentukan dari tanggal start/end, dan label tahun fiskal dihitung ulang
     (fy dokumen − selisih tahun antara akhir periode dokumen dan akhir periode fakta).
   ===================================================================== */

/* pos laporan: konsep XBRL berurutan prioritas (cadangan bila konsep pertama tidak dilaporkan) */
export const FIELDS = {
  revenue: { label: 'Pendapatan', st: 'is', kind: 'dur', unit: 'USD', add: true, concepts: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'] },
  costOfRevenue: { label: 'Beban pokok pendapatan', st: 'is', kind: 'dur', unit: 'USD', add: true, concepts: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'] },
  grossProfit: { label: 'Laba kotor', st: 'is', kind: 'dur', unit: 'USD', add: true, concepts: ['GrossProfit'] },
  operatingIncome: { label: 'Laba operasi', st: 'is', kind: 'dur', unit: 'USD', add: true, concepts: ['OperatingIncomeLoss'] },
  netIncome: { label: 'Laba bersih', st: 'is', kind: 'dur', unit: 'USD', add: true, concepts: ['NetIncomeLoss'] },
  epsDiluted: { label: 'EPS dilusian', st: 'is', kind: 'dur', unit: 'USD/shares', add: false, concepts: ['EarningsPerShareDiluted'] },
  assets: { label: 'Total aset', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['Assets'] },
  assetsCurrent: { label: 'Aset lancar', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['AssetsCurrent'] },
  cash: { label: 'Kas dan setara kas', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['CashAndCashEquivalentsAtCarryingValue'] },
  liabilities: { label: 'Total liabilitas', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['Liabilities'] },
  liabilitiesCurrent: { label: 'Liabilitas jangka pendek', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['LiabilitiesCurrent'] },
  longTermDebt: { label: 'Utang jangka panjang', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['LongTermDebtNoncurrent', 'LongTermDebt'] },
  equity: { label: 'Ekuitas pemegang saham', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['StockholdersEquity'] },
  retainedEarnings: { label: 'Laba ditahan (defisit)', st: 'bs', kind: 'inst', unit: 'USD', concepts: ['RetainedEarningsAccumulatedDeficit'] },
  cfo: { label: 'Arus kas operasi', st: 'cf', kind: 'dur', unit: 'USD', add: true, concepts: ['NetCashProvidedByUsedInOperatingActivities'] },
  capex: { label: 'Belanja modal (capex)', st: 'cf', kind: 'dur', unit: 'USD', add: true, concepts: ['PaymentsToAcquirePropertyPlantAndEquipment'] },
  dilutedShares: { label: 'Rata-rata tertimbang saham dilusian', st: 'sh', kind: 'dur', unit: 'shares', add: false, concepts: ['WeightedAverageNumberOfDilutedSharesOutstanding'] },
  dps: { label: 'Dividen per saham (diumumkan)', st: 'dv', kind: 'dur', unit: 'USD/shares', add: false, concepts: ['CommonStockDividendsPerShareDeclared'] },
  dividendsPaid: { label: 'Dividen tunai dibayar', st: 'dv', kind: 'dur', unit: 'USD', add: true, concepts: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'] },
};
/* pos turunan (dihitung dari pos lain, kualitas "calculated") */
export const DERIVED = {
  fcf: { label: 'Arus kas bebas (FCF)', st: 'cf', unit: 'USD', formula: 'Arus kas operasi − belanja modal (capex)', concept: 'NetCashProvidedByUsedInOperatingActivities − PaymentsToAcquirePropertyPlantAndEquipment' },
};
export const SHARES_OUT = 'dei:EntityCommonStockSharesOutstanding';

const DAY = 864e5;
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const t = s => Date.parse(s + 'T00:00:00Z');
const days = (a, b) => (t(b) - t(a)) / DAY;
const addDays = (s, n) => new Date(t(s) + n * DAY).toISOString().slice(0, 10);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ANNUAL_FORMS = /^(10-K|10-KT|20-F|40-F)(\/A)?$/;
const QUARTER_FORMS = /^(10-Q|10-QT)(\/A)?$/;
/* kelas durasi: 1 = kuartal (13/14 minggu), 2 = 6 bulan, 3 = 9 bulan, 4 = setahun (52/53 minggu) */
export function durClass(d) {
  if (d >= 80 && d <= 100) return 1;
  if (d >= 170 && d <= 195) return 2;
  if (d >= 260 && d <= 285) return 3;
  if (d >= 340 && d <= 385) return 4;
  return 0;
}
export const cikPad = c => String(c).replace(/\D/g, '').padStart(10, '0').slice(-10);
export const companyUrl = cik => 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + cikPad(cik);
export const factsUrl = cik => 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + cikPad(cik) + '.json';
export const submissionsUrl = cik => 'https://data.sec.gov/submissions/CIK' + cikPad(cik) + '.json';
/* tautan dokumen EDGAR dari nomor accession (0000320193-24-000123) */
export function filingIndexUrl(cik, accn) {
  if (!/^\d{10}-\d{2}-\d{6}$/.test(String(accn || ''))) return '';
  return `https://www.sec.gov/Archives/edgar/data/${Number(cikPad(cik))}/${accn.replace(/-/g, '')}/${accn}-index.htm`;
}
export function filingDocUrl(cik, accn, doc) {
  if (!/^\d{10}-\d{2}-\d{6}$/.test(String(accn || '')) || !/^[A-Za-z0-9._\-/]{1,160}$/.test(String(doc || '')) || /\.\./.test(doc)) return filingIndexUrl(cik, accn);
  return `https://www.sec.gov/Archives/edgar/data/${Number(cikPad(cik))}/${accn.replace(/-/g, '')}/${doc}`;
}

/* satuan yang dipakai: USD bila ada; kalau tidak, mata uang lain (laporan 20-F) yang paling banyak faktanya */
function pickUnit(units, pref) {
  if (!units || typeof units !== 'object') return null;
  if (Array.isArray(units[pref])) return pref;
  const re = pref === 'USD' ? /^[A-Z]{3}$/ : pref === 'USD/shares' ? /^[A-Z]{3}\/shares$/ : null;
  if (!re) return null;
  const cand = Object.keys(units).filter(k => re.test(k) && Array.isArray(units[k])).sort((a, b) => units[b].length - units[a].length);
  return cand[0] || null;
}
/* akhir periode setiap dokumen (accession) = akhir terbaru dari fakta durasi >= 80 hari di dokumen itu */
function periodEnds(gaap) {
  const pe = new Map(), inst = new Map();
  for (const c of Object.values(gaap || {})) {
    if (!c || !c.units) continue;
    for (const arr of Object.values(c.units)) {
      if (!Array.isArray(arr)) continue;
      for (const f of arr) {
        if (!f || typeof f.accn !== 'string' || !isDate(f.end)) continue;
        if (isDate(f.start)) { if (days(f.start, f.end) >= 80) { const cur = pe.get(f.accn); if (!cur || f.end > cur) pe.set(f.accn, f.end); } }
        else { const cur = inst.get(f.accn); if (!cur || f.end > cur) inst.set(f.accn, f.end); }
      }
    }
  }
  for (const [a, e] of inst) if (!pe.has(a)) pe.set(a, e);
  return pe;
}
/* tahun fiskal milik fakta: fy dokumen dikurangi selisih tahun (pembanding tahun lalu = fy − 1) */
function fyOf(f, pEnd) {
  if (!Number.isInteger(f.fy)) return +f.end.slice(0, 4);
  return f.fy - Math.round(days(f.end, pEnd || f.end) / 365.25);
}
const newer = (a, b) => !a || b.filed > a.filed || (b.filed === a.filed && b.accn > a.accn);
function rec(f, concept, unit, fp, fy) {
  return { value: f.val, unit, end: f.end, start: isDate(f.start) ? f.start : null, fy, fp, form: String(f.form || ''), filed: isDate(f.filed) ? f.filed : '', accn: String(f.accn || ''), concept };
}
const brief = r => ({ accn: r.accn, form: r.form, start: r.start, end: r.end, value: r.value, filed: r.filed });
/* kuartal turunan: a − b (mis. YTD 6 bulan − Q1). Kualitas "calculated" + rumus + dokumen asalnya. */
function diffRec(a, subtract, fp, formula) {
  const sub = Array.isArray(subtract) ? subtract : [subtract];
  const last = sub.reduce((m, x) => (x.end > m.end ? x : m), sub[0]);
  return {
    value: a.value - sub.reduce((s, x) => s + x.value, 0), unit: a.unit, end: a.end, start: addDays(last.end, 1), fy: a.fy, fp,
    form: a.form, filed: [a.filed, ...sub.map(x => x.filed)].sort().pop(), accn: a.accn, concept: a.concept, quality: 'calculated', formula, from: [brief(a), ...sub.map(brief)],
  };
}
const near = (a, b, tol = 3) => !!a && !!b && Math.abs(days(a, b)) <= tol;

/* satu konsep -> { unit, annual: [rec], quarterly: [rec] } */
function extractConcept(node, concept, def, pe) {
  const c = node && node[concept];
  if (!c || !c.units) return null;
  const unit = pickUnit(c.units, def.unit);
  if (!unit) return null;
  const annual = new Map(), q3 = new Map(), ytd = new Map(), instQ = new Map();
  for (const f of c.units[unit]) {
    if (!f || num(f.val) === null || !isDate(f.end) || typeof f.accn !== 'string') continue;
    const form = String(f.form || '');
    const pEnd = pe.get(f.accn) || f.end;
    const fy = fyOf(f, pEnd);
    const hasStart = isDate(f.start);
    if (ANNUAL_FORMS.test(form)) {
      if (def.kind === 'dur') {
        if (!hasStart || durClass(days(f.start, f.end)) !== 4) continue;
      } else {
        if (hasStart) continue;
        /* neraca di 10-K: akhir tahun ini dan pembanding akhir tahun lalu (52/53 minggu) */
        const d = days(f.end, pEnd);
        if (!(Math.abs(d) <= 10 || Math.abs(d - 364) <= 14)) continue;
      }
      const r = rec(f, concept, unit, 'FY', fy);
      if (newer(annual.get(f.end), r)) annual.set(f.end, r);
    } else if (QUARTER_FORMS.test(form) && /^Q[1-3]$/.test(String(f.fp))) {
      /* hanya periode dokumen itu sendiri (pembanding tahun lalu datang dari 10-Q tahun lalu) */
      if (f.end !== pEnd) continue;
      if (def.kind === 'dur') {
        if (!hasStart) continue;
        const k = durClass(days(f.start, f.end));
        const r = rec(f, concept, unit, f.fp, fy);
        if (k === 1) { if (newer(q3.get(fy + '|' + f.fp), r)) q3.set(fy + '|' + f.fp, r); }
        else if ((k === 2 && f.fp === 'Q2') || (k === 3 && f.fp === 'Q3')) { if (newer(ytd.get(fy + '|' + f.fp), r)) ytd.set(fy + '|' + f.fp, r); }
      } else {
        if (hasStart) continue;
        const r = rec(f, concept, unit, f.fp, fy);
        if (newer(instQ.get(fy + '|' + f.fp), r)) instQ.set(fy + '|' + f.fp, r);
      }
    }
  }
  /* indeks tahunan per tahun fiskal (bila dua periode berlabel sama, yang berakhir paling akhir) */
  const annByFy = new Map();
  for (const r of annual.values()) { const x = annByFy.get(r.fy); if (!x || r.end > x.end) annByFy.set(r.fy, r); }
  const quarterly = new Map();
  if (def.kind === 'dur') {
    const fys = new Set([...[...q3.keys(), ...ytd.keys()].map(k => +k.split('|')[0]), ...annByFy.keys()]);
    for (const fy of fys) {
      const Q1 = q3.get(fy + '|Q1') || null, Y2 = ytd.get(fy + '|Q2') || null, Y3 = ytd.get(fy + '|Q3') || null, A = annByFy.get(fy) || null;
      let Q2 = q3.get(fy + '|Q2') || null, Q3 = q3.get(fy + '|Q3') || null, Q4 = null;
      if (def.add) {
        if (!Q2 && Y2 && Q1 && near(Q1.start, Y2.start) && durClass(days(Q1.end, Y2.end)) === 1) Q2 = diffRec(Y2, Q1, 'Q2', 'YTD 6 bulan (10-Q) − Q1 (10-Q)');
        if (!Q3 && Y3 && Y2 && near(Y2.start, Y3.start) && durClass(days(Y2.end, Y3.end)) === 1) Q3 = diffRec(Y3, Y2, 'Q3', 'YTD 9 bulan (10-Q) − YTD 6 bulan (10-Q)');
        if (A && Y3 && near(A.start, Y3.start) && durClass(days(Y3.end, A.end)) === 1) Q4 = diffRec(A, Y3, 'Q4', 'Setahun (10-K) − YTD 9 bulan (10-Q)');
        else if (A && Q1 && Q2 && Q3 && near(A.start, Q1.start) && durClass(days(Q3.end, A.end)) === 1) Q4 = diffRec(A, [Q1, Q2, Q3], 'Q4', 'Setahun (10-K) − (Q1 + Q2 + Q3)');
      }
      for (const r of [Q1, Q2, Q3, Q4]) if (r) quarterly.set(r.fy + '|' + r.fp, r);
    }
  } else {
    for (const [k, r] of instQ) quarterly.set(k, r);
    /* neraca akhir tahun fiskal (10-K) = posisi akhir Q4 */
    for (const r of annByFy.values()) { const k = r.fy + '|Q4'; if (!quarterly.has(k)) quarterly.set(k, { ...r, fp: 'Q4' }); }
  }
  return { unit, annual: [...annual.values()], quarterly: [...quarterly.values()] };
}
const byEndDesc = (a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0);

/* gabungkan konsep cadangan: per periode, konsep dengan prioritas tertinggi yang punya nilai */
function mergeField(node, def, pe, maxYears, maxQuarters) {
  const ann = new Map(), qtr = new Map(), used = [];
  let unit = null;
  for (const concept of def.concepts) {
    const x = extractConcept(node, concept, def, pe);
    if (!x || (!x.annual.length && !x.quarterly.length)) continue;
    if (unit && x.unit !== unit) continue;          // satu pos = satu satuan
    unit = x.unit;
    used.push(concept);
    for (const r of x.annual) if (!ann.has(r.end)) ann.set(r.end, r);
    for (const r of x.quarterly) { const k = r.fy + '|' + r.fp; if (!qtr.has(k)) qtr.set(k, r); }
  }
  return { unit, used, annual: [...ann.values()].sort(byEndDesc).slice(0, maxYears), quarterly: [...qtr.values()].sort(byEndDesc).slice(0, maxQuarters) };
}
function fcfFrom(cfo, capex) {
  const cap = new Map(capex.map(r => [r.fy + '|' + r.fp + '|' + r.end, r]));
  const out = [];
  for (const c of cfo) {
    const k = cap.get(c.fy + '|' + c.fp + '|' + c.end);
    if (!k) continue;
    out.push({
      value: c.value - k.value, unit: c.unit, end: c.end, start: c.start, fy: c.fy, fp: c.fp, form: c.form, filed: [c.filed, k.filed].sort().pop(), accn: c.accn,
      concept: DERIVED.fcf.concept, quality: 'calculated', formula: DERIVED.fcf.formula, from: [{ ...brief(c), concept: c.concept }, { ...brief(k), concept: k.concept }],
    });
  }
  return out;
}

/* ringkas companyfacts. Melempar Error bila formatnya tidak dikenal. */
export function compactFacts(raw, { maxYears = 10, maxQuarters = 12 } = {}) {
  if (!raw || typeof raw !== 'object' || !raw.facts || typeof raw.facts !== 'object') throw new Error('Format companyfacts SEC tidak dikenal (tidak ada "facts")');
  const gaap = raw.facts['us-gaap'] || null;
  const out = {
    cik: cikPad(raw.cik), entityName: String(raw.entityName || '').slice(0, 160), taxonomies: Object.keys(raw.facts).slice(0, 8), usGaap: !!gaap,
    annual: {}, quarterly: {}, units: {}, conceptsUsed: {}, sharesOutstanding: [],
  };
  const pe = periodEnds(gaap);
  for (const [key, def] of Object.entries(FIELDS)) {
    const m = gaap ? mergeField(gaap, def, pe, maxYears, maxQuarters) : { unit: null, used: [], annual: [], quarterly: [] };
    out.annual[key] = m.annual; out.quarterly[key] = m.quarterly; out.units[key] = m.unit; out.conceptsUsed[key] = m.used;
  }
  out.annual.fcf = fcfFrom(out.annual.cfo, out.annual.capex);
  out.quarterly.fcf = fcfFrom(out.quarterly.cfo, out.quarterly.capex);
  out.units.fcf = out.units.cfo; out.conceptsUsed.fcf = out.annual.fcf.length || out.quarterly.fcf.length ? ['NetCashProvidedByUsedInOperatingActivities', 'PaymentsToAcquirePropertyPlantAndEquipment'] : [];
  /* saham beredar (sampul dokumen, tanggal setelah akhir periode) */
  const so = raw.facts.dei && raw.facts.dei.EntityCommonStockSharesOutstanding;
  if (so && so.units && Array.isArray(so.units.shares)) {
    const m = new Map();
    for (const f of so.units.shares) {
      if (!f || num(f.val) === null || !isDate(f.end) || !(ANNUAL_FORMS.test(String(f.form)) || QUARTER_FORMS.test(String(f.form)))) continue;
      const r = rec(f, SHARES_OUT, 'shares', String(f.fp || ''), Number.isInteger(f.fy) ? f.fy : +f.end.slice(0, 4));
      if (newer(m.get(f.end), r)) m.set(f.end, r);
    }
    out.sharesOutstanding = [...m.values()].sort(byEndDesc).slice(0, 12);
  }
  return out;
}

/* ---------- daftar ticker -> CIK (www.sec.gov/files/company_tickers.json) ---------- */
export function parseTickers(raw) {
  const byTicker = {}, byCik = {};
  const rows = raw && typeof raw === 'object' ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];
  for (const r of rows) {
    if (!r || !Number.isInteger(r.cik_str) || r.cik_str <= 0) continue;
    const tk = String(r.ticker || '').toUpperCase();
    if (!/^[A-Z0-9.\-]{1,10}$/.test(tk) || byTicker[tk]) continue;
    byTicker[tk] = [r.cik_str, String(r.title || '').slice(0, 120)];
    if (!byCik[r.cik_str]) byCik[r.cik_str] = tk;            // ticker pertama = kelas utama
  }
  if (!Object.keys(byTicker).length) throw new Error('Format company_tickers.json SEC tidak dikenal (kosong)');
  return { byTicker, byCik };
}
/* kode ticker katalog -> bentuk SEC (BRK.B -> BRK-B) */
export const secTicker = s => String(s || '').toUpperCase().replace(/\./g, '-');

/* ---------- submissions: identitas + daftar laporan terbaru ---------- */
const FORM_GROUP = f => (/^(10-K|10-Q|10-KT|10-QT|20-F|40-F)(\/A)?$/.test(f) ? 'periodic' : /^8-K(\/A)?$/.test(f) ? '8k' : /^4(\/A)?$/.test(f) ? 'form4' : /^(SC 13[DG]|SCHEDULE 13[DG])(\/A)?$/.test(f) ? 'own' : null);
const GROUP_MAX = { periodic: 24, '8k': 20, form4: 50, own: 20 };
export function parseSubmissions(raw) {
  if (!raw || typeof raw !== 'object' || !raw.filings || !raw.filings.recent) throw new Error('Format submissions SEC tidak dikenal');
  const R = raw.filings.recent;
  const col = k => (Array.isArray(R[k]) ? R[k] : []);
  const acc = col('accessionNumber'), form = col('form'), filed = col('filingDate'), rep = col('reportDate'), doc = col('primaryDocument'), desc = col('primaryDocDescription'), items = col('items');
  const cik = cikPad(raw.cik);
  const count = {};
  const filings = [];
  for (let i = 0; i < acc.length; i++) {
    const f = String(form[i] || ''), g = FORM_GROUP(f);
    if (!g || !/^\d{10}-\d{2}-\d{6}$/.test(String(acc[i]))) continue;
    if ((count[g] = (count[g] || 0) + 1) > GROUP_MAX[g]) continue;
    filings.push({
      form: f, group: g, accn: acc[i], filed: isDate(filed[i]) ? filed[i] : '', reportDate: isDate(rep[i]) ? rep[i] : '',
      desc: String(desc[i] || '').slice(0, 80), items: String(items[i] || '').slice(0, 60),
      url: filingDocUrl(cik, acc[i], doc[i]), indexUrl: filingIndexUrl(cik, acc[i]),
    });
  }
  const s = v => String(v ?? '').slice(0, 120);
  return {
    cik, name: s(raw.name), sic: /^\d{3,4}$/.test(String(raw.sic || '')) ? String(raw.sic) : '', sicDescription: s(raw.sicDescription), entityType: s(raw.entityType),
    fiscalYearEnd: /^\d{4}$/.test(String(raw.fiscalYearEnd || '')) ? String(raw.fiscalYearEnd) : '', stateOfIncorporation: s(raw.stateOfIncorporation),
    tickers: (Array.isArray(raw.tickers) ? raw.tickers : []).map(String).filter(x => /^[A-Z0-9.\-]{1,10}$/i.test(x)).slice(0, 6),
    exchanges: (Array.isArray(raw.exchanges) ? raw.exchanges : []).map(x => s(x).slice(0, 20)).filter(Boolean).slice(0, 6),
    filings,
  };
}
/* bank & lembaga keuangan (SIC 6000–6999): model Altman tidak berlaku */
export const isFinancialSic = sic => /^\d{4}$/.test(String(sic || '')) && +sic >= 6000 && +sic <= 6999;

/* =====================================================================
   PERHITUNGAN (semua di atas data tahunan kecuali disebut lain)
   Bentuk hasil: { key, label, value|null, pct?, unit?, formula, inputs:[{name, value, period, concept, rec}], reason?, quality }
   ===================================================================== */
const label = r => (r ? (r.fp === 'FY' ? 'FY' + r.fy : r.fp + ' FY' + r.fy) : '');
export const periodLabel = label;
/* indeks per tahun fiskal: A[key].get(fy) */
export function indexAnnual(c) {
  const A = {};
  for (const [k, list] of Object.entries((c && c.annual) || {})) {
    const m = new Map();
    for (const r of list || []) { const x = m.get(r.fy); if (!x || r.end > x.end) m.set(r.fy, r); }
    A[k] = m;
  }
  return A;
}
const inp = (name, r, fy, key) => ({ name, key, value: r ? r.value : null, period: r ? label(r) : (fy != null ? 'FY' + fy : ''), concept: r ? r.concept : ((FIELDS[key] && FIELDS[key].concepts.join(' | ')) || key || ''), rec: r || null });
function make(key, lbl, formula, inputs, fn, o = {}) {
  const miss = inputs.filter(i => i.value === null || i.value === undefined);
  const base = { key, label: lbl, formula, inputs, pct: !!o.pct, unit: o.unit || '' };
  if (miss.length) return { ...base, value: null, quality: 'unavailable', reason: 'Data kurang: ' + miss.map(m => m.name + (m.period ? ' (' + m.period + ')' : '')).join(', ') + ' tidak tersedia' };
  const g = o.guard ? o.guard(...inputs.map(i => i.value)) : null;
  if (g) return { ...base, value: null, quality: 'unavailable', reason: g };
  const v = fn(...inputs.map(i => i.value));
  if (v === null || !Number.isFinite(v)) return { ...base, value: null, quality: 'unavailable', reason: 'Tidak bisa dihitung (pembagi nol)' };
  return { ...base, value: v, quality: 'calculated' };
}
const posDen = (what) => (...v) => (v[v.length - 1] > 0 ? null : what + ' ≤ 0: rasio tidak bermakna');

/* laba kotor tahun fy: GrossProfit, atau (Pendapatan − Beban pokok) bila GrossProfit tidak dilaporkan */
function grossMarginCalc(A, fy) {
  const rev = A.revenue.get(fy), gp = A.grossProfit.get(fy), cogs = A.costOfRevenue.get(fy);
  if (gp || !cogs) return make('grossMargin', 'Margin kotor', 'Laba kotor ÷ Pendapatan', [inp('Laba kotor', gp, fy, 'grossProfit'), inp('Pendapatan', rev, fy, 'revenue')], (a, b) => a / b, { pct: true, guard: posDen('Pendapatan') });
  return make('grossMargin', 'Margin kotor', '(Pendapatan − Beban pokok pendapatan) ÷ Pendapatan', [inp('Pendapatan', rev, fy, 'revenue'), inp('Beban pokok pendapatan', cogs, fy, 'costOfRevenue')], (a, b) => (a - b) / a, { pct: true, guard: a => (a > 0 ? null : 'Pendapatan ≤ 0: rasio tidak bermakna') });
}
export const RATIO_KEYS = ['grossMargin', 'opMargin', 'netMargin', 'roa', 'roe', 'currentRatio', 'debtEquity', 'assetTurnover', 'fcfMargin'];
export function ratiosFor(c, fy, A = indexAnnual(c)) {
  const g = k => (A[k] ? A[k].get(fy) : undefined) || null;
  const rev = inp('Pendapatan', g('revenue'), fy, 'revenue');
  return {
    grossMargin: grossMarginCalc(A, fy),
    opMargin: make('opMargin', 'Margin operasi', 'Laba operasi ÷ Pendapatan', [inp('Laba operasi', g('operatingIncome'), fy, 'operatingIncome'), rev], (a, b) => a / b, { pct: true, guard: posDen('Pendapatan') }),
    netMargin: make('netMargin', 'Margin bersih', 'Laba bersih ÷ Pendapatan', [inp('Laba bersih', g('netIncome'), fy, 'netIncome'), rev], (a, b) => a / b, { pct: true, guard: posDen('Pendapatan') }),
    roa: make('roa', 'ROA', 'Laba bersih ÷ Total aset (akhir tahun)', [inp('Laba bersih', g('netIncome'), fy, 'netIncome'), inp('Total aset', g('assets'), fy, 'assets')], (a, b) => a / b, { pct: true, guard: posDen('Total aset') }),
    roe: make('roe', 'ROE', 'Laba bersih ÷ Ekuitas pemegang saham (akhir tahun)', [inp('Laba bersih', g('netIncome'), fy, 'netIncome'), inp('Ekuitas', g('equity'), fy, 'equity')], (a, b) => a / b, { pct: true, guard: posDen('Ekuitas') }),
    currentRatio: make('currentRatio', 'Current ratio', 'Aset lancar ÷ Liabilitas jangka pendek', [inp('Aset lancar', g('assetsCurrent'), fy, 'assetsCurrent'), inp('Liabilitas jangka pendek', g('liabilitiesCurrent'), fy, 'liabilitiesCurrent')], (a, b) => a / b, { unit: '×', guard: posDen('Liabilitas jangka pendek') }),
    debtEquity: make('debtEquity', 'Utang jangka panjang / ekuitas', 'Utang jangka panjang ÷ Ekuitas pemegang saham', [inp('Utang jangka panjang', g('longTermDebt'), fy, 'longTermDebt'), inp('Ekuitas', g('equity'), fy, 'equity')], (a, b) => a / b, { unit: '×', guard: posDen('Ekuitas') }),
    assetTurnover: make('assetTurnover', 'Perputaran aset', 'Pendapatan ÷ Total aset (akhir tahun)', [rev, inp('Total aset', g('assets'), fy, 'assets')], (a, b) => a / b, { unit: '×', guard: posDen('Total aset') }),
    fcfMargin: make('fcfMargin', 'Margin FCF', '(Arus kas operasi − capex) ÷ Pendapatan', [inp('FCF', g('fcf'), fy, 'fcf'), rev], (a, b) => a / b, { pct: true, guard: posDen('Pendapatan') }),
  };
}
/* tahun fiskal yang punya data tahunan, terbaru dulu */
export function annualYears(c, keys = ['revenue', 'netIncome', 'assets']) {
  const s = new Set();
  for (const k of keys) for (const r of (c && c.annual && c.annual[k]) || []) s.add(r.fy);
  return [...s].sort((a, b) => b - a);
}
export function ratios(c, { maxYears = 10 } = {}) {
  const A = indexAnnual(c);
  return annualYears(c).slice(0, maxYears).map(fy => ({ fy, items: ratiosFor(c, fy, A) }));
}

/* ---------- pertumbuhan ---------- */
export const GROWTH_KEYS = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'epsDiluted', 'cfo', 'fcf'];
const growthCalc = (key, cur, prev, period, prevPeriod) => {
  const nm = (FIELDS[key] || DERIVED[key] || {}).label || key;
  return make(key, nm, '(Nilai ' + period + ' ÷ nilai ' + prevPeriod + ') − 1', [inp(nm + ' ' + period, cur, null, key), inp(nm + ' ' + prevPeriod, prev, null, key)], (a, b) => a / b - 1,
    { pct: true, guard: (a, b) => (b > 0 ? null : 'Basis ' + prevPeriod + ' ≤ 0: pertumbuhan tidak bermakna') });
};
export function growthYoY(c, { keys = GROWTH_KEYS, maxYears = 9 } = {}) {
  const A = indexAnnual(c);
  return annualYears(c).slice(0, maxYears).map(fy => {
    const items = {};
    for (const k of keys) {
      const cur = A[k] && A[k].get(fy), prev = A[k] && A[k].get(fy - 1);
      items[k] = growthCalc(k, cur || null, prev || null, 'FY' + fy, 'FY' + (fy - 1));
    }
    return { fy, items };
  });
}
export function growthQoQ(c, { keys = ['revenue', 'netIncome', 'epsDiluted'], max = 8 } = {}) {
  const out = [];
  const lists = Object.fromEntries(keys.map(k => [k, ((c && c.quarterly && c.quarterly[k]) || []).slice().sort(byEndDesc)]));
  const ends = [...new Set(keys.flatMap(k => lists[k].map(r => r.fy + '|' + r.fp + '|' + r.end)))].map(s => s.split('|')).sort((a, b) => (a[2] < b[2] ? 1 : -1)).slice(0, max);
  for (const [fy, fp, end] of ends) {
    const items = {};
    for (const k of keys) {
      const L = lists[k], i = L.findIndex(r => r.end === end);
      const cur = i >= 0 ? L[i] : null;
      const prev = cur ? L.find(r => r.end < end && durClass(days(r.end, end)) === 1) || null : null;
      items[k] = growthCalc(k, cur, prev, fp + ' FY' + fy, prev ? label(prev) : 'kuartal sebelumnya');
    }
    out.push({ fy: +fy, fp, end, items });
  }
  return out;
}

/* ---------- valuasi: HANYA dengan harga nyata (Datum) ---------- */
function latestInstant(c, key) {
  const a = ((c.quarterly && c.quarterly[key]) || [])[0] || null, b = ((c.annual && c.annual[key]) || [])[0] || null;
  if (!a) return b; if (!b) return a;
  return a.end >= b.end ? a : b;
}
/* price: { value, currency, source, asOf, fetchedAt, quality, reason } */
export const VALUATION_LABELS = { marketCap: 'Kapitalisasi pasar', pe: 'P/E', ps: 'P/S', pb: 'P/B', evSales: 'EV/Sales' };
export function valuation(c, price) {
  const keys = Object.keys(VALUATION_LABELS);
  const A = indexAnnual(c);
  const fy = annualYears(c, ['revenue', 'netIncome'])[0];
  const pr = price && num(price.value) !== null ? { name: 'Harga', key: 'price', value: price.value, period: price.asOf || price.fetchedAt || '', concept: price.source || 'harga', rec: { value: price.value, unit: price.currency || '', source: price.source, asOf: price.asOf, fetchedAt: price.fetchedAt, quality: price.quality, isPrice: true } } : null;
  const finUnit = (c.units && c.units.revenue) || 'USD';
  let block = null;
  if (!pr) block = 'Data kurang: harga tidak tersedia' + (price && price.reason ? ' (' + price.reason + ')' : '') + '. Valuasi hanya dihitung dengan harga nyata.';
  else if (price.currency && price.currency !== finUnit) block = `Data kurang: mata uang harga (${price.currency}) berbeda dari mata uang laporan (${finUnit}); tidak dikonversi.`;
  const shares = (c.sharesOutstanding || [])[0] || null;
  const sh = inp('Saham beredar', shares, null, null); sh.concept = SHARES_OUT;
  const rev = inp('Pendapatan', fy != null ? A.revenue.get(fy) : null, fy, 'revenue');
  const eps = inp('EPS dilusian', fy != null ? A.epsDiluted.get(fy) : null, fy, 'epsDiluted');
  const eq = inp('Ekuitas', latestInstant(c, 'equity'), null, 'equity');
  const ltd = inp('Utang jangka panjang', latestInstant(c, 'longTermDebt'), null, 'longTermDebt');
  const cash = inp('Kas dan setara kas', latestInstant(c, 'cash'), null, 'cash');
  if (block) return { fy, block, items: Object.fromEntries(keys.map(k => [k, { key: k, label: VALUATION_LABELS[k], value: null, inputs: [], formula: '', reason: block, quality: 'unavailable' }])) };
  const mc = make('marketCap', 'Kapitalisasi pasar', 'Harga × saham beredar (dei:EntityCommonStockSharesOutstanding, sampul laporan terbaru)', [pr, sh], (p, s) => p * s, { unit: finUnit });
  const mcIn = mc.value === null ? { name: 'Kapitalisasi pasar', key: 'marketCap', value: null, period: '', concept: 'kalkulasi', rec: null } : { name: 'Kapitalisasi pasar', key: 'marketCap', value: mc.value, period: 'harga ' + (pr.period || ''), concept: 'Harga × saham beredar', rec: { value: mc.value, unit: finUnit, quality: 'calculated', formula: mc.formula } };
  return {
    fy, block: null,
    items: {
      marketCap: mc,
      pe: make('pe', 'P/E', 'Harga ÷ EPS dilusian FY' + fy + ' (bukan TTM)', [pr, eps], (p, e) => p / e, { unit: '×', guard: (p, e) => (e > 0 ? null : 'EPS ≤ 0: P/E tidak bermakna') }),
      ps: make('ps', 'P/S', 'Kapitalisasi pasar ÷ Pendapatan FY' + fy, [mcIn, rev], (m, r) => m / r, { unit: '×', guard: posDen('Pendapatan') }),
      pb: make('pb', 'P/B', 'Kapitalisasi pasar ÷ Ekuitas (neraca terbaru)', [mcIn, eq], (m, e) => m / e, { unit: '×', guard: posDen('Ekuitas') }),
      evSales: make('evSales', 'EV/Sales', '(Kapitalisasi pasar + utang jangka panjang − kas) ÷ Pendapatan FY' + fy + '. Utang jangka pendek tidak termasuk (perkiraan EV).', [mcIn, ltd, cash, rev], (m, d, k, r) => (m + d - k) / r, { unit: '×', guard: (m, d, k, r) => (r > 0 ? null : 'Pendapatan ≤ 0: rasio tidak bermakna') }),
    },
  };
}

/* ---------- Piotroski F-score (9 kriteria, tanpa imputasi) ---------- */
export const PIO_GROUPS = { P: 'Profitabilitas', L: 'Leverage & likuiditas', O: 'Efisiensi operasi' };
export function piotroski(c, fy) {
  const A = indexAnnual(c);
  if (fy == null) fy = annualYears(c, ['netIncome', 'revenue'])[0];
  const g = (k, y) => (A[k] ? A[k].get(y) : undefined) || null;
  const p = fy - 1, pp = fy - 2;
  const I = (name, k, y) => inp(name, g(k, y), y, k);
  const crit = (id, group, lbl, formula, inputs, test) => {
    const miss = inputs.filter(i => i.value === null);
    if (miss.length) return { id, group: PIO_GROUPS[group], label: lbl, pass: null, formula, inputs, reason: 'Data kurang: ' + miss.map(m => m.name + ' (' + m.period + ')').join(', ') };
    const r = test(...inputs.map(i => i.value));
    if (r === null) return { id, group: PIO_GROUPS[group], label: lbl, pass: null, formula, inputs, reason: 'Tidak bisa dihitung (pembagi nol atau negatif)' };
    return { id, group: PIO_GROUPS[group], label: lbl, pass: !!r.pass, value: r.value, formula, inputs };
  };
  const dv = (a, b) => (b > 0 ? a / b : null);
  const gm = y => {
    const gp = g('grossProfit', y), cogs = g('costOfRevenue', y), rev = g('revenue', y);
    return gp || !cogs ? [inp('Laba kotor', gp, y, 'grossProfit'), inp('Pendapatan', rev, y, 'revenue')] : [inp('Pendapatan', rev, y, 'revenue'), inp('Beban pokok pendapatan', cogs, y, 'costOfRevenue')];
  };
  const gmVal = (ins, a, b) => (ins[0].key === 'grossProfit' ? dv(a, b) : dv(a - b, a));
  const gT = gm(fy), gP = gm(p);
  const criteria = [
    crit('F1', 'P', 'ROA > 0', 'Laba bersih FY' + fy + ' ÷ Total aset awal tahun (akhir FY' + p + ') > 0', [I('Laba bersih', 'netIncome', fy), I('Total aset awal tahun', 'assets', p)],
      (ni, ta) => { const v = dv(ni, ta); return v === null ? null : { pass: v > 0, value: v }; }),
    crit('F2', 'P', 'Arus kas operasi > 0', 'Arus kas operasi FY' + fy + ' > 0', [I('Arus kas operasi', 'cfo', fy)], cfo => ({ pass: cfo > 0, value: cfo })),
    crit('F3', 'P', 'ΔROA > 0', 'ROA FY' + fy + ' − ROA FY' + p + ' > 0 (ROA = laba bersih ÷ total aset awal tahun)',
      [I('Laba bersih', 'netIncome', fy), I('Total aset awal tahun', 'assets', p), I('Laba bersih tahun lalu', 'netIncome', p), I('Total aset awal tahun lalu', 'assets', pp)],
      (n1, a1, n0, a0) => { const r1 = dv(n1, a1), r0 = dv(n0, a0); return r1 === null || r0 === null ? null : { pass: r1 - r0 > 0, value: r1 - r0 }; }),
    crit('F4', 'P', 'Akrual: arus kas operasi > laba bersih', 'Arus kas operasi FY' + fy + ' > Laba bersih FY' + fy, [I('Arus kas operasi', 'cfo', fy), I('Laba bersih', 'netIncome', fy)], (cfo, ni) => ({ pass: cfo > ni, value: cfo - ni })),
    crit('F5', 'L', 'ΔRasio utang jangka panjang < 0', '(Utang jangka panjang ÷ Total aset) FY' + fy + ' < FY' + p,
      [I('Utang jangka panjang', 'longTermDebt', fy), I('Total aset', 'assets', fy), I('Utang jangka panjang tahun lalu', 'longTermDebt', p), I('Total aset tahun lalu', 'assets', p)],
      (d1, a1, d0, a0) => { const r1 = dv(d1, a1), r0 = dv(d0, a0); return r1 === null || r0 === null ? null : { pass: r1 - r0 < 0, value: r1 - r0 }; }),
    crit('F6', 'L', 'ΔCurrent ratio > 0', '(Aset lancar ÷ Liabilitas jangka pendek) FY' + fy + ' > FY' + p,
      [I('Aset lancar', 'assetsCurrent', fy), I('Liabilitas jangka pendek', 'liabilitiesCurrent', fy), I('Aset lancar tahun lalu', 'assetsCurrent', p), I('Liabilitas jangka pendek tahun lalu', 'liabilitiesCurrent', p)],
      (a1, l1, a0, l0) => { const r1 = dv(a1, l1), r0 = dv(a0, l0); return r1 === null || r0 === null ? null : { pass: r1 - r0 > 0, value: r1 - r0 }; }),
    crit('F7', 'L', 'Tidak ada saham baru', 'Rata-rata tertimbang saham dilusian FY' + fy + ' ≤ FY' + p, [I('Saham dilusian', 'dilutedShares', fy), I('Saham dilusian tahun lalu', 'dilutedShares', p)], (s1, s0) => ({ pass: s1 <= s0, value: s1 - s0 })),
    crit('F8', 'O', 'ΔMargin kotor > 0', 'Margin kotor FY' + fy + ' > FY' + p + (gT[0].key === 'grossProfit' && gP[0].key === 'grossProfit' ? ' (laba kotor ÷ pendapatan)' : ' (laba kotor ÷ pendapatan; bila laba kotor tidak dilaporkan: (pendapatan − beban pokok) ÷ pendapatan)'),
      [...gT, ...gP.map(x => ({ ...x, name: x.name + ' tahun lalu' }))],
      (a1, b1, a0, b0) => { const m1 = gmVal(gT, a1, b1), m0 = gmVal(gP, a0, b0); return m1 === null || m0 === null ? null : { pass: m1 - m0 > 0, value: m1 - m0 }; }),
    crit('F9', 'O', 'ΔPerputaran aset > 0', '(Pendapatan ÷ Total aset awal tahun) FY' + fy + ' > FY' + p,
      [I('Pendapatan', 'revenue', fy), I('Total aset awal tahun', 'assets', p), I('Pendapatan tahun lalu', 'revenue', p), I('Total aset awal tahun lalu', 'assets', pp)],
      (r1, a1, r0, a0) => { const t1 = dv(r1, a1), t0 = dv(r0, a0); return t1 === null || t0 === null ? null : { pass: t1 - t0 > 0, value: t1 - t0 }; }),
  ];
  const complete = criteria.filter(k => k.pass !== null).length;
  const score = criteria.filter(k => k.pass === true).length;
  return { fy, criteria, score, complete, total: 9, text: `${score} dari ${complete} kriteria yang datanya lengkap`, missing: 9 - complete };
}

/* ---------- Altman Z'' (non-manufaktur) dan Z asli (butuh kapitalisasi pasar nyata) ---------- */
export const ALTMAN = {
  zpp: { name: "Altman Z'' (non-manufaktur)", w: [6.56, 3.26, 6.72, 1.05], safe: 2.6, distress: 1.1 },
  z: { name: 'Altman Z (1968, manufaktur publik)', w: [1.2, 1.4, 3.3, 0.6, 1.0], safe: 2.99, distress: 1.81 },
};
const zone = (s, m) => (s > m.safe ? 'aman' : s >= m.distress ? 'abu-abu' : 'tertekan');
const INTERP = {
  aman: 'Zona aman: menurut model, kemungkinan tekanan keuangan rendah. Bukan jaminan.',
  'abu-abu': 'Zona abu-abu: sinyal campuran; perlu analisis lanjutan.',
  tertekan: 'Zona tekanan (distress): pola rasionya mirip perusahaan yang dulu mengalami kesulitan keuangan. Bukan prediksi pasti.',
};
export function altman(c, fy, { sic = '', sicDescription = '', marketCap = null } = {}) {
  const A = indexAnnual(c);
  if (fy == null) fy = annualYears(c, ['assets', 'revenue'])[0];
  if (isFinancialSic(sic)) return { applicable: false, fy, reason: `Tidak berlaku untuk bank/lembaga keuangan (SIC ${sic}${sicDescription ? ' ' + sicDescription : ''}). Model Altman dirancang untuk perusahaan non-keuangan; neraca bank (simpanan nasabah sebagai liabilitas) membuat rasionya tidak bermakna.` };
  const g = k => (A[k] ? A[k].get(fy) : undefined) || null;
  const I = (name, k) => inp(name, g(k), fy, k);
  const TA = I('Total aset', 'assets'), TL = I('Total liabilitas', 'liabilities');
  const comp = (id, lbl, formula, w, inputs, fn) => {
    const r = make(id, lbl, formula, inputs, fn, { guard: (...v) => (v[v.length - 1] > 0 ? null : inputs[inputs.length - 1].name + ' ≤ 0') });
    return { ...r, id, weight: w, contribution: r.value === null ? null : r.value * w };
  };
  const X1 = w => comp('X1', 'Modal kerja ÷ Total aset', '(Aset lancar − Liabilitas jangka pendek) ÷ Total aset', w, [I('Aset lancar', 'assetsCurrent'), I('Liabilitas jangka pendek', 'liabilitiesCurrent'), TA], (a, l, t) => (a - l) / t);
  const X2 = w => comp('X2', 'Laba ditahan ÷ Total aset', 'Laba ditahan ÷ Total aset', w, [I('Laba ditahan', 'retainedEarnings'), TA], (r, t) => r / t);
  const X3 = w => comp('X3', 'EBIT ÷ Total aset', 'Laba operasi (pendekatan EBIT) ÷ Total aset', w, [I('Laba operasi (≈EBIT)', 'operatingIncome'), TA], (e, t) => e / t);
  const total = (m, components, formula) => {
    const missing = components.filter(x => x.value === null);
    if (missing.length) return { name: m.name, score: null, zone: null, components, formula, thresholds: { safe: m.safe, distress: m.distress }, reason: 'Data kurang: ' + missing.map(x => x.id + (x.reason ? ' (' + x.reason.replace(/^Data kurang: /, '') + ')' : '')).join('; ') };
    const s = components.reduce((a, x) => a + x.contribution, 0);
    const zn = zone(s, m);
    return { name: m.name, score: s, zone: zn, interpretation: INTERP[zn], components, formula, thresholds: { safe: m.safe, distress: m.distress } };
  };
  const w = ALTMAN.zpp.w;
  const zpp = total(ALTMAN.zpp, [X1(w[0]), X2(w[1]), X3(w[2]),
    comp('X4', 'Ekuitas buku ÷ Total liabilitas', 'Ekuitas pemegang saham (nilai buku) ÷ Total liabilitas', w[3], [I('Ekuitas (buku)', 'equity'), TL], (e, l) => e / l)],
  "Z'' = 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4. Zona: > 2.6 aman, 1.1–2.6 abu-abu, < 1.1 tekanan.");
  let z = null;
  if (marketCap && num(marketCap.value) !== null) {
    const w2 = ALTMAN.z.w;
    const mv = { name: 'Kapitalisasi pasar', key: 'marketCap', value: marketCap.value, period: marketCap.period || 'harga terkini', concept: marketCap.concept || 'Harga × saham beredar', rec: marketCap.rec || null };
    z = total(ALTMAN.z, [X1(w2[0]), X2(w2[1]), X3(w2[2]),
      comp('X4', 'Nilai pasar ekuitas ÷ Total liabilitas', 'Kapitalisasi pasar (harga terkini) ÷ Total liabilitas FY' + fy, w2[3], [mv, TL], (m, l) => m / l),
      comp('X5', 'Penjualan ÷ Total aset', 'Pendapatan ÷ Total aset', w2[4], [I('Pendapatan', 'revenue'), TA], (r, t) => r / t)],
    'Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5. Zona: > 2.99 aman, 1.81–2.99 abu-abu, < 1.81 tekanan. Kapitalisasi memakai harga terkini, neraca memakai FY' + fy + '.');
  }
  return { applicable: true, fy, zpp, z, zReason: z ? null : 'Z asli butuh kapitalisasi pasar nyata (harga × saham beredar); tidak tersedia.' };
}
