/* =====================================================================
   PALSU-UNTUK-UJI: meniru respons API sungguhan (format sama, angka acak berbenih)
   HANYA dipakai oleh qa/e2e.mjs karena lingkungan pengembangan tidak punya internet.
   Semua judul berita diawali "[UJI]" supaya screenshot jelas bukan data nyata.
   Tidak pernah ikut dalam dist/quant-terminal.html.
   ===================================================================== */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WC = require('../node_modules/world-countries/countries.json').filter(c => c.independent);

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(String(seed)); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const now = Date.now();
const json = (o, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(o) });
const text = (t, type = 'text/csv') => ({ status: 200, type, body: t });

const RANGES = {
  'NY.GDP.MKTP.KD.ZG': [-2, 8], 'FP.CPI.TOTL.ZG': [0, 15], 'SL.UEM.TOTL.ZS': [2, 18], 'GC.DOD.TOTL.GD.ZS': [20, 130], 'GC.NLD.TOTL.GD.ZS': [-8, 3], 'BN.CAB.XOKA.GD.ZS': [-8, 10],
  'NY.GDP.MKTP.CD': [5e9, 2e13], 'NY.GDP.PCAP.CD': [600, 70000], 'FI.RES.TOTL.MO': [1, 14], 'GOV_WGI_PV.EST': [-2.2, 1.4], 'PV.EST': [-2.2, 1.4], 'SP.POP.TOTL': [5e5, 3e8],
  'NE.EXP.GNFS.ZS': [10, 70], 'NE.IMP.GNFS.ZS': [15, 70], 'FI.RES.TOTL.CD': [1e9, 5e11], 'EG.IMP.CONS.ZS': [-150, 90], 'TX.VAL.FUEL.ZS.UN': [0, 60], 'TX.VAL.MMTL.ZS.UN': [0, 30],
  'TX.VAL.FOOD.ZS.UN': [3, 45], 'TX.VAL.AGRI.ZS.UN': [0, 10], 'TM.VAL.FUEL.ZS.UN': [5, 30], 'FR.INR.LEND': [3, 18], 'FR.INR.RINR': [-3, 9], 'BX.KLT.DINV.WD.GD.ZS': [-1, 6],
  'NV.AGR.TOTL.ZS': [1, 30], 'NV.IND.TOTL.ZS': [15, 45], 'NV.SRV.TOTL.ZS': [35, 75], 'PA.NUS.FCRF': [0.5, 15000],
};
const IMF_R = { NGDP_RPCH: [-2, 8], PCPIPCH: [0.5, 14], LUR: [2, 18], GGXWDG_NGDP: [15, 140], GGXCNL_NGDP: [-8, 3], BCA_NGDPD: [-8, 10], NGDPD: [5, 25000], NGDPDPC: [600, 80000] };
const ri = (r, [a, b]) => a + (b - a) * r();

