/* =====================================================================
   PARSER PERINTAH TERMINAL
   Bentuk perintah:
     <ENTITAS> [VERB] [argumen]     contoh: AAPL GP, ID ECON, AAPL COMPARE MSFT NVDA
     <PERINTAH GLOBAL> [argumen]    contoh: HELP, WATCH AAPL, ALERT AAPL > 300, SCREEN VALUE
   parse() TIDAK menjalankan apa pun; hasilnya objek aksi yang dijalankan aplikasi.
   Registri entitas disuntikkan (createRegistry dari shared/entities.mjs), jadi modul
   ini murni dan bisa dites di Node.
   ===================================================================== */

const PRICED = ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate'];
const EQUITY = ['stock'];
const WATCHABLE = PRICED;
const ALL = ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate', 'country', 'company', 'person', 'topic', 'central_bank', 'chokepoint', 'indicator'];

/* verb setelah entitas. tab = bagian panel detail yang dibuka */
export const VERBS = {
  Q: { label: 'Ringkasan harga dan metadata data', types: PRICED, action: 'security', tab: 'overview' },
  GP: { label: 'Grafik harga', types: PRICED, action: 'security', tab: 'chart' },
  TECH: { label: 'Analisis teknikal (indikator)', types: PRICED, action: 'security', tab: 'tech' },
  DES: { label: 'Deskripsi dan profil', types: ['stock', 'etf', 'index', 'crypto', 'company'], action: 'security', tab: 'des' },
  FA: { label: 'Fundamental (laporan keuangan, rasio)', types: EQUITY, action: 'security', tab: 'fa' },
  DIV: { label: 'Dividen', types: ['stock', 'etf'], action: 'security', tab: 'div' },
  EST: { label: 'Earnings dan estimasi', types: EQUITY, action: 'security', tab: 'est' },
  INSIDER: { label: 'Transaksi orang dalam', types: EQUITY, action: 'security', tab: 'insider' },
  OWN: { label: 'Kepemilikan', types: ['stock', 'etf'], action: 'security', tab: 'own' },
  DEPTH: { label: 'Order book dan transaksi', types: ['crypto'], action: 'security', tab: 'depth' },
  NEWS: { label: 'Berita terkait', types: ALL, action: 'news' },
  PEOPLE: { label: 'Tokoh terkait (Wikipedia)', types: ['stock', 'company', 'country', 'central_bank'], action: 'people' },
  ECON: { label: 'Ekonomi negara', types: ['country'], action: 'country', tab: 'overview' },
  COMPARE: { label: 'Bandingkan', types: [...PRICED, 'country'], action: 'compare', multi: true },
};
export const VERB_ALIAS = {
  CHART: 'GP', G: 'GP', GRAFIK: 'GP', QUOTE: 'Q', HARGA: 'Q', TA: 'TECH', TEKNIKAL: 'TECH',
  DESC: 'DES', PROFILE: 'DES', PROFIL: 'DES', FUND: 'FA', FUNDAMENTAL: 'FA', FIN: 'FA',
  DIVIDEND: 'DIV', DIVIDEN: 'DIV', EARNINGS: 'EST', ERN: 'EST', ESTIMATES: 'EST',
  INS: 'INSIDER', HOLDERS: 'OWN', HDS: 'OWN', OB: 'DEPTH', BOOK: 'DEPTH',
  N: 'NEWS', BERITA: 'NEWS', ECO: 'ECON', EKONOMI: 'ECON', TOKOH: 'PEOPLE', ORANG: 'PEOPLE',
  VS: 'COMPARE', BANDING: 'COMPARE', CMP: 'COMPARE',
};

