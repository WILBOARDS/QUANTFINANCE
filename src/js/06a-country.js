/* =====================================================================
   INTELIJEN NEGARA: kondisi ekonomi SEMUA negara + berita & spekulasi
   Sumber: IMF WEO (DataMapper) untuk angka utama + proyeksi, World Bank WDI
   untuk cadangan, perdagangan, energi, tata kelola. Kalau IMF gagal, indikator
   World Bank yang setara dipakai (fallback). Tidak ada angka yang ditebak.
   ===================================================================== */
const THIS_YEAR = new Date().getUTCFullYear();

/* indikator inti untuk tabel semua negara dan warna globe */
const MACRO = [
  { key: 'growth', label: 'Pertumbuhan PDB', short: 'PDB %', unit: '%', imf: 'NGDP_RPCH', wb: 'NY.GDP.MKTP.KD.ZG', dp: 1, good: 'high', domain: [-2, 8], center: 2.5 },
  { key: 'infl', label: 'Inflasi', short: 'Inflasi', unit: '%', imf: 'PCPIPCH', wb: 'FP.CPI.TOTL.ZG', dp: 1, good: 'target', domain: [0, 12], center: 2.5 },
  { key: 'unemp', label: 'Pengangguran', short: 'Pengang.', unit: '%', imf: 'LUR', wb: 'SL.UEM.TOTL.ZS', dp: 1, good: 'low', domain: [2, 18], center: 5 },
  { key: 'debt', label: 'Utang pemerintah', short: 'Utang', unit: '% PDB', imf: 'GGXWDG_NGDP', wb: 'GC.DOD.TOTL.GD.ZS', dp: 0, good: 'low', domain: [20, 140], center: 60 },
  { key: 'fiscal', label: 'Saldo fiskal', short: 'Fiskal', unit: '% PDB', imf: 'GGXCNL_NGDP', wb: 'GC.NLD.TOTL.GD.ZS', dp: 1, good: 'high', domain: [-8, 4], center: -2 },
  { key: 'ca', label: 'Transaksi berjalan', short: 'Trans. b.', unit: '% PDB', imf: 'BCA_NGDPD', wb: 'BN.CAB.XOKA.GD.ZS', dp: 1, good: 'high', domain: [-8, 8], center: 0 },
  { key: 'gdp', label: 'PDB nominal', short: 'PDB', unit: 'miliar USD', imf: 'NGDPD', wb: 'NY.GDP.MKTP.CD', wbScale: 1e-9, dp: 0, good: 'size', domain: [1, 30000] },
  { key: 'gdppc', label: 'PDB per kapita', short: 'Per kap.', unit: 'USD', imf: 'NGDPDPC', wb: 'NY.GDP.PCAP.CD', dp: 0, good: 'size', domain: [500, 80000] },
];
/* indikator World Bank tambahan (bulk, satu permintaan per indikator untuk semua negara) */
const WB_BULK = [
  { key: 'reservesMonths', label: 'Cadangan devisa', unit: 'bulan impor', code: 'FI.RES.TOTL.MO', dp: 1 },
  { key: 'polstab', label: 'Stabilitas politik (WGI)', unit: '−2,5…2,5', code: 'GOV_WGI_PV.EST', alt: 'PV.EST', source: 3, dp: 2 },
  { key: 'pop', label: 'Populasi', unit: 'jiwa', code: 'SP.POP.TOTL', dp: 0 },
];
/* indikator rinci untuk satu negara (riwayat) */
const WB_DETAIL = [
  ['NE.EXP.GNFS.ZS', 'Ekspor barang & jasa', '% PDB'], ['NE.IMP.GNFS.ZS', 'Impor barang & jasa', '% PDB'],
  ['FI.RES.TOTL.CD', 'Cadangan devisa total', 'USD'], ['EG.IMP.CONS.ZS', 'Impor energi neto', '% pemakaian energi'],
  ['TX.VAL.FUEL.ZS.UN', 'Ekspor bahan bakar', '% ekspor barang'], ['TX.VAL.MMTL.ZS.UN', 'Ekspor bijih & logam', '% ekspor barang'],
  ['TX.VAL.FOOD.ZS.UN', 'Ekspor pangan', '% ekspor barang'], ['TX.VAL.AGRI.ZS.UN', 'Ekspor bahan baku pertanian', '% ekspor barang'],
  ['TM.VAL.FUEL.ZS.UN', 'Impor bahan bakar', '% impor barang'], ['FR.INR.LEND', 'Suku bunga pinjaman', '%'],
  ['FR.INR.RINR', 'Suku bunga riil', '%'], ['BX.KLT.DINV.WD.GD.ZS', 'FDI masuk neto', '% PDB'],
  ['NV.AGR.TOTL.ZS', 'Pertanian', '% PDB'], ['NV.IND.TOTL.ZS', 'Industri', '% PDB'], ['NV.SRV.TOTL.ZS', 'Jasa', '% PDB'],
  ['PA.NUS.FCRF', 'Kurs resmi rata-rata', 'LCU per USD'],
];
/* bank sentral (fakta referensi statis) */
const CENTRAL_BANKS = {
  US: 'Federal Reserve (Fed)', XM: 'European Central Bank (ECB)', JP: 'Bank of Japan (BOJ)', GB: 'Bank of England (BOE)', CN: "People's Bank of China (PBOC)",
  CH: 'Swiss National Bank (SNB)', AU: 'Reserve Bank of Australia (RBA)', NZ: 'Reserve Bank of New Zealand (RBNZ)', ID: 'Bank Indonesia (BI)',
  KR: 'Bank of Korea (BOK)', SG: 'Monetary Authority of Singapore (MAS)', PH: 'Bangko Sentral ng Pilipinas (BSP)', IN: 'Reserve Bank of India (RBI)',
  CA: 'Bank of Canada (BOC)', BR: 'Banco Central do Brasil', MX: 'Banco de México', ZA: 'South African Reserve Bank', TR: 'Central Bank of the Republic of Türkiye',
  RU: 'Bank of Russia', SA: 'Saudi Central Bank (SAMA)', MY: 'Bank Negara Malaysia', TH: 'Bank of Thailand', VN: 'State Bank of Vietnam', SE: 'Sveriges Riksbank',
  NO: 'Norges Bank', DK: 'Danmarks Nationalbank', PL: 'Narodowy Bank Polski', CZ: 'Czech National Bank', HU: 'Magyar Nemzeti Bank', IL: 'Bank of Israel',
  CL: 'Banco Central de Chile', CO: 'Banco de la República', PE: 'Banco Central de Reserva del Perú', AR: 'Banco Central de la República Argentina',
  HK: 'Hong Kong Monetary Authority', TW: 'Central Bank of the Republic of China (Taiwan)', IS: 'Central Bank of Iceland', RO: 'National Bank of Romania',
  RS: 'National Bank of Serbia', MK: 'National Bank of North Macedonia', HR: 'ECB (Kroasia memakai euro)', DE: 'ECB (euro)', FR: 'ECB (euro)', IT: 'ECB (euro)', ES: 'ECB (euro)', NL: 'ECB (euro)',
};
const EURO = new Set(['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']);
const REGION_ID = { Asia: 'Asia', Europe: 'Eropa', Africa: 'Afrika', Americas: 'Amerika', Oceania: 'Oseania', Antarctic: 'Antartika' };