function worldbank(url) {
  const m = /\/country\/([^/]+)\/indicator\/([^?]+)/.exec(url.pathname);
  const country = m[1], inds = decodeURIComponent(m[2]).split(';');
  const rows = [];
  const cs = country === 'all' ? WC : WC.filter(c => c.cca3 === country);
  const date = url.searchParams.get('date');
  const years = date ? (() => { const [a, b] = date.split(':').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i).filter(y => y <= 2025); })() : [2025];
  for (const ind of inds) for (const c of cs) for (const y of years) {
    const r = rng(ind + c.cca3 + y);
    if (r() < 0.06) continue;
    rows.push({ indicator: { id: ind, value: ind }, country: { id: c.cca2, value: c.name.common }, countryiso3code: c.cca3, date: String(y), value: +ri(r, RANGES[ind] || [0, 100]).toFixed(3), unit: '', obs_status: '', decimal: 1 });
  }
  return json([{ page: 1, pages: 1, per_page: 20000, total: rows.length, sourceid: '2', lastupdated: '2026-09-15' }, rows]);
}
function imf(url) {
  const ind = url.pathname.split('/').pop();
  const out = {};
  for (const c of WC) {
    const r = rng(ind + c.cca3);
    if (r() < 0.12) continue;
    const base = ri(r, IMF_R[ind] || [0, 10]);
    const s = {};
    for (let y = 2000; y <= 2031; y++) s[y] = +(base * (0.85 + 0.3 * rng(ind + c.cca3 + y)())).toFixed(2);
    out[c.cca3] = s;
  }
  return json({ values: { [ind]: out }, api: { version: '1', 'output-method': 'json' } });
}
const HEAD = [
  'Bank Indonesia expected to hold rates as rupiah steadies', 'Oil prices could surge as Hormuz tanker traffic slows', 'Fed officials signal possible rate cut amid cooling inflation',
  'China exports beat forecasts despite tariff fears', 'Protests spread over fuel subsidy cuts', 'Election results boost local stocks', 'Sanctions on shipping firms widen',
  'Earthquake disrupts port operations', 'Central bank warns of currency volatility', 'Nvidia shares rally on AI chip demand', 'Bitcoin slips as crypto ETFs see outflows',
  'Government debt downgrade risk rises, says rating agency', 'Red Sea attacks push freight rates higher', 'Unemployment rises to two-year high', 'Inflation eases for third month',
  'OPEC+ considers extending output cuts', 'Trade deal talks resume between major economies', 'Missile strike near border escalates tensions', 'Stock market selloff deepens on recession fears',
  'Ceasefire agreement eases regional tensions',
];
const DOMAINS = ['example-wire.test', 'example-daily.test', 'example-markets.test', 'contoh-berita.test', 'example-asia.test'];
function gdeltDoc(url) {
  const mode = url.searchParams.get('mode');
  const q = url.searchParams.get('query') || '';
  const r = rng(q + mode);
  if (/timeline/i.test(mode)) return json({ query_details: { title: q }, timeline: [{ series: 'Average Tone', data: Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (29 - i) * 86400e3).toISOString().slice(0, 10).replace(/-/g, '') + 'T000000Z', value: +(ri(r, [-3, 1])).toFixed(2) })) }] });
  const who = (/"([^"]+)"/.exec(q) || [])[1] || (/sourcecountry:(\w+)/.exec(q) || [])[1] || 'Global';
  const n = +url.searchParams.get('maxrecords') || 50;
  const arts = Array.from({ length: Math.min(n, 60) }, (_, i) => {
    const t = new Date(now - i * 23 * 60e3 - r() * 600e3);
    return { url: `https://example-news.test/${hash(q + i)}`, url_mobile: '', title: `[UJI] ${who}: ${HEAD[(hash(q) + i) % HEAD.length]}`, seendate: t.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', socialimage: '', domain: DOMAINS[i % DOMAINS.length], language: 'English', sourcecountry: ['United States', 'United Kingdom', 'Indonesia', 'Singapore', 'India'][i % 5] };
  });
  return json({ articles: arts });
}
const CITIES = [['Jakarta', 106.8, -6.2], ['Washington', -77.0, 38.9], ['Beijing', 116.4, 39.9], ['Moscow', 37.6, 55.8], ['Kyiv', 30.5, 50.4], ['Tehran', 51.4, 35.7], ['Gaza', 34.4, 31.5], ['Riyadh', 46.7, 24.7], ['London', -0.1, 51.5], ['Brussels', 4.35, 50.85], ['Tokyo', 139.7, 35.7], ['New Delhi', 77.2, 28.6], ['Brasilia', -47.9, -15.8], ['Nairobi', 36.8, -1.3], ['Caracas', -66.9, 10.5], ['Hormuz', 56.25, 26.57], ['Sanaa', 44.2, 15.4], ['Manila', 121.0, 14.6], ['Taipei', 121.5, 25.0], ['Ankara', 32.9, 39.9]];
function gdeltGeo() {
  return json({ type: 'FeatureCollection', features: CITIES.map(([n, lon, lat], i) => ({ type: 'Feature', properties: { name: n, count: 5 + (hash(n) % 80), html: `<a href="https://example-news.test/geo${i}" title="[UJI] ${HEAD[i % HEAD.length]}">x</a>` }, geometry: { type: 'Point', coordinates: [lon, lat] } })) });
}
const CRYPTO = { BTCUSDT: 97000, ETHUSDT: 3600, SOLUSDT: 195, BNBUSDT: 720 };
function binance(url) {
  const p = url.pathname;
  if (p.endsWith('/ticker/24hr')) {
    const syms = JSON.parse(url.searchParams.get('symbols') || '["BTCUSDT"]');
    const t = Math.floor(now / 4000);
    return json(syms.map(s => { const r = rng(s + t); const base = CRYPTO[s] || 10; const last = base * (1 + (r() - 0.5) * 0.004); const chg = (r() - 0.45) * 4; return { symbol: s, priceChangePercent: chg.toFixed(3), lastPrice: last.toFixed(2), openPrice: (last / (1 + chg / 100)).toFixed(2), highPrice: (last * 1.01).toFixed(2), lowPrice: (last * 0.985).toFixed(2), volume: (1000 + r() * 2e4).toFixed(2), quoteVolume: '0', bidPrice: (last * 0.9999).toFixed(2), askPrice: last.toFixed(2), closeTime: now }; }));
  }
  if (p.endsWith('/klines')) {
    const s = url.searchParams.get('symbol'), lim = +url.searchParams.get('limit') || 100, iv = url.searchParams.get('interval');
    const step = { '5m': 300, '4h': 14400, '1d': 86400, '1w': 604800 }[iv] || 86400;
    const r = rng(s + iv); let c = (CRYPTO[s] || 10) * 0.8;
    const out = [];
    for (let i = lim - 1; i >= 0; i--) { const o = c; c = c * (1 + (r() - 0.48) * 0.04); out.push([(Math.floor(now / 1000 / step) - i) * step * 1000, o.toFixed(2), (Math.max(o, c) * 1.01).toFixed(2), (Math.min(o, c) * 0.99).toFixed(2), c.toFixed(2), (500 + r() * 3000).toFixed(2)]); }
    return json(out);
  }
  if (p.endsWith('/depth')) {
    const s = url.searchParams.get('symbol'), mid = CRYPTO[s] || 10, r = rng(s + Math.floor(now / 3000));
    return json({ lastUpdateId: 1, bids: Array.from({ length: 100 }, (_, i) => [(mid - 0.5 - i * mid * 0.0002).toFixed(2), (r() * 3).toFixed(4)]), asks: Array.from({ length: 100 }, (_, i) => [(mid + i * mid * 0.0002).toFixed(2), (r() * 3).toFixed(4)]) });
  }
  return json({ code: -1, msg: 'unknown' }, 400);
}
function usgs() {
  const r = rng('usgs');
  return json({ type: 'FeatureCollection', features: Array.from({ length: 30 }, (_, i) => { const lon = [120, 140, -72, 95, 170, 26][i % 6] + (r() - 0.5) * 20, lat = [-5, 36, -30, 3, -18, 38][i % 6] + (r() - 0.5) * 12, mag = 4.5 + r() * 2.4; return { type: 'Feature', id: 'uji' + i, properties: { mag: +mag.toFixed(1), place: `[UJI] ${Math.round(r() * 200)} km dari titik uji`, time: now - r() * 6 * 86400e3, url: 'https://earthquake.usgs.gov/', alert: mag > 6.5 ? 'yellow' : null, tsunami: 0, title: `[UJI] M ${mag.toFixed(1)}` }, geometry: { type: 'Point', coordinates: [lon, lat, 10 + r() * 80] } }; }) });
}
function gdacs() {
  return json({ type: 'FeatureCollection', features: [['TC', 128, 16, 'Orange'], ['FL', 90, 23, 'Red'], ['VO', 110.4, -7.5, 'Green'], ['DR', 20, 10, 'Orange'], ['WF', -120, 38, 'Green']].map(([k, lon, lat, a], i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { eventtype: k, eventid: 1000 + i, name: `[UJI] peristiwa ${k}`, alertlevel: a, country: 'Uji', fromdate: new Date(now - i * 86400e3).toISOString().slice(0, 19), todate: new Date(now).toISOString().slice(0, 19), severitydata: { severitytext: 'uji' }, url: { report: 'https://www.gdacs.org/' } } })) });
}
function erapi() {
  const rates = { USD: 1 };
  for (const c of WC) for (const k of Object.keys(c.currencies || {})) rates[k] ??= +(1 + (hash(k) % 20000) / 3).toFixed(4);
  rates.IDR = 16420; rates.EUR = 0.86; rates.JPY = 148.3;
  return json({ result: 'success', time_last_update_unix: Math.floor(now / 1000) - 3600, base_code: 'USD', rates });
}
const BOXES = [[26.5, 56.3], [12.6, 43.4], [30.0, 32.4], [2.8, 101.5], [-6.0, 105.8], [-8.5, 115.7], [9.1, -79.7], [41.1, 29.0], [51.0, 1.4], [24.2, 119.5]];
function digitraffic(url) {
  if (url.pathname.endsWith('/vessels')) return json(Array.from({ length: 120 }, (_, i) => ({ mmsi: 230000000 + i, name: `UJI BALTIC ${i}`, shipType: [70, 80, 60, 52, 30][i % 5], destination: ['FIHEL', 'SESTO', 'EETLL'][i % 3], imo: 9000000 + i, draught: 60 + i % 40, timestamp: now - 3600e3 })));
  const t = now / 1000;
  return json({ type: 'FeatureCollection', features: Array.from({ length: 120 }, (_, i) => { const r = rng('dt' + i); const cog = r() * 360, sog = r() < 0.3 ? 0 : 6 + r() * 12; const d = sog * (t % 3600) / 3600 / 60; return { mmsi: 230000000 + i, type: 'Feature', geometry: { type: 'Point', coordinates: [20 + r() * 8 + Math.sin(cog * Math.PI / 180) * d, 59 + r() * 2 + Math.cos(cog * Math.PI / 180) * d * 0.5] }, properties: { mmsi: 230000000 + i, sog: +sog.toFixed(1), cog: +cog.toFixed(1), navStat: sog ? 0 : 5, heading: Math.round(cog), timestampExternal: now - r() * 60e3 } }; }) });
}
const CHOKES = [['chokepoint1', 'Suez Canal', 32.33, 30.6, 55], ['chokepoint2', 'Panama Canal', -79.75, 9.12, 35], ['chokepoint3', 'Bosporus Strait', 29.06, 41.12, 120], ['chokepoint4', 'Bab el-Mandeb Strait', 43.35, 12.6, 30], ['chokepoint5', 'Malacca Strait', 101.4, 2.5, 230], ['chokepoint6', 'Strait of Hormuz', 56.25, 26.57, 110], ['chokepoint7', 'Cape of Good Hope', 18.47, -34.36, 85], ['chokepoint8', 'Gibraltar Strait', -5.6, 35.95, 250], ['chokepoint9', 'Dover Strait', 1.45, 51.0, 300], ['chokepoint10', 'Taiwan Strait', 119.6, 24.3, 260], ['chokepoint11', 'Lombok Strait', 115.72, -8.47, 25], ['chokepoint12', 'Sunda Strait', 105.85, -5.95, 40]];
function portwatch(url) {
  const off = +url.searchParams.get('resultOffset') || 0, cnt = +url.searchParams.get('resultRecordCount') || 2000;
  const rows = [];
  for (let d = 0; d < 420; d++) for (const [id, name, x, y, base] of CHOKES) {
    const r = rng(id + d);
    const shock = name.includes('Bab') || name.includes('Suez') ? (d < 60 ? 0.55 : 1) : 1;
    const tot = Math.round(base * shock * (0.85 + r() * 0.3));
    rows.push({ attributes: { date: Date.UTC(2026, 9, 1) - d * 86400e3, portid: id, portname: name, n_total: tot, n_tanker: Math.round(tot * 0.3), n_container: Math.round(tot * 0.25), n_dry_bulk: Math.round(tot * 0.25), n_general_cargo: Math.round(tot * 0.1), n_roro: Math.round(tot * 0.05), n_cargo: Math.round(tot * 0.7), capacity: tot * 40000 }, geometry: { x, y } });
  }
  return json({ features: rows.slice(off, off + cnt) });
}
const FRED_BASE = { DGS3MO: 3.9, DGS6MO: 3.85, DGS1: 3.7, DGS2: 3.55, DGS5: 3.7, DGS10: 4.1, DGS30: 4.65, DFII10: 1.8, T10Y2Y: 0.55, T10Y3M: 0.2, T5YIE: 2.3, CPIAUCSL: 320, CPILFESL: 325, PPIFIS: 150, A191RL1Q225SBEA: 2.1, UNRATE: 4.3, PAYEMS: 159500, RSAFS: 730000, INDPRO: 103, UMCSENT: 58, DFF: 4.1, FEDFUNDS: 4.1, M2SL: 22000, BAMLH0A0HYM2: 3.1, BAMLC0A0CM: 0.85, VIXCLS: 17, SP500: 6700, NIKKEI225: 45000, NASDAQCOM: 22500, DTWEXBGS: 120, DCOILWTICO: 64, DCOILBRENTEU: 67, DHHNGSP: 3.0, PNGASJPUSDM: 11.5, PCOALAUUSDM: 105, PCOPPUSDM: 9800, PALUMUSDM: 2600, PNICKUSDM: 15200, PURANUSDM: 75, PWHEAMTUSDM: 230, PMAIZMTUSDM: 190, PCOFFOTMUSDM: 390, PCOTTINDUSDM: 75, PSUGAISAUSDM: 17, PPOILUSDM: 950, DEXJPUS: 148, DEXUSEU: 1.16, CBBTCUSD: 97000, WTISPLC: 64 };
function fredSeries(id, start) {
  const base = FRED_BASE[id] ?? (id.startsWith('IRLTLT01') ? 3 + (hash(id) % 400) / 100 : 100);
  const monthly = /^P[A-Z]+USDM$|CPI|PPI|UNRATE|PAYEMS|RSAFS|INDPRO|UMCSENT|M2SL|FEDFUNDS|WTISPLC|IRLTLT01/.test(id);
  const quarterly = id === 'A191RL1Q225SBEA';
  const r = rng(id);
  const out = [];
  const end = new Date(now); end.setUTCHours(0, 0, 0, 0);
  const s = new Date(start || '2021-01-01');
  const level = /^(DGS|T10|T5Y|DFII|UNRATE|DFF|FEDFUNDS|BAML|VIX|A191|IRLTLT)/.test(id);
  let v = base * (level ? 1 : 0.6);
  const days = Math.round((end - s) / 86400e3);
  const trend = level ? 0 : Math.log(1 / 0.6) / Math.max(days, 1);
  for (let d = new Date(s); d <= end; d = new Date(d.getTime() + 86400e3)) {
    const dow = d.getUTCDay();
    if (monthly && d.getUTCDate() !== 1) continue;
    if (quarterly && (d.getUTCDate() !== 1 || d.getUTCMonth() % 3)) continue;
    if (!monthly && !quarterly && (dow === 0 || dow === 6)) continue;
    const step = monthly ? 30 : quarterly ? 91 : 1;
    v = level ? Math.max(0.05, v + (r() - 0.5) * 0.05 * Math.sqrt(step) + (base - v) * 0.01) : v * Math.exp(trend * step + (r() - 0.5) * 0.02 * Math.sqrt(step));
    out.push({ date: d.toISOString().slice(0, 10), value: +v.toFixed(3) });
  }
  return out;
}
function fredApi(url) {
  const id = url.searchParams.get('series_id');
  return json({ observations: fredSeries(id, url.searchParams.get('observation_start')).map(o => ({ date: o.date, value: String(o.value) })) });
}
function fredCsv(url) {
  const id = url.searchParams.get('id');
  return text('observation_date,' + id + '\n' + fredSeries(id, url.searchParams.get('cosd')).map(o => o.date + ',' + o.value).join('\n'));
}
function bis() {
  const rates = { US: [4.375, 4.125], XM: [2.25, 2.0], JP: [0.5, 0.5], GB: [4.0, 3.75], CN: [3.0, 3.0], CH: [0.25, 0.0], AU: [3.85, 3.6], NZ: [3.25, 3.0], ID: [5.5, 4.75], KR: [2.5, 2.5], PH: [5.25, 5.0], IN: [5.5, 5.5], CA: [2.75, 2.5], BR: [15, 15], MX: [8.0, 7.5], TR: [43, 40.5], ZA: [7.0, 7.0] };
  const lines = ['FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE'];
  for (const [k, [a, b]] of Object.entries(rates)) for (let m = 0; m < 12; m++) { const d = new Date(Date.UTC(2025, 9 + m, 1)); lines.push(`M,${k},${d.toISOString().slice(0, 7)},${m < 8 ? a : b}`); }
  return text(lines.join('\n'));
}
function coingecko(url) {
  if (url.pathname.includes('/ohlc')) { const r = rng(url.pathname); let c = 90000; return json(Array.from({ length: 120 }, (_, i) => { const o = c; c *= 1 + (r() - 0.48) * 0.03; return [now - (119 - i) * 4 * 3600e3, o, Math.max(o, c) * 1.01, Math.min(o, c) * 0.99, c]; })); }
  return json([['bitcoin', 'btc', 97100], ['ethereum', 'eth', 3590], ['solana', 'sol', 194], ['binancecoin', 'bnb', 719], ['tether', 'usdt', 1.0003]].map(([id, s, p], i) => ({ id, symbol: s, name: id, current_price: p, price_change_percentage_24h: 1.1 - i, market_cap: p * 1e7, fully_diluted_valuation: p * 1.1e7, total_volume: p * 1e5, high_24h: p * 1.01, low_24h: p * 0.98, market_cap_rank: i + 1, last_updated: new Date(now).toISOString() })));
}
function finnhub(url) {
  const p = url.pathname, sym = url.searchParams.get('symbol') || 'AAPL';
  const base = { AAPL: 235, MSFT: 510, NVDA: 185, AMZN: 225, GOOGL: 250, META: 720, TSLA: 430, JPM: 300, VALE: 10.5 }[sym] || 50;
  if (p.endsWith('/quote')) return json({ c: base * 1.004, d: base * 0.004, dp: 0.4, h: base * 1.01, l: base * 0.99, o: base, pc: base, t: Math.floor(now / 1000) });
  if (p.endsWith('/stock/metric')) return json({ metric: { peTTM: 31.2, pbQuarterly: 45.1, psTTM: 8.4, epsTTM: 7.1, roeTTM: 150.2, roaTTM: 28.4, grossMarginTTM: 46.2, operatingMarginTTM: 31.5, netProfitMarginTTM: 24.3, 'totalDebt/totalEquityQuarterly': 1.5, currentRatioQuarterly: 0.87, revenueGrowthTTMYoy: 5.9, epsGrowthTTMYoy: 9.2, beta: 1.2, dividendYieldIndicatedAnnual: 0.44, marketCapitalization: 3500000, '52WeekHigh': 260, '52WeekLow': 170, freeCashFlowPerShareTTM: 6.9 }, series: {} });
  if (p.endsWith('/profile2')) return json({ name: `[UJI] ${sym} Inc`, country: 'US', currency: 'USD', exchange: 'NASDAQ', finnhubIndustry: 'Technology', ipo: '1980-12-12', marketCapitalization: 3500000, shareOutstanding: 15000, weburl: 'https://example.test', ticker: sym });
  if (p.endsWith('/insider-transactions')) return json({ data: [{ name: 'UJI DIREKTUR A', share: 100000, change: -5000, filingDate: '2026-09-20', transactionDate: '2026-09-18', transactionCode: 'S', transactionPrice: base }, { name: 'UJI DIREKTUR B', share: 20000, change: 2000, filingDate: '2026-08-10', transactionDate: '2026-08-08', transactionCode: 'P', transactionPrice: base * 0.95 }], symbol: sym });
  if (p.endsWith('/stock/earnings')) return json([1, 2, 3, 4].map(q => ({ actual: 1.5 + q * 0.05, estimate: 1.45 + q * 0.05, period: `2026-0${(4 - q) * 3 || 3}-30`, surprise: 0.05, surprisePercent: 3.3, symbol: sym })));
  if (p.endsWith('/company-news')) return json(HEAD.slice(0, 12).map((h, i) => ({ headline: `[UJI] ${sym}: ${h}`, datetime: Math.floor(now / 1000) - i * 3600, source: DOMAINS[i % 5], url: 'https://example-news.test/fh' + i, summary: '' })));
  if (p.endsWith('/stock/peers')) return json(['MSFT', 'GOOGL']);
  if (p.endsWith('/stock/recommendation')) return json([{ period: '2026-10-01', strongBuy: 12, buy: 20, hold: 10, sell: 1, strongSell: 0 }]);
  return json({ error: 'unknown' }, 404);
}
function yahoo(url) {
  const sym = decodeURIComponent(url.pathname.split('/').pop());
  const r = rng(sym), base = 100 + (hash(sym) % 9000);
  const iv = url.searchParams.get('interval'), range = url.searchParams.get('range');
  const step = iv === '5m' ? 300 : iv === '1wk' ? 604800 : 86400, n = range === '1d' ? 78 : range === '5y' ? 260 : 250;
  let c = base; const ts = [], o = [], h = [], l = [], cl = [], v = [];
  for (let i = n - 1; i >= 0; i--) { const op = c; c *= 1 + (r() - 0.49) * 0.02; ts.push(Math.floor(now / 1000) - i * step); o.push(op); h.push(Math.max(op, c) * 1.005); l.push(Math.min(op, c) * 0.995); cl.push(c); v.push(Math.round(r() * 1e6)); }
  return json({ chart: { result: [{ meta: { currency: /\.L$/.test(sym) ? 'GBp' : 'USD', symbol: sym, exchangeName: 'UJI', regularMarketPrice: c, chartPreviousClose: base, regularMarketTime: Math.floor(now / 1000) }, timestamp: ts, indicators: { quote: [{ open: o, high: h, low: l, close: cl, volume: v }] } }], error: null } });
}
function wiki(url) {
  if (url.pathname.includes('/page/summary/')) { const t = decodeURIComponent(url.pathname.split('/').pop()).replace(/_/g, ' '); return json({ type: 'standard', title: t, description: '[UJI] tokoh publik', extract: `[UJI] ${t} adalah tokoh contoh untuk pengujian. Nvidia disebut di sini untuk menguji tautan aset.`, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(t) } }, timestamp: '2026-09-01T00:00:00Z' }); }
  const q = url.searchParams.get('srsearch') || '';
  return json({ query: { search: [{ title: q.replace(/\b\w/g, c => c.toUpperCase()), snippet: '[UJI] hasil pencarian', pageid: 1 }] } });
}

