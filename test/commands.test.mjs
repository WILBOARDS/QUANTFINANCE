/* Tes registri entitas, pencarian, parser perintah, dan autocomplete.
   Negara dibuat dari paket referensi yang sama dengan build (world-countries + i18n-iso-countries),
   jadi bentrokan kode nyata (MA = Mastercard / Maroko, MS = Morgan Stanley / Montserrat) ikut teruji. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createRegistry, normalize, editDistance, validateEntity } from '../shared/entities.mjs';
import { SEED, countryEntities, topicEntities, chokepointEntities } from '../shared/entity-seed.mjs';
import { parse, suggest, tokenize, helpRows, VERBS, GLOBALS } from '../shared/commands.mjs';
import { THEMES } from '../shared/analytics.mjs';

const require = createRequire(import.meta.url);
const wc = require('world-countries/countries.json');
const idNames = require('i18n-iso-countries/langs/id.json').countries;
const META = wc.filter(c => c.cca3 && c.cca2).map(c => {
  const idn = idNames[c.cca2];
  return [c.cca3, c.cca2, c.ccn3 || '', c.name.common, Array.isArray(idn) ? idn[0] : (idn || c.name.common), Object.keys(c.currencies || {})[0] || '', 0, 0, c.region || '', c.subregion || '', (c.capital || [])[0] || '', c.independent ? 1 : 0];
});
const CHOKE = [['hormuz', 'Strait of Hormuz', 'Hormuz', 26.57, 56.25, ''], ['malacca', 'Malacca Strait', 'Malaka', 2.5, 101.4, '']];
const reg = createRegistry([...SEED, ...countryEntities(META), ...topicEntities(THEMES), ...chokepointEntities(CHOKE)]);

const P = s => parse(s, reg);
const sym = r => r.entity && r.entity.symbol;

/* ---------- registri & pencarian ---------- */
test('seed valid: id unik, tipe dikenal, tanpa angka pasar', () => {
  const ids = new Set();
  for (const e of SEED) {
    validateEntity(e);
    assert.ok(!ids.has(e.id), 'id ganda ' + e.id); ids.add(e.id);
    for (const k of ['price', 'marketCap', 'volume', 'last', 'close']) assert.equal(e[k], undefined, `${e.id} memuat ${k}`);
  }
  assert.ok(reg.size() > SEED.length + 200, 'negara ikut terdaftar');
});

test('normalize dan editDistance', () => {
  assert.equal(normalize('  Société  Générale '), 'SOCIETE GENERALE');
  assert.equal(normalize('brk.b'), 'BRK.B');
  assert.equal(editDistance('NVIDA', 'NVIDIA', 1), 1);
  assert.equal(editDistance('APPLE', 'GOOGLE', 1), 2);
});

test('search membedakan jenis entitas', () => {
  const types = q => reg.search(q, { limit: 5 }).map(r => r.entity.type);
  assert.equal(reg.search('AAPL')[0].entity.id, 'stock:AAPL');
  assert.equal(reg.search('apple')[0].entity.id, 'stock:AAPL');
  assert.equal(reg.search('SPY')[0].entity.type, 'etf');
  assert.equal(reg.search('IHSG')[0].entity.type, 'index');
  assert.equal(reg.search('BTC')[0].entity.type, 'crypto');
  assert.equal(reg.search('EURUSD')[0].entity.type, 'fx');
  assert.equal(reg.search('EUR/USD')[0].entity.type, 'fx');
  assert.equal(reg.search('gold')[0].entity.type, 'commodity');
  assert.equal(reg.search('US10Y')[0].entity.type, 'rate');
  assert.equal(reg.search('Indonesia')[0].entity.type, 'country');
  assert.equal(reg.search('fed')[0].entity.type, 'central_bank');
  assert.ok(types('inflasi').includes('topic'));
  assert.equal(reg.search('hormuz')[0].entity.type, 'chokepoint');
});