/* perintah global (token pertama) */
export const GLOBALS = {
  HELP: { label: 'Daftar perintah', args: '[perintah]' },
  HOME: { label: 'Kembali ke halaman utama' },
  CLEAR: { label: 'Kosongkan riwayat perintah dan panel' },
  WATCH: { label: 'Tambah ke watchlist', args: '<aset...>' },
  UNWATCH: { label: 'Hapus dari watchlist', args: '<aset...>' },
  ALERT: { label: 'Buat alert harga/perubahan/volume', args: '<aset> [PRICE|CHG|VOLUME] <op> <nilai>' },
  ALERTS: { label: 'Daftar alert' },
  WL: { label: 'Buka watchlist' },
  SCREEN: { label: 'Screener', args: '[VALUE|GROWTH|QUALITY|DIVIDEND|MOMENTUM|LOWLEV|HEALTH]' },
  HEAT: { label: 'Heatmap pasar', args: '[GLOBAL|US|EUROPE|ASIA|INDONESIA|CRYPTO]' },
  PORT: { label: 'Portofolio' },
  COMPARE: { label: 'Bandingkan aset atau negara', args: '<aset/negara...>' },
  NEWS: { label: 'Terminal berita', args: '[kata kunci]' },
  PEOPLE: { label: 'Cari tokoh publik (Wikipedia)', args: '<nama>' },
  RATES: { label: 'Suku bunga dan kurva imbal hasil' },
  FX: { label: 'Valas' },
  CMDTY: { label: 'Komoditas' },
  MACRO: { label: 'Makro, rezim pasar, korelasi' },
  GLOBE: { label: 'Globe intelijen 3D' },
  SHIP: { label: 'Kapal dan chokepoint', args: '[selat]' },
  COUNTRY: { label: 'Semua negara' },
  MARKET: { label: 'Pasar dan grafik' },
  CASH: { label: 'Kas dan alokasi' },
  SOURCES: { label: 'Status sumber data' },
  SETTINGS: { label: 'Pengaturan' },
};
export const GLOBAL_ALIAS = {
  '?': 'HELP', BANTUAN: 'HELP', BERANDA: 'HOME', CLS: 'CLEAR', WATCHLIST: 'WL', SCREENER: 'SCREEN', EQS: 'SCREEN',
  HEATMAP: 'HEAT', PORTFOLIO: 'PORT', PORTOFOLIO: 'PORT', N: 'NEWS', BERITA: 'NEWS', WHO: 'PEOPLE', TOKOH: 'PEOPLE',
  CURVE: 'RATES', YIELDS: 'RATES', BONDS: 'RATES', VALAS: 'FX', COMMODITIES: 'CMDTY', KOMODITAS: 'CMDTY', MAKRO: 'MACRO',
  REGIME: 'MACRO', CB: 'MACRO', STRESS: 'MACRO', INTEL: 'GLOBE', MAP: 'GLOBE', PETA: 'GLOBE', SHIPS: 'SHIP', KAPAL: 'SHIP',
  NEGARA: 'COUNTRY', PASAR: 'MARKET', KAS: 'CASH', SUMBER: 'SOURCES', PENGATURAN: 'SETTINGS', BANDING: 'COMPARE',
};
const SECTION_OF = { REGIME: 'regime', CB: 'cb', STRESS: 'stress', CURVE: 'curve' };
export const SCREEN_PRESETS = { VALUE: 'Value', GROWTH: 'Growth', QUALITY: 'Quality', DIVIDEND: 'Dividend', MOMENTUM: 'Momentum', LOWLEV: 'Low leverage', HEALTH: 'Financial health' };
const PRESET_ALIAS = { 'LOW LEVERAGE': 'LOWLEV', LOWLEVERAGE: 'LOWLEV', LEVERAGE: 'LOWLEV', 'FINANCIAL HEALTH': 'HEALTH', DIV: 'DIVIDEND', MOM: 'MOMENTUM' };
export const HEAT_REGIONS = { GLOBAL: 'Global', US: 'AS', EUROPE: 'Eropa', ASIA: 'Asia', INDONESIA: 'Indonesia', CRYPTO: 'Kripto' };
const REGION_ALIAS = { EU: 'EUROPE', EROPA: 'EUROPE', ID: 'INDONESIA', IDX: 'INDONESIA', CRYPTO: 'CRYPTO', KRIPTO: 'CRYPTO', AS: 'US', WORLD: 'GLOBAL', DUNIA: 'GLOBAL' };
const PAGE_OF = { RATES: ['macro', 'rates'], FX: ['macro', 'fx'], CMDTY: ['macro', 'cmdty'], MACRO: ['macro', null], GLOBE: ['intel', null], COUNTRY: ['country', null], MARKET: ['market', null], CASH: ['cash', null], SOURCES: ['sources', null], PORT: ['portfolio', null], WL: ['watchlist', null], ALERTS: ['alerts', null] };
export const MAX_COMPARE = 6;

