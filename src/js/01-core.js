'use strict';
/* =====================================================================
   QuantTerminal: satu file, tanpa server.
   Urutan kode: core -> sim -> health -> map -> chart -> live -> cash -> app
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const RAD = Math.PI / 180;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- angka acak yang bisa diulang (seed dari nama saham) ---------- */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = mulberry32(hashStr(seed));
  const rng = () => r();
  rng.normal = () => {
    let u = 0, v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return rng;
}
function gauss() { // untuk tick real-time (tidak perlu bisa diulang)
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- pub-sub kecil supaya modul saling terhubung ---------- */
const bus = {
  _h: {},
  on(e, f) { (this._h[e] ||= []).push(f); },
  emit(e, a) { (this._h[e] || []).forEach(f => { try { f(a); } catch (err) { console.error(e, err); } }); },
};

/* ---------- format angka ---------- */
const _nf = {};
function fmt(x, d = 2) {
  if (!Number.isFinite(x)) return '–';
  const nf = _nf[d] || (_nf[d] = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nf.format(x);
}
function fmtPct(x, d = 2) {
  if (!Number.isFinite(x)) return '–';
  return (x >= 0 ? '+' : '\u2212') + Math.abs(x * 100).toFixed(d) + '%';
}
function fmtCompact(x) {
  if (!Number.isFinite(x) || x === 0) return '–';
  const a = Math.abs(x);
  if (a >= 1e12) return (x / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (x / 1e3).toFixed(1) + 'K';
  return x.toFixed(0);
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const sign = x => (x > 0 ? 'up' : x < 0 ? 'down' : '');

/* ---------- toast ---------- */
function toast(msg, ms = 5200) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------- penyimpanan kecil di browser (aman kalau diblokir) ---------- */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('qt.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('qt.' + k, JSON.stringify(v)); } catch { /* abaikan */ } },
};

/* =====================================================================
   DATA: bursa dunia
   sess = sesi perdagangan dalam menit sejak tengah malam waktu bursa
   lbl  = [geser x, geser y, rata] untuk label di peta
   ===================================================================== */
const MARKETS = {
  US: { city: 'New York', ex: 'NYSE dan Nasdaq', tz: 'America/New_York', lon: -74.0, lat: 40.7, country: 'United States of America', sess: [[570, 960]], idx: 'SPX', region: 'AM', lbl: [10, 9, 'left'] },
  CA: { city: 'Toronto', ex: 'TSX', tz: 'America/Toronto', lon: -79.4, lat: 43.7, country: 'Canada', sess: [[570, 960]], idx: 'TSX', region: 'AM', lbl: [-10, -9, 'right'] },
  BR: { city: 'São Paulo', ex: 'B3', tz: 'America/Sao_Paulo', lon: -46.6, lat: -23.5, country: 'Brazil', sess: [[600, 1020]], idx: 'IBOV', region: 'AM', lbl: [10, 4, 'left'] },
  UK: { city: 'London', ex: 'LSE', tz: 'Europe/London', lon: -0.1, lat: 51.5, country: 'United Kingdom', sess: [[480, 990]], idx: 'FTSE', region: 'EU', lbl: [-10, -8, 'right'] },
  FR: { city: 'Paris', ex: 'Euronext', tz: 'Europe/Paris', lon: 2.35, lat: 48.9, country: 'France', sess: [[540, 1050]], idx: 'CAC', region: 'EU', lbl: [-10, 13, 'right'] },
  DE: { city: 'Frankfurt', ex: 'Xetra', tz: 'Europe/Berlin', lon: 8.7, lat: 50.1, country: 'Germany', sess: [[540, 1050]], idx: 'DAX', region: 'EU', lbl: [11, -7, 'left'] },
  ZA: { city: 'Johannesburg', ex: 'JSE', tz: 'Africa/Johannesburg', lon: 28.0, lat: -26.2, country: 'South Africa', sess: [[540, 1020]], idx: 'JSE', region: null, lbl: [10, 4, 'left'] },
  SA: { city: 'Riyadh', ex: 'Tadawul', tz: 'Asia/Riyadh', lon: 46.7, lat: 24.7, country: 'Saudi Arabia', sess: [[600, 900]], days: [0, 1, 2, 3, 4], idx: 'TASI', region: null, lbl: [-10, -6, 'right'] },
  IN: { city: 'Mumbai', ex: 'BSE', tz: 'Asia/Kolkata', lon: 72.9, lat: 19.1, country: 'India', sess: [[555, 930]], idx: 'SENSEX', region: 'AP', lbl: [-10, 6, 'right'] },
  ID: { city: 'Jakarta', ex: 'IDX', tz: 'Asia/Jakarta', lon: 106.8, lat: -6.2, country: 'Indonesia', sess: [[540, 720], [810, 950]], sessFri: [[540, 690], [840, 950]], idx: 'IHSG', region: 'ID', lbl: [11, 9, 'left'] },
  SG: { city: 'Singapura', ex: 'SGX', tz: 'Asia/Singapore', lon: 103.8, lat: 1.35, country: null, sess: [[540, 1020]], idx: 'STI', region: 'AP', lbl: [-10, -5, 'right'] },
  CN: { city: 'Shanghai', ex: 'SSE', tz: 'Asia/Shanghai', lon: 121.5, lat: 31.2, country: 'China', sess: [[570, 690], [780, 900]], idx: 'SSEC', region: 'AP', lbl: [-11, -7, 'right'] },
  HK: { city: 'Hong Kong', ex: 'HKEX', tz: 'Asia/Hong_Kong', lon: 114.2, lat: 22.3, country: null, sess: [[570, 720], [780, 960]], idx: 'HSI', region: 'AP', lbl: [-10, 11, 'right'] },
  TW: { city: 'Taipei', ex: 'TWSE', tz: 'Asia/Taipei', lon: 121.5, lat: 25.0, country: 'Taiwan', sess: [[540, 810]], idx: 'TAIEX', region: 'AP', lbl: [11, 7, 'left'] },
  KR: { city: 'Seoul', ex: 'KRX', tz: 'Asia/Seoul', lon: 127.0, lat: 37.6, country: 'South Korea', sess: [[540, 930]], idx: 'KOSPI', region: 'AP', lbl: [9, -12, 'left'] },
  JP: { city: 'Tokyo', ex: 'JPX', tz: 'Asia/Tokyo', lon: 139.7, lat: 35.7, country: 'Japan', sess: [[540, 690], [750, 930]], idx: 'NKY', region: 'AP', lbl: [11, 3, 'left'] },
  AU: { city: 'Sydney', ex: 'ASX', tz: 'Australia/Sydney', lon: 151.2, lat: -33.9, country: 'Australia', sess: [[600, 960]], idx: 'ASX', region: 'AP', lbl: [-10, 3, 'right'] },
};
for (const id in MARKETS) MARKETS[id].id = id;

const REGIONS = [
  ['ALL', 'Semua'], ['AM', 'Amerika'], ['ID', 'Indonesia'], ['AP', 'Asia-Pasifik'], ['EU', 'Eropa'], ['CR', 'Kripto'],
];

/* [kode, nama, bursa, level dasar (SIMULASI), volatilitas harian] */
const INDEX_DEFS = [
  ['SPX', 'S&P 500', 'US', 6850, .009], ['TSX', 'S&P/TSX Composite', 'CA', 30500, .008],
  ['IBOV', 'Ibovespa', 'BR', 148000, .011], ['FTSE', 'FTSE 100', 'UK', 9750, .008],
  ['DAX', 'DAX 40', 'DE', 24300, .010], ['CAC', 'CAC 40', 'FR', 8150, .009],
  ['NKY', 'Nikkei 225', 'JP', 49500, .011], ['HSI', 'Hang Seng', 'HK', 26200, .012],
  ['SSEC', 'Shanghai Composite', 'CN', 3950, .008], ['KOSPI', 'KOSPI', 'KR', 3950, .011],
  ['TAIEX', 'TAIEX', 'TW', 27500, .010], ['SENSEX', 'BSE Sensex', 'IN', 83500, .008],
  ['IHSG', 'IHSG', 'ID', 8050, .009], ['STI', 'Straits Times', 'SG', 4650, .007],
  ['ASX', 'S&P/ASX 200', 'AU', 8950, .008], ['JSE', 'JSE Top 40', 'ZA', 112000, .009],
  ['TASI', 'Tadawul All Share', 'SA', 11200, .009],
];

/* [kode, nama, bursa, wilayah, mata uang, harga dasar (SIMULASI), vol harian, sektor, bank?, kode Binance] */
const STOCK_DEFS = [
  ['AAPL', 'Apple', 'US', 'AM', 'USD', 235, .017, 'Teknologi'],
  ['MSFT', 'Microsoft', 'US', 'AM', 'USD', 510, .015, 'Teknologi'],
  ['NVDA', 'NVIDIA', 'US', 'AM', 'USD', 185, .028, 'Teknologi'],
  ['AMZN', 'Amazon', 'US', 'AM', 'USD', 225, .020, 'Konsumer'],
  ['GOOGL', 'Alphabet', 'US', 'AM', 'USD', 250, .018, 'Komunikasi'],
  ['META', 'Meta Platforms', 'US', 'AM', 'USD', 720, .022, 'Komunikasi'],
  ['TSLA', 'Tesla', 'US', 'AM', 'USD', 430, .036, 'Otomotif'],
  ['JPM', 'JPMorgan Chase', 'US', 'AM', 'USD', 300, .014, 'Keuangan', 1],
  ['VALE', 'Vale', 'BR', 'AM', 'USD', 10.5, .019, 'Pertambangan'],
  ['BBCA', 'Bank Central Asia', 'ID', 'ID', 'IDR', 8500, .014, 'Keuangan', 1],
  ['BBRI', 'Bank Rakyat Indonesia', 'ID', 'ID', 'IDR', 3900, .017, 'Keuangan', 1],
  ['BMRI', 'Bank Mandiri', 'ID', 'ID', 'IDR', 4800, .016, 'Keuangan', 1],
  ['TLKM', 'Telkom Indonesia', 'ID', 'ID', 'IDR', 3350, .016, 'Telekomunikasi'],
  ['ASII', 'Astra International', 'ID', 'ID', 'IDR', 4900, .018, 'Industri'],
  ['UNVR', 'Unilever Indonesia', 'ID', 'ID', 'IDR', 1900, .021, 'Konsumer'],
  ['GOTO', 'GoTo Gojek Tokopedia', 'ID', 'ID', 'IDR', 68, .034, 'Teknologi'],
  ['7203', 'Toyota Motor', 'JP', 'AP', 'JPY', 2850, .016, 'Otomotif'],
  ['0700', 'Tencent', 'HK', 'AP', 'HKD', 610, .022, 'Teknologi'],
  ['005930', 'Samsung Electronics', 'KR', 'AP', 'KRW', 81000, .018, 'Teknologi'],
  ['2330', 'TSMC', 'TW', 'AP', 'TWD', 1220, .020, 'Teknologi'],
  ['BHP', 'BHP Group', 'AU', 'AP', 'AUD', 42, .016, 'Pertambangan'],
  ['ASML', 'ASML Holding', 'FR', 'EU', 'EUR', 700, .022, 'Teknologi'],
  ['SAP', 'SAP', 'DE', 'EU', 'EUR', 235, .016, 'Teknologi'],
  ['MC', 'LVMH', 'FR', 'EU', 'EUR', 520, .019, 'Konsumer'],
  ['SHEL', 'Shell', 'UK', 'EU', 'GBP', 27.5, .015, 'Energi'],
  ['AZN', 'AstraZeneca', 'UK', 'EU', 'GBP', 125, .015, 'Kesehatan'],
  ['BTC', 'Bitcoin', 'CRYPTO', 'CR', 'USD', 98000, .026, 'Kripto', 0, 'BTCUSDT'],
  ['ETH', 'Ethereum', 'CRYPTO', 'CR', 'USD', 3600, .032, 'Kripto', 0, 'ETHUSDT'],
  ['SOL', 'Solana', 'CRYPTO', 'CR', 'USD', 195, .040, 'Kripto', 0, 'SOLUSDT'],
  ['BNB', 'BNB', 'CRYPTO', 'CR', 'USD', 720, .028, 'Kripto', 0, 'BNBUSDT'],
];

function dpFor(cur, type, base) {
  if (type === 'index') return 2;
  if (cur === 'IDR' || cur === 'KRW') return 0;
  if (cur === 'JPY' || cur === 'TWD') return 1;
  if (type === 'crypto') return base < 10 ? 4 : 2;
  return 2;
}

/* ---------- daftar instrumen & kondisi awalnya ---------- */
const INSTS = [];
const BY = {};
function addInst(o) {
  const r = makeRng(o.sym + '-init');
  const inst = Object.assign({
    live: false, health: null, daily: null, intra: null, spark: [], tickCount: 0,
  }, o);
  inst.dp = dpFor(inst.cur, inst.type, inst.base);
  const dayRet = r.normal() * inst.vol * 0.8;
  inst.price = inst.base;
  inst.anchor = inst.base;
  inst.prev = inst.base / (1 + dayRet);
  inst.open = inst.prev * (1 + r.normal() * inst.vol * 0.25);
  inst.high = Math.max(inst.price, inst.open);
  inst.low = Math.min(inst.price, inst.open);
  inst.volBase = inst.type === 'index' ? 0 : inst.type === 'crypto' ? 8e3 + r() * 9e4 : 4e5 + r() * 3e7;
  inst.volume = inst.volBase * (0.3 + r() * 0.4);
  INSTS.push(inst);
  BY[inst.sym] = inst;
}
for (const [sym, name, mkt, base, vol] of INDEX_DEFS) {
  addInst({ sym, name, type: 'index', mkt, region: MARKETS[mkt].region, cur: '', base, vol, sector: 'Indeks' });
}
for (const [sym, name, mkt, region, cur, base, vol, sector, bank, bn] of STOCK_DEFS) {
  addInst({ sym, name, type: region === 'CR' ? 'crypto' : 'stock', mkt, region, cur, base, vol, sector, bank: !!bank, bn });
}
const STOCKS = INSTS.filter(i => i.type !== 'index'); // yang tampil di daftar kanan
const TAPE_SYMS = ['SPX', 'IHSG', 'NKY', 'HSI', 'DAX', 'FTSE', 'KOSPI', 'SENSEX', 'ASX', 'BTC', 'ETH'];

/* ---------- state global aplikasi ---------- */
const State = {
  sel: Store.get('sel', 'BBCA'),
  region: 'ALL', q: '', tab: 'list',
  tf: Store.get('tf', '1Y'), type: Store.get('type', 'candle'), ma: Store.get('ma', true),
  forceOpen: Store.get('force', false),
  liveCrypto: Store.get('liveCrypto', true),
  selMarket: null,
};
if (!BY[State.sel]) State.sel = 'BBCA';