const CountryData = (() => {
  const store = {};                 // iso3 -> { key: {value, year, src, proj} }
  const meta = {};                  // key -> {res, source, via, fetchedAt, quality, sourceUrl}
  let coreP = null;

  const put = (iso3, key, v) => { (store[iso3] ||= {})[key] = v; };

  /* ---- IMF: satu permintaan per indikator, semua negara, 1980..proyeksi 5 tahun ---- */
  async function loadImf(ind) {
    const r = await getData('imf', {
      server: '/api/imf?indicator=' + ind.imf, direct: 'https://www.imf.org/external/datamapper/api/v1/' + ind.imf,
      parse: raw => Parsers.parseImf(raw, ind.imf), post: compactImf, ttl: 12 * 3600e3, persist: true, key: 'imf2:' + ind.imf, timeout: 30000,
    });
    return r;
  }
  function compactImf(p) {             // simpan tahun >= 2000 saja supaya hemat localStorage
    const out = {};
    for (const [iso, ser] of Object.entries(p.series)) out[iso] = ser.filter(x => x.year >= 2000).map(x => [x.year, Math.round(x.value * 1000) / 1000]);
    return out;
  }
  async function loadWbBulk(code, source) {
    const q = `indicator=${encodeURIComponent(code)}&country=all&mrnev=1${source ? '&source=' + source : ''}`;
    return getData('worldbank', {
      server: '/api/worldbank?' + q,
      direct: `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&mrnev=1${source ? '&source=' + source : ''}`,
      parse: Parsers.parseWorldBank, post: p => { const o = {}; for (const r of p.rows) if (r.iso3 && (!o[r.iso3] || r.year > o[r.iso3][0])) o[r.iso3] = [r.year, r.value]; return o; },
      ttl: 12 * 3600e3, persist: true, key: 'wb2:' + code, timeout: 30000,
    });
  }

  /* angka "terkini" dari deret IMF: tahun berjalan (proyeksi IMF) */
  function pickImf(ser) {
    if (!ser || !ser.length) return null;
    const hit = ser.find(([y]) => y === THIS_YEAR) || ser.filter(([y]) => y <= THIS_YEAR).pop();
    return hit ? { value: hit[1], year: hit[0] } : null;
  }

  async function loadCore() {
    if (coreP) return coreP;
    coreP = (async () => {
      const results = await Promise.all(MACRO.map(async ind => {
        const r = await loadImf(ind);
        if (r.ok && r.data && Object.keys(r.data).length > 20) {
          for (const [iso, ser] of Object.entries(r.data)) {
            const p = pickImf(ser);
            if (p) put(iso, ind.key, { value: p.value, year: p.year, series: ser, src: 'IMF WEO', proj: p.year >= THIS_YEAR, quality: r.stale ? 'stale' : p.year >= THIS_YEAR ? 'projection' : 'historical', code: ind.imf });
          }
          meta[ind.key] = { ...r, sourceName: 'IMF WEO DataMapper', code: ind.imf };
          return true;
        }
        /* fallback World Bank */
        const w = await loadWbBulk(ind.wb);
        if (w.ok && w.data) {
          for (const [iso, [y, v]] of Object.entries(w.data)) put(iso, ind.key, { value: ind.wbScale ? v * ind.wbScale : v, year: y, src: 'World Bank WDI', proj: false, quality: w.stale ? 'stale' : 'historical', code: ind.wb });
          meta[ind.key] = { ...w, sourceName: 'World Bank WDI (cadangan karena IMF: ' + (r.error || 'gagal') + ')', code: ind.wb, fallback: true };
          return true;
        }
        meta[ind.key] = { ok: false, error: 'IMF: ' + r.error + ' | World Bank: ' + w.error };
        return false;
      }));
      await Promise.all(WB_BULK.map(async ind => {
        let w = await loadWbBulk(ind.code, ind.source);
        if ((!w.ok || !w.data || !Object.keys(w.data).length) && ind.alt) w = await loadWbBulk(ind.alt, ind.source);
        if (w.ok && w.data) {
          for (const [iso, [y, v]] of Object.entries(w.data)) put(iso, ind.key, { value: v, year: y, src: 'World Bank ' + (ind.source === 3 ? 'WGI' : 'WDI'), quality: w.stale ? 'stale' : 'historical', code: ind.code });
          meta[ind.key] = { ...w, sourceName: 'World Bank', code: ind.code };
        } else meta[ind.key] = { ok: false, error: w.error };
      }));
      bus.emit('countryData');
      return results.some(Boolean);
    })();
    return coreP;
  }

  function get(iso3, key) { return store[iso3] && store[iso3][key] ? store[iso3][key] : null; }
  function score(iso3) {
    const v = k => { const x = get(iso3, k); return x ? x.value : null; };
    return Analytics.countryScore({ growth: v('growth'), unemp: v('unemp'), infl: v('infl'), debt: v('debt'), fiscal: v('fiscal'), ca: v('ca'), reservesMonths: v('reservesMonths'), polstab: v('polstab') });
  }
  function reload() { coreP = null; for (const k of Object.keys(store)) delete store[k]; return loadCore(); }

  /* ---- rincian satu negara: banyak indikator WB dalam satu permintaan (source=2) ---- */
  async function detail(iso3) {
    const codes = WB_DETAIL.map(d => d[0]).join(';');
    const r = await getData('worldbank', {
      server: `/api/worldbank?indicator=${encodeURIComponent(codes)}&country=${iso3}&date=2005:${THIS_YEAR}&source=2`,
      direct: `https://api.worldbank.org/v2/country/${iso3}/indicator/${codes}?format=json&per_page=2000&date=2005:${THIS_YEAR}&source=2`,
      parse: Parsers.parseWorldBank, post: p => p.rows, ttl: 12 * 3600e3, persist: true, key: 'wbd2:' + iso3, timeout: 30000,
    });
    return r;
  }

  /* ---- kurs: semua mata uang terhadap USD ---- */
  let fxP = null;
  function fx() {
    if (!fxP) fxP = (async () => {
      let r = await getData('fx', { server: '/api/fx', direct: 'https://open.er-api.com/v6/latest/USD', parse: Parsers.parseErApi, ttl: 3600e3, persist: true, key: 'fx' });
      if (!r.ok) r = await getData('frankfurter', { direct: 'https://api.frankfurter.app/latest?from=USD', parse: Parsers.parseFrankfurter, ttl: 3600e3, persist: true, key: 'fx2' });
      if (!r.ok) fxP = null;
      return r;
    })();
    return fxP;
  }
  /* ---- suku bunga kebijakan BIS (lewat server) ---- */
  let bisP = null;
  function policyRates() {
    if (!bisP) bisP = getData('bis', { server: '/api/bis/policy', ttl: 12 * 3600e3, persist: true, key: 'bis' }).then(r => { if (!r.ok) bisP = null; return r; });
    return bisP;
  }
  /* ---- imbal hasil obligasi 10 tahun (OECD via FRED, bulanan) ---- */
  async function bond10y(iso2) {
    await Net.ready();
    if (!Net.server) return { ok: false, error: 'butuh server lokal (FRED)' };
    const id = 'IRLTLT01' + iso2 + 'M156N';
    const r = await getData('fred', { server: `/api/fred?series=${id}&start=${THIS_YEAR - 3}-01-01`, ttl: 12 * 3600e3, persist: true, key: 'fred:' + id });
    if (r.ok && r.data[id] && r.data[id].data.length) return { ...r, series: r.data[id].data, id };
    return { ok: false, error: r.error || (r.data && r.data.errors && r.data.errors[id]) || 'tidak ada seri OECD untuk negara ini' };
  }

  /* ---- berita negara (GDELT) ---- */
  function newsQuery(c, mode) {
    const nm = c.en.replace(/[^\w\s.'-]/g, '');
    if (mode === 'local') return `sourcecountry:${nm.toLowerCase().replace(/[^a-z]/g, '')}`;
    return `"${nm}" (economy OR inflation OR "central bank" OR election OR currency OR trade OR market OR oil OR government OR protest OR sanctions OR investment) sourcelang:english`;
  }
  async function news(c, mode = 'about', span = '3d', alive) {
    const query = newsQuery(c, mode);
    const p = new URLSearchParams({ query, mode: 'artlist', format: 'json', timespan: span, maxrecords: '75', sort: 'DateDesc' });
    return getData('gdelt', {
      server: '/api/gdelt/doc?' + new URLSearchParams({ query, mode: 'artlist', timespan: span, maxrecords: '75', sort: 'DateDesc' }),
      direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + p, parse: Parsers.parseGdeltArticles,
      ttl: 15 * 60e3, persist: true, key: 'gdn:' + mode + ':' + c.iso3 + ':' + span, timeout: 35000, alive,
    });
  }
  async function tone(c, alive) {
    const query = newsQuery(c, 'about');
    const p = new URLSearchParams({ query, mode: 'timelinetone', format: 'json', timespan: '30d' });
    return getData('gdelt', {
      server: '/api/gdelt/doc?' + new URLSearchParams({ query, mode: 'timelinetone', timespan: '30d' }),
      direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + p, parse: Parsers.parseGdeltTimeline,
      ttl: 60 * 60e3, persist: true, key: 'gdt:' + c.iso3, timeout: 35000, alive,
    });
  }

  return { loadCore, reload, get, score, meta, store, detail, fx, policyRates, bond10y, news, tone };
})();

/* ---------- format nilai makro ---------- */
function fmtMacro(ind, v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  if (ind.key === 'gdp') return v >= 1000 ? fmt(v / 1000, 2) + ' T' : fmt(v, 0) + ' M';
  if (ind.key === 'gdppc') return fmt(v, 0);
  return fmt(v, ind.dp ?? 1);
}
function macroColor(ind, v) {
  if (!Number.isFinite(v)) return null;
  if (!ind.domain) return divergingColor((v - 50) / 30);       // skor negara 0-100
  const [a, b] = ind.domain;
  if (ind.good === 'high') return divergingColor((v - (ind.center ?? (a + b) / 2)) / ((b - a) / 2));
  if (ind.good === 'low') return divergingColor(-(v - (ind.center ?? (a + b) / 2)) / ((b - a) / 2));
  if (ind.good === 'target') return divergingColor(1 - Math.abs(v - ind.center) / 4);
  if (ind.good === 'size') return mixColor('1e3a5a', '6fb1ff', clamp(Math.log10(Math.max(v, a) / a) / Math.log10(b / a), 0, 1));
  if (ind.key === 'score') return divergingColor((v - 50) / 30);
  return null;
}
/* tombol nilai dengan asal-usul (lineage) */
function macroCell(iso3, ind, opts = {}) {
  const x = CountryData.get(iso3, ind.key);
  if (!x) return `<span class="na">–</span>`;
  const m = CountryData.meta[ind.key] || {};
  const html = esc(fmtMacro(ind, x.value)) + (opts.unit ? ` <small>${esc(ind.unit)}</small>` : '') + (opts.year ? ` <small>${x.year}${x.proj ? 'p' : ''}</small>` : '');
  return Lineage.wrap({
    label: `${ind.label} (${(C3.get(iso3) || {}).name || iso3})`, value: fmtMacro(ind, x.value), unit: ind.unit, quality: x.quality,
    source: x.src + ' · kode ' + x.code, home: x.src.startsWith('IMF') ? 'https://www.imf.org/external/datamapper/' + x.code : 'https://data.worldbank.org/indicator/' + x.code,
    url: m.sourceUrl || '', asOf: 'tahun ' + x.year + (x.proj ? ' (proyeksi IMF)' : ''), fetchedAt: m.fetchedAt, via: m.via,
    raw: x.value, note: x.proj ? 'Nilai tahun berjalan dari IMF WEO adalah estimasi/proyeksi, bisa direvisi.' : (m.fallback ? 'Dipakai World Bank karena IMF gagal.' : ''),
  }, html);
}

/* =====================================================================
   HALAMAN NEGARA
   ===================================================================== */
const CountryPage = (() => {
  const S = { q: '', region: 'ALL', sort: 'name', dir: 'asc', sel: Store.get('country', 'IDN'), tab: 'overview', cmp: Store.get('cmp', ['IDN', 'USA', 'CHN']), newsMode: 'about' };
  let built = false;
  const cols = [
    { k: 'name', label: 'Negara', get: c => c.name },
    { k: 'growth', label: 'PDB %', num: true },
    { k: 'infl', label: 'Inflasi', num: true },
    { k: 'unemp', label: 'Pengang.', num: true },
    { k: 'debt', label: 'Utang', num: true },
    { k: 'ca', label: 'TB', num: true },
    { k: 'score', label: 'Skor', num: true, get: c => CountryData.score(c.iso3).total },
  ];
  const valOf = (c, k) => {
    const col = cols.find(x => x.k === k);
    if (col && col.get) return col.get(c);
    const x = CountryData.get(c.iso3, k); return x ? x.value : null;
  };
  function rows() {
    const q = S.q.trim().toLowerCase();
    let list = COUNTRIES.filter(c => c.indep || CountryData.get(c.iso3, 'gdp'));
    if (S.region !== 'ALL') list = list.filter(c => c.region === S.region);
    if (q) list = list.filter(c => (c.name + ' ' + c.en + ' ' + c.iso3 + ' ' + c.iso2 + ' ' + c.capital).toLowerCase().includes(q));
    const dir = S.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const va = valOf(a, S.sort), vb = valOf(b, S.sort);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'id') * dir;
      const fa = Number.isFinite(va), fb = Number.isFinite(vb);
      if (!fa && !fb) return 0; if (!fa) return 1; if (!fb) return -1;
      return (va - vb) * dir;
    });
    return list;
  }
  function renderTable() {
    const list = rows();
    $('#cCount').textContent = `${list.length} negara`;
    const head = `<thead><tr>${cols.map(c => `<th scope="col" class="${c.num ? 'num' : ''}"><button type="button" data-sort="${c.k}" ${S.sort === c.k ? `data-dir="${S.dir}"` : ''}>${c.label}</button></th>`).join('')}</tr></thead>`;
    const body = list.map(c => {
      const cells = cols.map(col => {
        if (col.k === 'name') return `<td><span>${esc(c.name)}</span><span class="sub">${esc(c.iso3)} · ${esc(REGION_ID[c.region] || c.region)}</span></td>`;
        const v = valOf(c, col.k);
        if (!Number.isFinite(v)) return `<td class="num c-na">–</td>`;
        const ind = MACRO.find(m => m.key === col.k);
        const colr = ind ? macroColor(ind, v) : macroColor({ key: 'score' }, v);
        return `<td class="num"><span class="heat" style="background:${colr}55">${col.k === 'score' ? v : fmt(v, ind && ind.key === 'debt' ? 0 : 1)}</span></td>`;
      }).join('');
      return `<tr data-iso="${c.iso3}" tabindex="0" aria-selected="${c.iso3 === S.sel}">${cells}</tr>`;
    }).join('');
    $('#cTable').innerHTML = head + `<tbody>${body}</tbody>`;
    const m = CountryData.meta.growth;
    $('#cSrc').innerHTML = m ? `${qBadge(m.ok === false ? 'unavailable' : m.stale ? 'stale' : m.fallback ? 'historical' : 'projection')} ${esc(m.sourceName || '')}${m.fetchedAt ? ' · ' + esc(fmtAge(m.fetchedAt)) : ''} · nilai ${THIS_YEAR} = estimasi IMF · skor = kalkulasi eksperimental` : '<span class="loading">Memuat data ekonomi semua negara</span>';
  }

  /* ---------------- detail ---------------- */
  function kpi(iso3, key) {
    const ind = MACRO.find(m => m.key === key) || WB_BULK.find(m => m.key === key);
    return `<div><dt>${esc(ind.label)}</dt><dd>${macroCell(iso3, ind, { year: true })} <small>${esc(ind.unit)}</small></dd></div>`;
  }
  function lineChart(series, opts = {}) {
    /* series: [{name, color, pts:[{x(year), y, proj}]}] */
    const Wd = 560, Ht = 170, L = 38, R = 10, T = 10, B = 22;
    const all = series.flatMap(s => s.pts).filter(p => Number.isFinite(p.y));
    if (all.length < 2) return '<p class="hint">Data riwayat tidak cukup.</p>';
    const x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
    let y0 = Math.min(0, ...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
    if (y1 - y0 < 1) y1 = y0 + 1;
    const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
    const X = x => L + (Wd - L - R) * (x - x0) / Math.max(x1 - x0, 1), Y = y => T + (Ht - T - B) * (1 - (y - y0) / (y1 - y0));
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = y0 + (y1 - y0) * k / 4; g += `<line x1="${L}" x2="${Wd - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#17314a"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(v, Math.abs(y1 - y0) < 10 ? 1 : 0)}</text>`; }
    if (y0 < 0 && y1 > 0) g += `<line x1="${L}" x2="${Wd - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#2a4a68" stroke-width="1.2"/>`;
    const step = Math.max(1, Math.ceil((x1 - x0) / 8));
    for (let x = x0; x <= x1; x += step) g += `<text x="${X(x)}" y="${Ht - 6}" text-anchor="middle">${x}</text>`;
    if (THIS_YEAR >= x0 && THIS_YEAR <= x1) g += `<rect x="${X(THIS_YEAR) - 2}" y="${T}" width="${Wd - R - X(THIS_YEAR) + 2}" height="${Ht - T - B}" fill="rgba(195,155,255,0.06)"/><text x="${X(THIS_YEAR) + 4}" y="${T + 10}" style="fill:#c39bff">proyeksi</text>`;
    const lines = series.map(s => {
      const pts = s.pts.filter(p => Number.isFinite(p.y));
      const act = pts.filter(p => !p.proj), pr = pts.filter(p => p.proj);
      const d = arr => arr.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
      const join = act.length && pr.length ? [act[act.length - 1], ...pr] : pr;
      return `<path d="${d(act)}" fill="none" stroke="${s.color}" stroke-width="2"/>` + (join.length > 1 ? `<path d="${d(join)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="4 3"/>` : '');
    }).join('');
    return `<div class="svgchart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="${esc(opts.label || 'Grafik riwayat')}">${g}${lines}</svg>` +
      `<div class="lg">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}<span>garis putus = proyeksi IMF</span></div></div>`;
  }

  function renderScore(iso3) {
    const sc = CountryData.score(iso3);
    const bar = v => `<div class="meter"><i style="width:${v}%;background:${divergingColor((v - 50) / 35)}"></i></div>`;
    return `<div class="c-sec"><h3>Skor negara ${qBadge('calculated')} <span class="flag">Eksperimental</span></h3>
      <div class="bigscore"><strong>${sc.total === null ? '–' : sc.total}</strong><span class="meta">dari 100 · ${Math.round(sc.coverage * 100)}% komponen tersedia</span></div>
      <div class="scoregrid">${sc.groups.map(g => `<div class="sg-row"><span>${esc(g.label)}</span>${g.score === null ? '<span class="meta">tidak ada data</span>' : bar(g.score)}<span class="num">${g.score ?? '–'}</span></div>`).join('')}</div>
      <details class="explain"><summary>Lihat rumus dan data mentah</summary>
        <table class="dense static"><thead><tr><th>Komponen</th><th class="num">Nilai</th><th class="num">Skor</th><th>Rumus</th></tr></thead><tbody>
        ${sc.groups.flatMap(g => g.parts).map(p => `<tr><td>${esc(p.label)}</td><td class="num">${fmt(p.raw, 2)}</td><td class="num">${p.score}</td><td>${esc(p.rule)}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada komponen.</td></tr>'}
        </tbody></table>
        <p class="hint">Total = rata-rata kelompok yang punya data (minimal 3 kelompok). Bukan peringkat kredit, bukan prediksi. Ambang dan rumus pilihan pembuat aplikasi.</p>
      </details></div>`;
  }

  function overview(c) {
    const iso = c.iso3;
    const ser = key => { const x = CountryData.get(iso, key); return x && x.series ? x.series.map(([y, v]) => ({ x: y, y: v, proj: y >= THIS_YEAR })) : []; };
    const cb = EURO.has(c.iso2) ? 'European Central Bank (ECB), zona euro' : CENTRAL_BANKS[c.iso2] || 'tidak ada di daftar referensi';
    return `<div class="c-body">
      <div class="c-cols">
        <div class="c-sec"><h3>Kondisi ekonomi</h3>
          <dl class="kv three">${['growth', 'infl', 'unemp', 'debt', 'fiscal', 'ca', 'gdp', 'gdppc', 'reservesMonths'].map(k => kpi(iso, k)).join('')}</dl>
          ${lineChart([{ name: 'Pertumbuhan PDB riil (%)', color: '#34d1a4', pts: ser('growth') }, { name: 'Inflasi (%)', color: '#ff9f6b', pts: ser('infl') }, { name: 'Pengangguran (%)', color: '#6fb1ff', pts: ser('unemp') }], { label: 'Riwayat pertumbuhan, inflasi, pengangguran' })}
          ${verdict(c)}
        </div>
        <div class="c-sec">${renderScore(iso)}
          <div class="c-sec"><h3>Pasar dan moneter</h3><dl class="kv" id="cMon"><div><dt>Bank sentral</dt><dd style="white-space:normal;font-family:var(--font-ui);font-size:12px">${esc(cb)}</dd></div></dl></div>
        </div>
      </div>
      <div class="c-cols">
        <div class="c-sec"><h3>Struktur ekonomi, perdagangan, energi</h3><div id="cDetailWb"><p class="loading">Memuat World Bank</p></div></div>
        <div class="c-sec"><h3>Profil</h3><dl class="kv">
          <div><dt>Ibu kota</dt><dd style="font-family:var(--font-ui)">${esc(c.capital || '–')}</dd></div>
          <div><dt>Mata uang</dt><dd>${esc(c.cur || '–')}</dd></div>
          <div><dt>Wilayah</dt><dd style="font-family:var(--font-ui)">${esc(c.sub || c.region)}</dd></div>
          <div><dt>Populasi</dt><dd>${macroCell(iso, WB_BULK[2], { year: true })}</dd></div>
          <div><dt>Stabilitas politik WGI</dt><dd>${macroCell(iso, WB_BULK[1], { year: true })}</dd></div>
          <div><dt>Peringkat kredit</dt><dd class="na" title="Peringkat S&P/Moody's/Fitch berlisensi; tidak ada sumber gratis resmi">tidak tersedia</dd></div>
        </dl></div>
      </div>
    </div>`;
  }
  /* ringkasan kata-kata dari angka (kalkulasi, bukan opini) */
  function verdict(c) {
    /* sumber dan tahun ditulis apa adanya per angka (IMF proyeksi, IMF aktual, atau World Bank tahun lama) */
    const used = [];
    const g = k => { const x = CountryData.get(c.iso3, k); if (x && x.value !== null && x.value !== undefined) { used.push(x); return x.value; } return null; };
    const out = [];
    const gr = g('growth'), inf = g('infl'), un = g('unemp'), debt = g('debt'), ca = g('ca'), fis = g('fiscal');
    const grProj = (CountryData.get(c.iso3, 'growth') || {}).proj;
    if (gr !== null) out.push(gr < 0 ? `ekonomi ${grProj ? 'diperkirakan ' : ''}menyusut (${fmt(gr, 1)}%)` : gr < 1.5 ? `pertumbuhan lemah (${fmt(gr, 1)}%)` : gr > 5 ? `pertumbuhan tinggi (${fmt(gr, 1)}%)` : `pertumbuhan moderat (${fmt(gr, 1)}%)`);
    if (inf !== null) out.push(inf > 10 ? `inflasi sangat tinggi (${fmt(inf, 1)}%)` : inf > 5 ? `inflasi tinggi (${fmt(inf, 1)}%)` : inf < 0 ? `deflasi (${fmt(inf, 1)}%)` : `inflasi terkendali (${fmt(inf, 1)}%)`);
    if (un !== null && un > 10) out.push(`pengangguran tinggi (${fmt(un, 1)}%)`);
    if (debt !== null && debt > 90) out.push(`utang pemerintah besar (${fmt(debt, 0)}% PDB)`);
    if (fis !== null && fis < -5) out.push(`defisit fiskal lebar (${fmt(fis, 1)}% PDB)`);
    if (ca !== null) out.push(ca < -4 ? `defisit transaksi berjalan lebar (${fmt(ca, 1)}% PDB), rentan arus modal keluar` : ca > 4 ? `surplus transaksi berjalan (${fmt(ca, 1)}% PDB)` : '');
    const txt = out.filter(Boolean);
    if (!txt.length) return '';
    const basis = [...new Set(used.map(x => `${x.src || 'sumber'} ${x.year || ''}${x.proj ? ' (proyeksi)' : ''}`.trim()))].join(', ');
    return `<p class="lead">${qBadge('calculated')} Ringkasan otomatis dari ${esc(basis)}: ${esc(txt.join('; '))}.</p>`;
  }

  async function fillDetail(c) {
    const box = $('#cDetailWb');
    const r = await CountryData.detail(c.iso3);
    if (!box || !box.isConnected || S.sel !== c.iso3) return;
    if (!r.ok) { box.innerHTML = unavailableBox('Rincian World Bank', r); return; }
    const by = {};
    for (const row of r.data) (by[row.indicator] ||= []).push(row);
    const cells = WB_DETAIL.map(([code, label, unit]) => {
      const arr = (by[code] || []).sort((a, b) => b.year - a.year);
      const x = arr[0];
      if (!x) return `<div><dt>${esc(label)}</dt><dd class="na">– <small>${esc(unit)}</small></dd></div>`;
      const v = unit === 'USD' ? fmtCompact(x.value) : unit.startsWith('LCU') ? fmt(x.value, x.value > 100 ? 0 : 2) : fmt(x.value, 1);
      return `<div><dt>${esc(label)}</dt><dd>${Lineage.wrap({ label: label + ' (' + c.name + ')', value: v, unit, quality: r.stale ? 'stale' : 'historical', source: 'World Bank WDI · ' + code, home: 'https://data.worldbank.org/indicator/' + code, url: r.sourceUrl, asOf: 'tahun ' + x.year, fetchedAt: r.fetchedAt, via: r.via, raw: x.value }, esc(v))} <small>${x.year}</small> <small>${esc(unit)}</small></dd></div>`;
    }).join('');
    const ex = by['TX.VAL.FUEL.ZS.UN']?.[0], mm = by['TX.VAL.MMTL.ZS.UN']?.[0], fd = by['TX.VAL.FOOD.ZS.UN']?.[0], ei = by['EG.IMP.CONS.ZS']?.[0];
    const notes = [];
    if (ex && ex.value > 30) notes.push(`eksportir energi (bahan bakar ${fmt(ex.value, 0)}% ekspor barang): harga minyak/gas tinggi cenderung menguntungkan neraca`);
    if (ei && ei.value > 30) notes.push(`importir energi neto (${fmt(ei.value, 0)}% pemakaian energi diimpor): rentan lonjakan harga minyak`);
    if (ei && ei.value < -50) notes.push(`produsen energi neto (impor energi ${fmt(ei.value, 0)}%)`);
    if (mm && mm.value > 20) notes.push(`bergantung ekspor logam/bijih (${fmt(mm.value, 0)}%): sensitif harga logam dan permintaan Tiongkok`);
    if (fd && fd.value > 30) notes.push(`bergantung ekspor pangan (${fmt(fd.value, 0)}%): sensitif cuaca dan harga pangan`);
    box.innerHTML = `<dl class="kv three">${cells}</dl>` + (notes.length ? `<p class="lead">${qBadge('inference')} Paparan komoditas: ${esc(notes.join('; '))}.</p>` : '') +
      `<p class="hint">Mitra dagang utama: tidak tersedia (belum ada sumber gratis yang terpasang; kandidat: WITS/UN Comtrade).</p>` + srcLine(r);
  }
  async function fillMonetary(c) {
    const el = $('#cMon'); if (!el) return;
    const add = html => { if (el.isConnected && S.sel === c.iso3) el.insertAdjacentHTML('beforeend', html); };
    CountryData.fx().then(r => {
      if (!c.cur) return;
      if (!r.ok) return add(`<div><dt>Kurs ${esc(c.cur)}/USD</dt><dd class="na" title="${esc(r.error)}">tidak tersedia</dd></div>`);
      const v = r.data.rates[c.cur];
      add(`<div><dt>Kurs ${esc(c.cur)} per USD</dt><dd>${v ? Lineage.wrap({ label: 'Kurs ' + c.cur + '/USD', value: fmt(v, v > 100 ? 0 : 4), quality: r.stale ? 'stale' : 'eod', source: r.source, home: (r.extra && r.extra.fallback) || r.provider === 'frankfurter' ? SOURCE_DEFS.frankfurter.home : SOURCE_DEFS.fx.home, url: r.sourceUrl, asOf: r.data.asOf ? fmtTime(r.data.asOf) : '–', fetchedAt: r.fetchedAt, via: r.via, note: 'Kurs referensi harian, bukan kurs transaksi bank.' }, fmt(v, v > 100 ? 0 : 4)) : '<span class="na">–</span>'}</dd></div>`);
    });
    CountryData.policyRates().then(r => {
      const key = EURO.has(c.iso2) ? 'XM' : c.iso2;
      if (!r.ok) return add(`<div><dt>Suku bunga kebijakan</dt><dd class="na" title="${esc(r.error)}">tidak tersedia</dd></div>`);
      const s = r.data[key];
      if (!s || !s.length) return add(`<div><dt>Suku bunga kebijakan</dt><dd class="na">tidak ada di data BIS</dd></div>`);
      const last = s[s.length - 1], prev = s.slice(0, -1).reverse().find(x => x.value !== last.value);
      add(`<div><dt>Suku bunga kebijakan</dt><dd>${Lineage.wrap({ label: 'Suku bunga kebijakan ' + key, value: fmt(last.value, 2), unit: '%', quality: r.stale ? 'stale' : 'eod', source: 'BIS WS_CBPOL', home: SOURCE_DEFS.bis.home, url: r.sourceUrl, asOf: last.period, fetchedAt: r.fetchedAt, via: r.via, note: prev ? `Perubahan terakhir dari ${prev.value}% (sebelum ${prev.period})` : '' }, fmt(last.value, 2) + '%')} <small>${esc(last.period)}</small></dd></div>` +
        (prev ? `<div><dt>Arah kebijakan terakhir</dt><dd class="${last.value > prev.value ? 'down' : 'up'}" style="font-family:var(--font-ui);font-size:12px">${last.value > prev.value ? 'Naik' : 'Turun'} dari ${fmt(prev.value, 2)}%</dd></div>` : ''));
    });
    CountryData.bond10y(EURO.has(c.iso2) ? c.iso2 : c.iso2).then(r => {
      if (!r.ok) return add(`<div><dt>Obligasi 10 tahun</dt><dd class="na" title="${esc(r.error)}">tidak tersedia</dd></div>`);
      const last = r.series[r.series.length - 1];
      add(`<div><dt>Obligasi 10 tahun</dt><dd>${Lineage.wrap({ label: 'Imbal hasil 10 tahun', value: fmt(last.value, 2), unit: '%', quality: 'eod', source: 'OECD via FRED ' + r.id, home: 'https://fred.stlouisfed.org/series/' + r.id, url: r.sourceUrl, asOf: last.date + ' (bulanan)', fetchedAt: r.fetchedAt, via: r.via }, fmt(last.value, 2) + '%')} <small>${esc(last.date.slice(0, 7))}</small></dd></div>`);
    });
    const mk = Object.values(MARKETS).find(m => (m.id === 'UK' ? 'GB' : m.id) === c.iso2);
    if (mk) {
      const inst = BY[mk.idx];
      add(`<div><dt>Indeks ${esc(inst.name)}</dt><dd>${Number.isFinite(inst.price) ? fmt(inst.price, 2) + ` <small class="${sign(pct(inst))}">${fmtPct(pct(inst))}</small>` : '<span class="na">tidak tersedia</span>'} ${qBadge(inst.quality || 'unavailable')}</dd></div>`);
    }
  }

  /* ---------------- berita & spekulasi ---------------- */
  async function newsTab(c) {
    const el = $('#cNews');
    el.innerHTML = '<p class="loading">Mengambil berita dari GDELT (dibatasi 1 permintaan per 5 detik)</p>';
    const alive = () => el.isConnected && S.sel === c.iso3 && S.tab === 'news';
    const r = await CountryData.news(c, S.newsMode, undefined, alive);
    if (!el.isConnected || S.sel !== c.iso3) return;
    if (r.cancelled) return;
    if (!r.ok) {
      el.innerHTML = unavailableBox('Berita ' + c.name, r, 'GDELT gratis tapi membatasi 1 permintaan per 5 detik. Kalau browser diblokir CORS, jalankan server lokal (npm start).');
      return;
    }
    const sum = Analytics.summarizeNews(r.data);
    const maxN = Math.max(1, ...sum.themes.map(t => t.n));
    const sentTxt = sum.sentiment === null ? 'tidak cukup kata' : (sum.sentiment > 0.15 ? 'cenderung positif' : sum.sentiment < -0.15 ? 'cenderung negatif' : 'campuran/netral') + ` (${fmt(sum.sentiment, 2)}, dari ${sum.sentimentN} judul)`;
    el.innerHTML = `
      <div class="c-cols">
        <div class="c-sec"><h3>Isu yang paling banyak diberitakan ${qBadge('calculated', 'Kategori dari kata kunci judul')}</h3>
          <div class="theme-bars">${sum.themes.slice(0, 8).map(t => `<div class="tb"><span>${esc(t.label)}</span><div class="meter"><i style="width:${t.n / maxN * 100}%"></i></div><span class="num">${t.n}</span></div>`).join('') || '<p class="hint">Tidak ada tema yang dikenali.</p>'}</div>
          <p class="lead">Nada judul: ${esc(sentTxt)}. Dari ${sum.total} judul unik.</p>
          <div id="cTone"></div>
        </div>
        <div class="c-sec"><h3>Spekulasi dan ekspektasi di media ${qBadge('inference', 'Judul yang memuat kata perkiraan/rencana/risiko')}</h3>
          <p class="hint">Judul berikut memuat kata seperti "bisa", "diperkirakan", "berencana", "risiko", "khawatir". Ini yang <em>diperkirakan media</em>, bukan fakta yang sudah terjadi.</p>
          <div class="list">${sum.speculative.slice(0, 12).map(n => newsItem(n, true)).join('') || '<p class="hint">Tidak ada judul spekulatif dalam periode ini.</p>'}</div>
        </div>
      </div>
      <div class="c-sec"><h3>Semua judul terbaru</h3><div class="list">${sum.analyzed.slice(0, 60).map(n => newsItem(n)).join('')}</div>${srcLine(r, 'judul, sumber, waktu, dan tautan saja')}</div>`;
    const toneBox = $('#cTone');
    CountryData.tone(c, alive).then(t => {
      if (t.cancelled) return;
      /* kotak harus milik render negara ini; negara lain bisa sudah dipilih selama menunggu GDELT */
      const box = $('#cTone'); if (!box || box !== toneBox || !box.isConnected || S.sel !== c.iso3) return;
      if (!t.ok || !t.data.length) { box.innerHTML = `<p class="hint">Tren nada 30 hari tidak tersedia${t.error ? ': ' + esc(t.error) : ''}.</p>`; return; }
      const pts = t.data.map((p, i) => ({ x: i, y: p.v }));
      const Wd = 520, Ht = 80, ys = pts.map(p => p.y), lo = Math.min(...ys, -1), hi = Math.max(...ys, 1);
      const X = i => 4 + (Wd - 8) * i / Math.max(pts.length - 1, 1), Y = v => 6 + (Ht - 12) * (1 - (v - lo) / (hi - lo));
      box.innerHTML = `<div class="svgchart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Nada rata-rata berita 30 hari"><line x1="0" x2="${Wd}" y1="${Y(0)}" y2="${Y(0)}" stroke="#2a4a68"/><path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ')}" fill="none" stroke="#e0b15a" stroke-width="1.6"/></svg>
        <div class="lg"><span>Nada rata-rata GDELT 30 hari (negatif di bawah garis): terakhir ${fmt(ys[ys.length - 1], 2)}</span>${qBadge(t.stale ? 'stale' : 'delayed')}</div></div>`;
    });
  }
  function newsItem(n, spec) {
    const a = n.a;
    const th = a.themes.slice(0, 2).map(t => `<span class="tpill ${t.w >= 22 ? 'hot' : ''}">${esc(t.label)}</span>`).join('');
    return `<div><a class="item-title" href="${safeUrl(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <div class="item-meta"><span>${esc(n.domain)}</span><span>${esc(fmtAge(n.seen))}</span>${th}${spec ? `<span class="tpill spec">${esc(a.specWords.slice(0, 2).join(', '))}</span>` : ''}<span title="Skor dampak heuristik 0-100">dampak ${a.impact}</span></div></div>`;
  }

  /* ---------------- perbandingan ---------------- */
  function compareTab() {
    const list = S.cmp.map(i => C3.get(i)).filter(Boolean);
    const inds = [...MACRO, ...WB_BULK.slice(0, 2)];
    const rank = (ind, iso) => {
      const vals = list.map(c => ({ iso: c.iso3, v: (CountryData.get(c.iso3, ind.key) || {}).value })).filter(x => Number.isFinite(x.v));
      if (vals.length < 2 || ind.good === 'size') return '';
      const better = ind.good === 'low' ? (a, b) => a.v - b.v : ind.good === 'target' ? (a, b) => Math.abs(a.v - ind.center) - Math.abs(b.v - ind.center) : (a, b) => b.v - a.v;
      vals.sort(better);
      const r = vals.findIndex(x => x.iso === iso);
      return r === 0 ? ' <span class="tpill" style="color:var(--up)">#1</span>' : r >= 0 ? ` <span class="tpill">#${r + 1}</span>` : '';
    };
    return `<div class="c-body">
      <div class="cmp-tools"><span class="meta">Bandingkan sampai 4 negara.</span>
        ${list.map(c => `<button type="button" class="mini-btn" data-cmp-del="${c.iso3}" title="Hapus">${esc(c.name)} ×</button>`).join('')}
        <input class="mini-input" id="cmpAdd" list="cmpList" placeholder="Tambah negara" aria-label="Tambah negara untuk dibandingkan">
        <datalist id="cmpList">${COUNTRIES.filter(c => c.indep).map(c => `<option value="${esc(c.name)} (${c.iso3})">`).join('')}</datalist>
      </div>
      <div class="table-wrap"><table class="dense static"><thead><tr><th>Indikator</th>${list.map(c => `<th class="num">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
        ${inds.map(ind => `<tr><td>${esc(ind.label)} <small class="sub">${esc(ind.unit)}</small></td>${list.map(c => `<td class="num">${macroCell(c.iso3, ind, { year: false })}${rank(ind, c.iso3)}</td>`).join('')}</tr>`).join('')}
        <tr><td>Skor negara (eksperimental)</td>${list.map(c => { const s = CountryData.score(c.iso3).total; return `<td class="num">${s ?? '–'}</td>`; }).join('')}</tr>
      </tbody></table></div>
      <p class="hint">Peringkat (#1) hanya di antara negara yang dibandingkan: tinggi lebih baik untuk pertumbuhan, saldo fiskal, transaksi berjalan, cadangan, stabilitas; rendah lebih baik untuk pengangguran dan utang; inflasi paling dekat 2,5% terbaik. Nilai ${THIS_YEAR} adalah estimasi IMF.</p>
    </div>`;
  }

  function renderDetail() {
    const c = C3.get(S.sel) || C3.get('IDN');
    S.sel = c.iso3;
    const inCmp = S.cmp.includes(c.iso3);
    $('#cDetail').innerHTML = `
      <div class="c-head"><h2>${esc(c.name)}</h2><span class="iso">${esc(c.iso3)}</span><span class="sub">${esc(c.en)} · ${esc(c.sub || c.region)}</span>
        <span class="spacer"></span>
        <button type="button" class="mini-btn" data-act="globe">Lihat di globe</button>
        <button type="button" class="mini-btn" data-act="cmp" aria-pressed="${inCmp}">${inCmp ? 'Di perbandingan' : 'Tambah ke perbandingan'}</button>
        <button type="button" class="mini-btn" data-act="export">Unduh JSON</button></div>
      <div class="tabs" role="tablist">
        ${[['overview', 'Ringkasan ekonomi'], ['news', 'Berita dan spekulasi'], ['compare', 'Bandingkan']].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}
      </div>
      <div id="cTabBody">${S.tab === 'overview' ? overview(c) : S.tab === 'compare' ? compareTab() : `<div class="c-body"><div class="cmp-tools"><div class="seg" role="group" aria-label="Sumber berita"><button type="button" data-nm="about" aria-pressed="${S.newsMode === 'about'}">Tentang ${esc(c.name)} (EN)</button><button type="button" data-nm="local" aria-pressed="${S.newsMode === 'local'}">Media lokal</button></div></div><div id="cNews"></div></div>`}</div>`;
    if (S.tab === 'overview') { fillDetail(c); fillMonetary(c); }
    if (S.tab === 'news') newsTab(c);
  }

  function select(iso3, tab) {
    if (!C3.get(iso3)) return;
    S.sel = iso3; Store.set('country', iso3);
    if (tab) S.tab = tab;
    $$('#cTable tbody tr').forEach(tr => tr.setAttribute('aria-selected', String(tr.dataset.iso === iso3)));
    renderDetail();
  }

  function build() {
    if (built) return;
    built = true;
    const regs = ['ALL', 'Asia', 'Europe', 'Africa', 'Americas', 'Oceania'];
    $('#cRegions').innerHTML = regs.map(r => `<button type="button" data-r="${r}" aria-pressed="${S.region === r}">${r === 'ALL' ? 'Semua' : REGION_ID[r]}</button>`).join('');
    $('#cRegions').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.region = b.dataset.r; $$('#cRegions button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderTable(); });
    $('#cq').addEventListener('input', e => { S.q = e.target.value; renderTable(); });
    $('#cTable').addEventListener('click', e => {
      const sb = e.target.closest('[data-sort]');
      if (sb) { const k = sb.dataset.sort; S.dir = S.sort === k && S.dir === 'desc' ? 'asc' : S.sort === k ? 'desc' : (k === 'name' ? 'asc' : 'desc'); S.sort = k; renderTable(); return; }
      const tr = e.target.closest('tr[data-iso]'); if (tr) select(tr.dataset.iso);
    });
    $('#cDetail').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]'); if (t) { S.tab = t.dataset.tab; renderDetail(); return; }
      const nm = e.target.closest('[data-nm]'); if (nm) { S.newsMode = nm.dataset.nm; renderDetail(); return; }
      const del = e.target.closest('[data-cmp-del]'); if (del) { S.cmp = S.cmp.filter(x => x !== del.dataset.cmpDel); Store.set('cmp', S.cmp); renderDetail(); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'cmp') { if (!S.cmp.includes(S.sel)) { S.cmp = [...S.cmp, S.sel].slice(-4); Store.set('cmp', S.cmp); } S.tab = 'compare'; renderDetail(); }
      if (a.dataset.act === 'globe') bus.emit('intelCountry', S.sel);
      if (a.dataset.act === 'export') {
        const c = C3.get(S.sel), d = {};
        for (const ind of [...MACRO, ...WB_BULK]) d[ind.key] = CountryData.get(S.sel, ind.key);
        download(`negara-${S.sel}.json`, JSON.stringify({ country: c, data: d, score: CountryData.score(S.sel), exportedAt: new Date().toISOString(), note: 'Nilai tahun berjalan = estimasi IMF WEO' }, null, 2), 'application/json');
      }
    });
    $('#cDetail').addEventListener('change', e => {
      if (e.target.id !== 'cmpAdd') return;
      const m = /\(([A-Z]{3})\)\s*$/.exec(e.target.value) || [null, (COUNTRIES.find(c => c.name.toLowerCase() === e.target.value.trim().toLowerCase()) || {}).iso3];
      if (m[1] && C3.get(m[1]) && !S.cmp.includes(m[1])) { S.cmp = [...S.cmp, m[1]].slice(-4); Store.set('cmp', S.cmp); renderDetail(); }
    });
    $('#cExport').addEventListener('click', () => {
      const list = rows();
      download('negara-semua.csv', toCsv([['iso3', 'negara', ...MACRO.map(m => m.key + '_' + m.unit), 'skor'], ...list.map(c => [c.iso3, c.name, ...MACRO.map(m => (CountryData.get(c.iso3, m.key) || {}).value ?? ''), CountryData.score(c.iso3).total ?? ''])]), 'text/csv');
    });
    /* data inti selesai dimuat: perbarui tabel. Detail hanya digambar ulang bila pengguna tidak
       sedang mengetik/fokus di dalamnya (mis. kolom "Tambah negara" di tab Bandingkan) */
    bus.on('countryData', () => {
      renderTable();
      if (S.tab === 'news') return;
      const det = $('#cDetail');
      if (det && det.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { S.pendingDetail = true; return; }
      renderDetail();
    });
    $('#cDetail').addEventListener('focusout', () => { if (S.pendingDetail) { S.pendingDetail = false; setTimeout(() => { if (!$('#cDetail').contains(document.activeElement)) renderDetail(); }, 0); } });
  }

  return {
    S,
    show() {
      build();
      renderTable(); renderDetail();
      CountryData.loadCore();
    },
    open(iso3, tab) { S.tab = tab || S.tab; S.sel = iso3; Store.set('country', iso3); },
    compare(list) { S.cmp = list.filter(i => C3.get(i)).slice(0, 4); Store.set('cmp', S.cmp); S.tab = 'compare'; },
  };
})();
