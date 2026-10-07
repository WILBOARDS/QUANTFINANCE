/* Tes Wikidata (shared/wikidata.mjs): parsing klaim + JAMINAN privasi (blocklist). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../shared/wikidata.mjs';

const item = (id, extra = {}) => ({ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { 'entity-type': 'item', id } } }, rank: 'normal', ...extra });
const time = (t, precision = 11) => ({ snaktype: 'value', datavalue: { type: 'time', value: { time: t, precision } } });
const PERSON = {
  id: 'Q305177', modified: '2026-09-01T00:00:00Z',
  labels: { en: { language: 'en', value: 'Jensen Huang' } }, descriptions: { en: { value: 'Taiwanese-American businessman' } },
  sitelinks: { enwiki: { title: 'Jensen Huang' } },
  claims: {
    P31: [item('Q5')],
    P106: [item('Q43845')],
    P108: [item('Q182477', { qualifiers: { P39: [{ snaktype: 'value', datavalue: { value: { id: 'Q484876' } } }], P580: [time('+1993-04-05T00:00:00Z')] } }), item('Q11461', { qualifiers: { P580: [time('+1985-00-00T00:00:00Z', 9)], P582: [time('+1993-00-00T00:00:00Z', 9)] } }), item('Q999', { rank: 'deprecated' })],
    P27: [item('Q30')],
    P856: [{ mainsnak: { snaktype: 'value', datavalue: { value: 'https://example.test' } }, rank: 'normal' }, { mainsnak: { snaktype: 'value', datavalue: { value: 'javascript:alert(1)' } }, rank: 'normal' }],
    /* DATA PRIBADI: semuanya wajib dibuang */
    P569: [{ mainsnak: time('+1963-02-17T00:00:00Z'), rank: 'normal' }],
    P19: [item('Q1')], P26: [item('Q2')], P40: [item('Q3')], P22: [item('Q4')], P25: [item('Q6')], P3373: [item('Q7')],
    P551: [item('Q8')], P6375: [{ mainsnak: { snaktype: 'value', datavalue: { value: { text: 'Jl. Contoh 1' } } } }],
    P1329: [{ mainsnak: { snaktype: 'value', datavalue: { value: '+1 555 0100' } } }], P968: [{ mainsnak: { snaktype: 'value', datavalue: { value: 'mailto:a@b.c' } } }],
    P18: [{ mainsnak: { snaktype: 'value', datavalue: { value: 'Foto.jpg' } } }], P21: [item('Q6581097')], P140: [item('Q9')],
    P9999: [item('Q10')],
  },
};

test('BLOCK dan ALLOW tidak beririsan; properti pribadi utama ada di BLOCK', () => {
  for (const p of Object.keys(W.ALLOW)) assert.ok(!W.BLOCK.has(p), p + ' ada di ALLOW dan BLOCK');
  for (const p of ['P569', 'P19', 'P26', 'P40', 'P22', 'P25', 'P3373', 'P551', 'P6375', 'P1329', 'P968', 'P18', 'P21', 'P140', 'P172', 'P91']) assert.ok(W.BLOCK.has(p), p);
  for (const p of ['P569', 'P26', 'P18', 'P9999']) assert.equal(W.isAllowed(p), false, p);
});

test('parseEntity: data pribadi TIDAK PERNAH lolos, walaupun ada di klaim', () => {
  const r = W.parseEntity(PERSON);
  const pids = new Set(r.facts.map(f => f.pid));
  for (const p of W.BLOCK) assert.ok(!pids.has(p), 'bocor: ' + p);
  assert.ok(!pids.has('P9999'), 'properti tak dikenal lolos');
  const s = JSON.stringify(r);
  for (const bad of ['1963', 'Jl. Contoh', '555 0100', 'mailto', 'Foto.jpg', 'Q6581097']) assert.ok(!s.includes(bad), 'bocor: ' + bad);
  /* walaupun ALLOW diubah orang, BLOCK tetap menang */
  W.ALLOW.P569 = ['tanggal lahir', 'time'];
  try { assert.ok(!W.parseEntity(PERSON).facts.some(f => f.pid === 'P569')); } finally { delete W.ALLOW.P569; }
});

test('parseEntity: fakta publik dengan kualifier, deprecated dibuang, URL tidak aman dibuang, urutan "sekarang" dulu', () => {
  const r = W.parseEntity(PERSON);
  assert.equal(r.label, 'Jensen Huang');
  assert.equal(r.enwiki, 'Jensen Huang');
  assert.ok(W.isHuman(r));
  const emp = r.facts.filter(f => f.pid === 'P108');
  assert.deepEqual(emp.map(f => f.value.qid), ['Q182477', 'Q11461']);
  assert.deepEqual(emp[0].qualifiers, { jabatan: { qid: 'Q484876' }, mulai: { text: '1993-04-05' } });
  assert.deepEqual(emp[1].qualifiers, { mulai: { text: '1985' }, selesai: { text: '1993' } });
  assert.deepEqual(r.facts.filter(f => f.pid === 'P856').map(f => f.value.url), ['https://example.test']);
  assert.deepEqual(W.referencedQids(r).sort(), ['Q11461', 'Q182477', 'Q30', 'Q43845', 'Q484876', 'Q5'].sort());
  assert.throws(() => W.parseEntity({ id: 'x' }), /tidak dikenal/);
});

test('wdTime, parseLabels, parseSearch', () => {
  assert.equal(W.wdTime({ time: '+2014-02-04T00:00:00Z', precision: 11 }), '2014-02-04');
  assert.equal(W.wdTime({ time: '+2014-02-00T00:00:00Z', precision: 10 }), '2014-02');
  assert.equal(W.wdTime({ time: '+2014-00-00T00:00:00Z', precision: 9 }), '2014');
  assert.equal(W.wdTime({ time: 'x' }), null);
  assert.deepEqual(W.parseLabels({ entities: { Q1: { labels: { en: { value: 'A' }, id: { value: 'B' } } }, bad: {} } }), { Q1: 'B' });
  assert.deepEqual(W.parseSearch({ search: [{ id: 'Q1', label: 'X', description: 'd' }, { id: 'P31', label: 'p' }] }), [{ qid: 'Q1', label: 'X', description: 'd' }]);
  assert.throws(() => W.parseSearch({}), /tidak dikenal/);
});