/* field alert yang didukung + tipe aset yang punya datanya */
export const ALERT_FIELDS = {
  PRICE: { label: 'Harga', types: PRICED },
  CHG: { label: 'Perubahan harian (%)', types: PRICED },
  VOLUME: { label: 'Volume', types: ['stock', 'etf', 'crypto'] },
};
const FIELD_ALIAS = { PX: 'PRICE', LAST: 'PRICE', HARGA: 'PRICE', CHANGE: 'CHG', PCT: 'CHG', '%': 'CHG', VOL: 'VOLUME' };
const OPS = ['>=', '<=', '>', '<'];

const up = s => String(s || '').toUpperCase();
/* pisahkan operator supaya "AAPL>300" sama dengan "AAPL > 300" */
export function tokenize(input) {
  return String(input || '').replace(/(>=|<=|>|<)/g, ' $1 ').replace(/\*/g, ' * ').trim().split(/\s+/).filter(Boolean);
}
const verbOf = t => { const u = up(t); return VERBS[u] ? u : VERB_ALIAS[u] || null; };
const globalOf = t => { const u = up(t); return GLOBALS[u] ? u : GLOBAL_ALIAS[u] || null; };
const typeLabel = (reg, t) => (reg.types && reg.types[t]) || t;

/* entitas terpanjang di awal token (maks 5 kata), opsional dibatasi tipe */
function entityPrefix(reg, toks, types, max = 5) {
  for (let i = Math.min(toks.length, max); i >= 1; i--) {
    const e = reg.resolve(toks.slice(0, i).join(' '), types);
    if (e) return { entity: e, used: i };
  }
  return null;
}
/* urutan entitas berturut-turut: "MSFT NVDA", "BANK INDONESIA FED" */
function entityList(reg, toks, types) {
  const out = [], bad = [];
  for (let i = 0; i < toks.length;) {
    const r = entityPrefix(reg, toks.slice(i), types);
    if (r) { out.push(r.entity); i += r.used; } else { bad.push(toks[i]); i++; }
  }
  return { entities: out, unknown: bad };
}
const groupOf = e => (e.type === 'country' ? ['country'] : PRICED);
const canon = (...parts) => parts.filter(Boolean).join(' ');
const ok = (o) => ({ ok: true, ...o });
const fail = (raw, error, extra = {}) => ({ ok: false, action: 'error', raw, error, ...extra });