test('search toleran salah ketik dan awalan', () => {
  assert.equal(reg.search('nvida')[0].entity.id, 'stock:NVDA');
  assert.equal(reg.search('microso')[0].entity.id, 'stock:MSFT');
  assert.equal(reg.search('bank central')[0].entity.id, 'stock:BBCA');
  const g = reg.searchGrouped('bank');
  assert.ok(g.length >= 2 && g.every(x => x.items.length && x.label));
});

test('resolve dengan pembatasan tipe memecahkan bentrokan kode', () => {
  assert.equal(reg.resolve('MA').id, 'stock:MA');
  assert.equal(reg.resolve('MA', ['country']).id, 'country:MAR');
  assert.equal(reg.resolve('MS').id, 'stock:MS');
  assert.equal(reg.resolve('ID').id, 'country:IDN');
  assert.equal(reg.resolve('UK').id, 'country:GBR');
  assert.equal(reg.resolve('oil').id, 'commodity:WTI');
});

/* ---------- semua perintah yang diminta ---------- */
test('AAPL GP / FA / NEWS / DES / DIV / INSIDER / EST / TECH', () => {
  const cases = { GP: 'chart', FA: 'fa', DES: 'des', DIV: 'div', INSIDER: 'insider', EST: 'est', TECH: 'tech' };
  for (const [v, tab] of Object.entries(cases)) {
    const r = P('AAPL ' + v);
    assert.ok(r.ok, v + ': ' + r.error);
    assert.equal(r.action, 'security'); assert.equal(r.tab, tab); assert.equal(sym(r), 'AAPL'); assert.equal(r.canonical, 'AAPL ' + v);
  }
  const n = P('AAPL NEWS');
  assert.equal(n.action, 'news'); assert.equal(sym(n), 'AAPL'); assert.match(n.query, /Apple/);
});

test('AAPL COMPARE MSFT NVDA', () => {
  const r = P('AAPL COMPARE MSFT NVDA');
  assert.ok(r.ok, r.error);
  assert.equal(r.action, 'compare'); assert.equal(r.mode, 'security');
  assert.deepEqual(r.entities.map(e => e.symbol), ['AAPL', 'MSFT', 'NVDA']);
  assert.equal(r.canonical, 'AAPL COMPARE MSFT NVDA');
});

test('ID ECON dan US ECON membuka negara', () => {
  const id = P('ID ECON'), us = P('US ECON');
  assert.equal(id.action, 'country'); assert.equal(id.entity.id, 'country:IDN');
  assert.equal(us.action, 'country'); assert.equal(us.entity.id, 'country:USA');
  assert.equal(P('MA ECON').entity.id, 'country:MAR', 'MA ECON = Maroko, bukan Mastercard');
  assert.equal(P('united states econ').entity.id, 'country:USA', 'nama negara multi-kata');
});

test('US10Y, EURUSD, BTC GP, BTC DEPTH', () => {
  const r = P('US10Y'); assert.equal(r.action, 'security'); assert.equal(r.entity.id, 'rate:US10Y');
  const f = P('EURUSD'); assert.equal(f.action, 'security'); assert.equal(f.entity.id, 'fx:EURUSD');
  const b = P('BTC GP'); assert.equal(b.tab, 'chart'); assert.equal(b.entity.id, 'crypto:BTC');
  const d = P('BTC DEPTH'); assert.equal(d.tab, 'depth'); assert.equal(d.entity.id, 'crypto:BTC');
});

test('NVDA NEWS dan NVIDIA PEOPLE', () => {
  const n = P('NVDA NEWS'); assert.equal(n.action, 'news'); assert.equal(sym(n), 'NVDA');
  const p = P('NVIDIA PEOPLE'); assert.ok(p.ok, p.error); assert.equal(p.action, 'people'); assert.equal(sym(p), 'NVDA');
});

test('HELP, HOME, CLEAR', () => {
  assert.equal(P('HELP').action, 'help');
  assert.equal(P('help fa').topic, 'FA');
  assert.equal(P('?').action, 'help');
  assert.equal(P('HOME').action, 'home');
  assert.equal(P('CLEAR').action, 'clear');
  const h = helpRows();
  assert.ok(h.verbs.length === Object.keys(VERBS).length && h.globals.length === Object.keys(GLOBALS).length);
  for (const ex of h.examples) assert.ok(P(ex).ok, 'contoh di HELP harus valid: ' + ex + ' -> ' + P(ex).error);
});