/* router utama: URL -> {status, type, body} atau null bila host tidak dikenal */
/* sumber palsu tambahan per fitur: qa/fakes/*.mjs mengekspor default (url: URL) => {status, type, body} | null.
   Fitur baru menambah file di sana tanpa mengubah file ini. */
const FAKE_DIR = fileURLToPath(new URL('./fakes/', import.meta.url));
const EXTRA = [];
if (existsSync(FAKE_DIR)) for (const f of readdirSync(FAKE_DIR).filter(x => x.endsWith('.mjs')).sort()) EXTRA.push((await import(pathToFileURL(FAKE_DIR + f).href)).default);
export function fakeUpstream(href) {
  const url = new URL(href);
  for (const fn of EXTRA) { const r = fn(url); if (r) return r; }
  const h = url.hostname;
  if (h === 'api.worldbank.org') return worldbank(url);
  if (h === 'www.imf.org') return imf(url);
  if (h === 'api.gdeltproject.org') return url.pathname.includes('/geo/') ? gdeltGeo(url) : gdeltDoc(url);
  if (h === 'api.binance.com' || h === 'data-api.binance.vision') return binance(url);
  if (h === 'earthquake.usgs.gov') return usgs(url);
  if (h === 'www.gdacs.org') return gdacs(url);
  if (h === 'open.er-api.com') return erapi(url);
  if (h === 'meri.digitraffic.fi') return digitraffic(url);
  if (h === 'services9.arcgis.com') return portwatch(url);
  if (h === 'api.stlouisfed.org') return fredApi(url);
  if (h === 'fred.stlouisfed.org') return fredCsv(url);
  if (h === 'stats.bis.org') return bis(url);
  if (h === 'api.coingecko.com') return coingecko(url);
  if (h === 'finnhub.io') return finnhub(url);
  if (h === 'query1.finance.yahoo.com') return yahoo(url);
  if (h === 'en.wikipedia.org') return wiki(url);
  return null;
}