/* nilai angka: "300", "1,250.5", "1.250,5" tidak didukung (ambigu) -> pakai titik desimal */
function num(s) {
  if (s == null) return NaN;
  const t = String(s).replace(/,/g, '').replace(/%$/, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  return Number(t);
}

function parseAlert(reg, raw, rest) {
  if (!rest.length) return fail(raw, 'Format: ALERT <aset> [PRICE|CHG|VOLUME] <op> <nilai>. Contoh: ALERT AAPL > 300');
  const opAt = rest.findIndex(t => OPS.includes(t));
  if (opAt < 1) return fail(raw, 'Operator tidak ada. Pakai salah satu: > < >= <=. Contoh: ALERT AAPL > 300');
  let head = rest.slice(0, opAt), field = 'PRICE';
  const lastF = up(head[head.length - 1]);
  const f = ALERT_FIELDS[lastF] ? lastF : FIELD_ALIAS[lastF];
  if (f && head.length > 1) { field = f; head = head.slice(0, -1); }
  const r = entityPrefix(reg, head, WATCHABLE);
  if (!r || r.used !== head.length) return fail(raw, `Aset "${head.join(' ')}" tidak dikenal atau tidak punya harga.`);
  const e = r.entity;
  if (!ALERT_FIELDS[field].types.includes(e.type)) return fail(raw, `${ALERT_FIELDS[field].label} tidak tersedia untuk ${typeLabel(reg, e.type)}.`);
  const op = rest[opAt];
  const valToks = rest.slice(opAt + 1);
  const cond = { field: field.toLowerCase(), op };
  /* VOLUME > AVG*2 : relatif terhadap rata-rata volume */
  if (field === 'VOLUME' && up(valToks[0]) === 'AVG') {
    let mult = 1;
    if (valToks.length === 3 && valToks[1] === '*') mult = num(valToks[2]);
    else if (valToks.length === 2 && /^X\d/i.test(valToks[1])) mult = num(valToks[1].slice(1));
    else if (valToks.length !== 1) mult = NaN;
    if (!Number.isFinite(mult) || mult <= 0) return fail(raw, 'Format volume relatif: ALERT AAPL VOLUME > AVG*2');
    Object.assign(cond, { ref: 'avg', mult });
  } else {
    if (valToks.length !== 1) return fail(raw, 'Nilai alert harus satu angka. Contoh: ALERT AAPL > 300');
    const v = num(valToks[0]);
    if (!Number.isFinite(v)) return fail(raw, `"${valToks[0]}" bukan angka.`);
    if (field === 'PRICE' && v <= 0 && e.type !== 'rate') return fail(raw, 'Harga alert harus lebih dari 0.');
    cond.value = v;
  }
  const valTxt = cond.ref ? `AVG*${cond.mult}` : (field === 'CHG' ? cond.value + '%' : String(cond.value));
  return ok({ action: 'alert', entity: e, condition: cond, raw, canonical: canon('ALERT', e.symbol, field, op, valTxt) });
}

function parseGlobal(reg, raw, g, rest, first) {
  const restTxt = rest.join(' ');
  switch (g) {
    case 'HELP': {
      if (!rest.length) return ok({ action: 'help', raw, canonical: 'HELP' });
      const t = up(rest[0]), v = verbOf(t), gg = globalOf(t);
      return ok({ action: 'help', topic: v || gg || t, raw, canonical: canon('HELP', v || gg || t) });
    }
    case 'HOME': return ok({ action: 'home', raw, canonical: 'HOME' });
    case 'CLEAR': return ok({ action: 'clear', raw, canonical: 'CLEAR' });
    case 'WATCH': case 'UNWATCH': {
      if (!rest.length) return fail(raw, `Format: ${g} <aset...>. Contoh: ${g} AAPL BTC`);
      const { entities, unknown } = entityList(reg, rest, WATCHABLE);
      if (unknown.length) return fail(raw, `Tidak dikenal atau tidak punya harga: ${unknown.join(', ')}`, { entities });
      return ok({ action: g.toLowerCase(), entities, raw, canonical: canon(g, ...entities.map(e => e.symbol)) });
    }
    case 'ALERT': return parseAlert(reg, raw, rest);
    case 'SCREEN': {
      if (!rest.length) return ok({ action: 'screen', preset: null, raw, canonical: 'SCREEN' });
      const p = up(restTxt), key = SCREEN_PRESETS[p] ? p : PRESET_ALIAS[p];
      if (!key) return fail(raw, `Preset tidak dikenal. Pilihan: ${Object.keys(SCREEN_PRESETS).join(', ')}`);
      return ok({ action: 'screen', preset: key, raw, canonical: canon('SCREEN', key) });
    }
    case 'HEAT': {
      if (!rest.length) return ok({ action: 'heatmap', region: 'GLOBAL', raw, canonical: 'HEAT GLOBAL' });
      const p = up(restTxt), key = HEAT_REGIONS[p] ? p : REGION_ALIAS[p];
      if (!key) return fail(raw, `Wilayah heatmap tidak dikenal. Pilihan: ${Object.keys(HEAT_REGIONS).join(', ')}`);
      return ok({ action: 'heatmap', region: key, raw, canonical: canon('HEAT', key) });
    }
    case 'COMPARE': {
      if (rest.length < 2) return fail(raw, 'Bandingkan butuh minimal 2 aset atau negara. Contoh: COMPARE ID US CN');
      const first0 = entityPrefix(reg, rest, ALL);
      if (!first0) return fail(raw, `Tidak dikenal: ${rest[0]}`);
      return compareFrom(reg, raw, first0.entity, rest.slice(first0.used), 'COMPARE');
    }
    case 'NEWS': {
      if (!rest.length) return ok({ action: 'page', page: 'news', raw, canonical: 'NEWS' });
      /* teks bebas tetap jadi kata kunci; bila persis sebuah entitas, entitasnya ikut dikirim */
      const r = entityPrefix(reg, rest, ALL);
      const query = String(raw).trim().split(/\s+/).slice(1).join(' ');
      return ok({ action: 'news', query, ...(r && r.used === rest.length ? { entity: r.entity } : {}), raw, canonical: canon('NEWS', restTxt) });
    }
    case 'PEOPLE': {
      if (!rest.length) return fail(raw, 'Format: PEOPLE <nama>. Contoh: PEOPLE Jensen Huang');
      return ok({ action: 'people', query: String(raw).trim().split(/\s+/).slice(1).join(' '), raw, canonical: canon('PEOPLE', restTxt) });
    }
    case 'SHIP': {
      if (!rest.length) return ok({ action: 'page', page: 'ships', raw, canonical: 'SHIP' });
      const r = entityPrefix(reg, rest, ['chokepoint']);
      if (!r) return fail(raw, `Selat tidak dikenal: ${restTxt}. Contoh: SHIP HORMUZ`);
      return ok({ action: 'page', page: 'ships', target: r.entity, raw, canonical: canon('SHIP', r.entity.symbol) });
    }
    case 'SETTINGS': return ok({ action: 'settings', raw, canonical: 'SETTINGS' });
    default: {
      const [page, section] = PAGE_OF[g] || [null, null];
      if (!page) return fail(raw, 'Perintah belum didukung: ' + g);
      if (rest.length) return fail(raw, `${g} tidak memakai argumen ("${restTxt}"). Ketik ${g} saja.`);
      return ok({ action: 'page', page, section: SECTION_OF[first] || section, raw, canonical: g });
    }
  }
}

function compareFrom(reg, raw, base, restToks, lead) {
  const group = groupOf(base);
  const { entities, unknown } = entityList(reg, restToks, group);
  if (unknown.length) return fail(raw, `Tidak dikenal untuk dibandingkan dengan ${base.symbol || base.name}: ${unknown.join(', ')}`);
  const all = [base, ...entities].filter((e, i, a) => a.findIndex(x => x.id === e.id) === i);
  if (all.length < 2) return fail(raw, 'Bandingkan butuh minimal 2 aset atau negara yang berbeda.');
  if (all.length > MAX_COMPARE) return fail(raw, `Maksimal ${MAX_COMPARE} untuk dibandingkan.`);
  const mode = group[0] === 'country' ? 'country' : 'security';
  return ok({ action: 'compare', mode, entities: all, raw, canonical: lead === 'COMPARE' ? canon('COMPARE', ...all.map(e => e.symbol)) : canon(base.symbol, 'COMPARE', ...entities.map(e => e.symbol)) });
}

/* aksi bawaan bila hanya entitas yang diketik */
function defaultFor(e, raw) {
  const sym = e.symbol || e.name;
  switch (e.type) {
    case 'country': return ok({ action: 'country', entity: e, tab: 'overview', raw, canonical: canon(sym, 'ECON') });
    case 'central_bank': return ok({ action: 'central_bank', entity: e, raw, canonical: sym });
    case 'topic': return ok({ action: 'news', entity: e, query: e.name, raw, canonical: canon(sym, 'NEWS') });
    case 'chokepoint': return ok({ action: 'page', page: 'ships', target: e, raw, canonical: canon('SHIP', sym) });
    case 'person': return ok({ action: 'people', entity: e, query: e.name, raw, canonical: canon('PEOPLE', e.name) });
    case 'company': return ok({ action: 'security', entity: e, tab: 'des', raw, canonical: canon(sym, 'DES') });
    default: return ok({ action: 'security', entity: e, tab: 'overview', raw, canonical: sym });
  }
}

export function parse(input, reg) {
  const raw = String(input || '');
  const toks = tokenize(raw);
  if (!toks.length) return fail(raw, 'Perintah kosong. Ketik HELP untuk daftar perintah.');
  if (toks.join(' ').length > 200) return fail(raw, 'Perintah terlalu panjang.');
  const first = up(toks[0]);
  const g = globalOf(first);
  /* perintah global menang, kecuali token itu juga kode entitas dan diikuti verb (mis. "N" tidak pernah entitas) */
  if (g && !(toks.length > 1 && verbOf(toks[1]) && reg.resolve(toks[0]))) return parseGlobal(reg, raw, g, toks.slice(1), first);

  /* <ENTITAS...> <VERB> [argumen] : cari verb pertama yang entitas di depannya cocok */
  let notApplicable = null;
  for (let k = 1; k < toks.length; k++) {
    const v = verbOf(toks[k]);
    if (!v) continue;
    const head = toks.slice(0, k).join(' ');
    const e = reg.resolve(head, VERBS[v].types);
    if (!e) { const any = reg.resolve(head); if (any && !notApplicable) notApplicable = { e: any, v }; continue; }
    const args = toks.slice(k + 1);
    const spec = VERBS[v];
    if (spec.multi) {
      if (!args.length) return fail(raw, `Format: ${e.symbol} COMPARE <aset...>. Contoh: AAPL COMPARE MSFT NVDA`);
      return compareFrom(reg, raw, e, args, 'ENTITY');
    }
    if (args.length) return fail(raw, `"${args.join(' ')}" tidak dipahami setelah ${e.symbol} ${v}.`);
    const sym = e.symbol || e.name;
    if (spec.action === 'news') return ok({ action: 'news', entity: e, query: e.name, raw, canonical: canon(sym, 'NEWS') });
    if (spec.action === 'people') return ok({ action: 'people', entity: e, query: e.name, raw, canonical: canon(sym, 'PEOPLE') });
    if (spec.action === 'country') return ok({ action: 'country', entity: e, tab: spec.tab, raw, canonical: canon(sym, v) });
    return ok({ action: 'security', entity: e, tab: spec.tab, verb: v, raw, canonical: canon(sym, v) });
  }
  if (notApplicable) {
    const { e, v } = notApplicable;
    const okVerbs = Object.keys(VERBS).filter(x => VERBS[x].types.includes(e.type)).map(x => `${e.symbol} ${x}`).slice(0, 5);
    return fail(raw, `${v} tidak berlaku untuk ${typeLabel(reg, e.type)} (${e.symbol}). Coba: ${okVerbs.join(', ')}`, { entity: e });
  }
  /* seluruh input = satu entitas */
  const whole = reg.resolve(toks.join(' '));
  if (whole) return defaultFor(whole, raw);
  const sugg = reg.search(toks.join(' '), { limit: 6 });
  return fail(raw, `Tidak ditemukan: "${raw.trim()}".` + (sugg.length ? ' Mungkin maksudmu: ' + sugg.slice(0, 3).map(s => s.entity.symbol || s.entity.name).join(', ') : ''),
    { action: 'search', query: raw.trim(), suggestions: sugg.map(s => s.entity) });
}

/* ---------- autocomplete ---------- */
/* incomplete = saran ini masih butuh argumen (diakhiri spasi), jadi belum bisa langsung dijalankan */
const sug = (kind, label, detail, insert, extra = {}) => ({ kind, label, detail, insert, incomplete: /\s$/.test(insert), ...extra });
const entSug = (e, prefix) => sug('entity', e.symbol || e.name, `${e.name} · ${e.type}`, (prefix ? prefix + ' ' : '') + (e.symbol || e.name), { entityId: e.id, type: e.type });

export function suggest(input, reg, { limit = 12 } = {}) {
  const raw = String(input || '');
  const toks = tokenize(raw);
  const trailing = /\s$/.test(raw);
  if (!toks.length) {
    return ['HELP', 'WATCH', 'ALERT', 'SCREEN', 'HEAT', 'NEWS', 'COMPARE', 'RATES', 'FX', 'CMDTY', 'GLOBE', 'HOME']
      .map(g => sug('command', g, GLOBALS[g].label + (GLOBALS[g].args ? ' ' + GLOBALS[g].args : ''), g + (GLOBALS[g].args ? ' ' : ''))).slice(0, limit);
  }
  const partial = trailing ? '' : toks[toks.length - 1];
  const done = trailing ? toks : toks.slice(0, -1);
  const doneTxt = done.join(' ');
  const out = [];
  const g = done.length ? globalOf(done[0]) : null;

  if (g) {
    const P = up(partial);
    if (g === 'SCREEN') return Object.entries(SCREEN_PRESETS).filter(([k]) => k.startsWith(P)).map(([k, v]) => sug('arg', k, v, 'SCREEN ' + k)).slice(0, limit);
    if (g === 'HEAT') return Object.entries(HEAT_REGIONS).filter(([k]) => k.startsWith(P)).map(([k, v]) => sug('arg', k, v, 'HEAT ' + k)).slice(0, limit);
    if (g === 'HELP') return [...Object.keys(VERBS), ...Object.keys(GLOBALS)].filter((k, i, a) => a.indexOf(k) === i && k.startsWith(P)).map(k => sug('arg', k, (VERBS[k] || GLOBALS[k]).label, 'HELP ' + k)).slice(0, limit);
    if (g === 'ALERT') {
      const opAt = done.findIndex(t => OPS.includes(t));
      if (done.length >= 2 && opAt < 0) {
        const hasField = done.length > 2 && (ALERT_FIELDS[up(done[done.length - 1])] || FIELD_ALIAS[up(done[done.length - 1])]);
        const fields = hasField ? [] : Object.keys(ALERT_FIELDS).filter(f => f.startsWith(P)).map(f => sug('arg', f, ALERT_FIELDS[f].label, doneTxt + ' ' + f + ' '));
        return [...fields, ...OPS.filter(o => o.startsWith(partial)).map(o => sug('arg', o, 'operator', doneTxt + ' ' + o + ' '))].slice(0, limit);
      }
      if (opAt >= 0) return [];
    }
    if (['WATCH', 'UNWATCH', 'ALERT', 'COMPARE', 'NEWS', 'SHIP'].includes(g)) {
      if (!partial) return [];
      const types = g === 'SHIP' ? ['chokepoint'] : g === 'NEWS' || g === 'COMPARE' ? undefined : WATCHABLE;
      return reg.search(partial, { limit, types }).map(r => entSug(r.entity, doneTxt));
    }
    return [];
  }

  /* entitas sudah lengkap -> sarankan verb yang berlaku */
  if (done.length) {
    const e = reg.resolve(doneTxt);
    const v = done.length > 1 ? verbOf(done[done.length - 1]) : null;
    if (v === 'COMPARE') {
      if (!partial) return [];
      const base = reg.resolve(done.slice(0, -1).join(' '));
      return reg.search(partial, { limit, types: base ? groupOf(base) : undefined }).map(r => entSug(r.entity, doneTxt));
    }
    if (e) {
      const P = up(partial);
      for (const [k, spec] of Object.entries(VERBS)) {
        if (!spec.types.includes(e.type) || !k.startsWith(P)) continue;
        out.push(sug('verb', `${e.symbol || e.name} ${k}`, spec.label, `${e.symbol || e.name} ${k}${spec.multi ? ' ' : ''}`, { entityId: e.id }));
      }
      if (out.length || !partial) return out.slice(0, limit);
    }
  }

  /* token pertama atau teks bebas -> perintah global + hasil pencarian entitas */
  if (toks.length === 1 && !trailing) {
    const P = up(partial);
    for (const k of Object.keys(GLOBALS)) if (k.startsWith(P) && P.length >= 1) out.push(sug('command', k, GLOBALS[k].label, k + (GLOBALS[k].args ? ' ' : '')));
  }
  for (const r of reg.search(toks.join(' '), { limit })) out.push(entSug(r.entity));
  /* entitas dulu bila kode persis, perintah global dulu bila tidak */
  out.sort((a, b) => (b.kind === 'entity' && up(b.label) === up(toks.join(' ')) ? 1 : 0) - (a.kind === 'entity' && up(a.label) === up(toks.join(' ')) ? 1 : 0));
  return out.slice(0, limit);
}

/* daftar bantuan terstruktur (dipakai HELP) */
export function helpRows() {
  return {
    verbs: Object.entries(VERBS).map(([k, v]) => ({ cmd: '<aset> ' + k, label: v.label, types: v.types })),
    globals: Object.entries(GLOBALS).map(([k, v]) => ({ cmd: k + (v.args ? ' ' + v.args : ''), label: v.label })),
    examples: ['AAPL GP', 'AAPL FA', 'AAPL COMPARE MSFT NVDA', 'ID ECON', 'US10Y', 'EURUSD', 'BTC DEPTH', 'NVIDIA PEOPLE', 'WATCH AAPL', 'ALERT AAPL > 300', 'ALERT AAPL VOLUME > AVG*2', 'SCREEN VALUE', 'HEAT ASIA', 'N RUPIAH'],
  };
}