test('WATCH AAPL (dan banyak aset sekaligus)', () => {
  const r = P('WATCH AAPL'); assert.equal(r.action, 'watch'); assert.deepEqual(r.entities.map(e => e.symbol), ['AAPL']);
  const m = P('watch aapl btc eurusd'); assert.deepEqual(m.entities.map(e => e.id), ['stock:AAPL', 'crypto:BTC', 'fx:EURUSD']);
  const bad = P('WATCH AAPL ZZZZQ'); assert.equal(bad.ok, false); assert.match(bad.error, /ZZZZQ/);
  assert.equal(P('WATCH').ok, false);
  assert.equal(P('UNWATCH AAPL').action, 'unwatch');
  assert.equal(P('WATCH Indonesia').ok, false, 'negara tidak punya harga');
});

test('ALERT AAPL > 300 dan variasinya', () => {
  const r = P('ALERT AAPL > 300');
  assert.ok(r.ok, r.error);
  assert.equal(r.action, 'alert'); assert.equal(sym(r), 'AAPL');
  assert.deepEqual(r.condition, { field: 'price', op: '>', value: 300 });
  assert.equal(r.canonical, 'ALERT AAPL PRICE > 300');
  assert.deepEqual(P('alert aapl>=300.5').condition, { field: 'price', op: '>=', value: 300.5 });
  assert.deepEqual(P('ALERT BTC CHG < -5%').condition, { field: 'chg', op: '<', value: -5 });
  assert.deepEqual(P('ALERT AAPL VOLUME > AVG*2').condition, { field: 'volume', op: '>', ref: 'avg', mult: 2 });
  assert.deepEqual(P('ALERT AAPL VOL > AVG x2').condition, { field: 'volume', op: '>', ref: 'avg', mult: 2 });
  assert.deepEqual(P('ALERT BTC > 1,000,000').condition, { field: 'price', op: '>', value: 1000000 });
  assert.equal(P('ALERT US10Y < 4').condition.value, 4);
});

test('ALERT ditolak bila tidak valid', () => {
  for (const s of ['ALERT', 'ALERT AAPL', 'ALERT AAPL 300', 'ALERT AAPL > abc', 'ALERT AAPL > 0', 'ALERT ZZZQ > 3', 'ALERT AAPL > 1 2', 'ALERT IHSG VOLUME > 5', 'ALERT AAPL VOLUME > AVG*-1', 'ALERT Indonesia > 3']) {
    const r = P(s);
    assert.equal(r.ok, false, s + ' seharusnya ditolak');
    assert.ok(r.error && r.error.length > 5, s + ' butuh pesan error');
  }
});

test('verb yang tidak berlaku memberi saran, bukan menebak', () => {
  const r = P('BTC FA');
  assert.equal(r.ok, false); assert.match(r.error, /FA tidak berlaku/); assert.match(r.error, /BTC GP/);
  assert.equal(P('AAPL DEPTH').ok, false);
  assert.equal(P('AAPL GP extra').ok, false);
});

test('perintah global halaman dan argumen', () => {
  assert.deepEqual([P('RATES').page, P('RATES').section], ['macro', 'rates']);
  assert.deepEqual([P('FX').page, P('CMDTY').page, P('GLOBE').page, P('SOURCES').page], ['macro', 'macro', 'intel', 'sources']);
  assert.equal(P('CB').section, 'cb');
  assert.equal(P('SETTINGS').action, 'settings');
  assert.equal(P('MACRO extra').ok, false);
  assert.equal(P('SCREEN VALUE').preset, 'VALUE');
  assert.equal(P('screen low leverage').preset, 'LOWLEV');
  assert.equal(P('SCREEN NONSENSE').ok, false);
  assert.equal(P('HEAT ASIA').region, 'ASIA');
  assert.equal(P('HEAT').region, 'GLOBAL');
  assert.equal(P('HEAT ID').region, 'INDONESIA');
  assert.equal(P('PORT').page, 'portfolio');
  assert.equal(P('SHIP HORMUZ').target.id, 'chokepoint:hormuz');
  assert.equal(P('SHIP').page, 'ships');
});