/* WebSocket palsu meniru AISStream: posisi kapal yang bergerak menurut haluannya */
export class FakeAisSocket {
  constructor() {
    this.binaryType = 'blob';
    setTimeout(() => this.onopen && this.onopen(), 50);
  }
  send(msg) {
    const sub = JSON.parse(msg);
    if (!sub.APIKey) { setTimeout(() => this.onclose && this.onclose({ code: 1008, reason: 'api key' }), 10); return; }
    const ships = Array.from({ length: 240 }, (_, i) => { const r = rng('ais' + i); const [la, lo] = BOXES[i % BOXES.length]; return { mmsi: 400000000 + i, lat: la + (r() - 0.5) * 1.5, lon: lo + (r() - 0.5) * 1.5, cog: r() * 360, sog: r() < 0.2 ? 0 : 8 + r() * 10, type: [70, 71, 80, 84, 60, 30][i % 6] }; });
    const emit = o => this.onmessage && this.onmessage({ data: Buffer.from(JSON.stringify(o)) });
    for (const s of ships) emit({ MessageType: 'ShipStaticData', MetaData: { MMSI: s.mmsi, ShipName: `UJI ${s.type >= 80 ? (s.type === 84 ? 'LNG' : 'TANKER') : 'CARGO'} ${s.mmsi % 1000}`, time_utc: new Date().toISOString().replace('T', ' ').replace('Z', ' +0000 UTC') }, Message: { ShipStaticData: { Name: `UJI ${s.type === 84 ? 'LNG' : s.type >= 80 ? 'TANKER' : 'CARGO'} ${s.mmsi % 1000}`, Type: s.type, Destination: 'UJI PORT', ImoNumber: 9000000 + s.mmsi % 1000, MaximumStaticDraught: 12 } } });
    this.timer = setInterval(() => {
      for (const s of ships) {
        const k = s.sog / 3600 / 60 * 30;        // 30 detik per langkah, dipercepat untuk uji
        s.lat += Math.cos(s.cog * Math.PI / 180) * k; s.lon += Math.sin(s.cog * Math.PI / 180) * k;
        emit({ MessageType: 'PositionReport', MetaData: { MMSI: s.mmsi, ShipName: '', latitude: s.lat, longitude: s.lon, time_utc: new Date().toISOString().replace('T', ' ').replace('Z', ' +0000 UTC') }, Message: { PositionReport: { Latitude: s.lat, Longitude: s.lon, Sog: s.sog, Cog: s.cog, TrueHeading: Math.round(s.cog), NavigationalStatus: s.sog ? 0 : 1 } } });
      }
    }, 1000);
    this.timer.unref?.();
  }
  close() { clearInterval(this.timer); }
}