test('COMPARE negara dan berita teks bebas (kompatibel dengan palet lama)', () => {
  const c = P('COMPARE ID US CN');
  assert.ok(c.ok, c.error); assert.equal(c.mode, 'country');
  assert.deepEqual(c.entities.map(e => e.id), ['country:IDN', 'country:USA', 'country:CHN']);
  assert.equal(P('COMPARE AAPL').ok, false);
  assert.equal(P('COMPARE AAPL AAPL').ok, false, 'entitas sama tidak dihitung dua kali');
  assert.equal(P('AAPL COMPARE A B C D E F G').ok, false);
  const n = P('N rupiah melemah');
  assert.equal(n.action, 'news'); assert.equal(n.query, 'rupiah melemah');
  assert.equal(P('NEWS').page, 'news');
  assert.equal(P('PEOPLE Jensen Huang').query, 'Jensen Huang');
});

test('masukan aneh tidak membuat parser error', () => {
  for (const s of ['', '   ', '>>>', '<script>alert(1)</script>', 'AAPL '.repeat(100), '\u0000', 'ÄÖÜ', '1e309', 'ALERT AAPL > 1e309']) {
    const r = P(s);
    assert.equal(typeof r.ok, 'boolean');
    if (!r.ok) assert.equal(typeof r.error, 'string');
  }
  const u = P('Jensen Huang');
  assert.equal(u.ok, false); assert.equal(u.action, 'search'); assert.equal(u.query, 'Jensen Huang');
  assert.deepEqual(tokenize('AAPL>300'), ['AAPL', '>', '300']);
});

test('default aksi per jenis entitas', () => {
  assert.equal(P('Indonesia').action, 'country');
  assert.equal(P('Bank Indonesia').action, 'central_bank');
  assert.equal(P('hormuz').action, 'page');
  assert.equal(P('gold').entity.id, 'commodity:GOLD');
  assert.equal(P('SPY').entity.type, 'etf');
});

/* ---------- autocomplete ---------- */
test('suggest: kosong, awalan, verb, argumen', () => {
  assert.ok(suggest('', reg).some(s => s.label === 'HELP'));
  const a = suggest('AAP', reg); assert.equal(a[0].insert, 'AAPL');
  const v = suggest('AAPL ', reg).map(s => s.insert);
  for (const x of ['AAPL GP', 'AAPL FA', 'AAPL NEWS', 'AAPL DES']) assert.ok(v.includes(x), x);
  assert.ok(!v.includes('AAPL DEPTH') && !v.includes('AAPL ECON'));
  assert.deepEqual(suggest('BTC D', reg).map(s => s.insert).sort(), ['BTC DEPTH', 'BTC DES']);
  assert.deepEqual(suggest('ID E', reg).map(s => s.insert), ['ID ECON']);
  assert.ok(suggest('WATCH NV', reg).some(s => s.insert === 'WATCH NVDA'));
  assert.ok(suggest('AAPL COMPARE MS', reg).some(s => s.insert === 'AAPL COMPARE MSFT'));
  assert.ok(suggest('SCREEN V', reg).some(s => s.insert === 'SCREEN VALUE'));
  assert.ok(suggest('HEAT A', reg).some(s => s.insert === 'HEAT ASIA'));
  assert.ok(suggest('ALERT AAPL ', reg).some(s => s.insert === 'ALERT AAPL > '));
  assert.ok(suggest('ALERT AAPL VO', reg).some(s => s.insert === 'ALERT AAPL VOLUME '));
  assert.ok(suggest('HE', reg).some(s => s.kind === 'command' && s.label === 'HELP'));
  for (const s of suggest('AAPL ', reg)) assert.ok(s.incomplete || parse(s.insert, reg).ok, 'saran harus bisa dijalankan: ' + s.insert);
  assert.ok(suggest('AAPL ', reg).find(s => s.insert === 'AAPL COMPARE ').incomplete);
});
