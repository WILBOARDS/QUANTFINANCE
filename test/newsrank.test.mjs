/* Tes peringkat & penggabungan berita (shared/newsrank.mjs). Judul uji dibuat tangan. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../shared/newsrank.mjs';

test('timeOf: format seendate GDELT dan ISO', () => {
  assert.equal(N.timeOf('20261007T120000Z'), Date.UTC(2026, 9, 7, 12, 0, 0));
  assert.equal(N.timeOf('2026-10-07T12:00:00Z'), Date.UTC(2026, 9, 7, 12, 0, 0));
  assert.ok(Number.isNaN(N.timeOf('kemarin')));
});

test('normalizeTitle: huruf kecil, tanpa tanda baca, akhiran media dibuang', () => {
  assert.equal(N.normalizeTitle('Fed Holds Rates Steady - Reuters'), 'fed holds rates steady');
  assert.equal(N.normalizeTitle('Rupiah’s slide deepens | CNBC'), 'rupiah slide deepens');
  assert.equal(N.normalizeTitle('Café prices: up 5%!'), 'cafe prices up 5');
  /* judul yang memang memuat tanda hubung panjang tidak dipotong */
  assert.equal(N.normalizeTitle('Oil - the long view on supply and demand over the next decade'), 'oil the long view on supply and demand over the next decade');
});

test('similarity: Jaccard kata bermakna, dihitung tangan', () => {
  /* A = {fed, holds, rates, steady}, B = {fed, holds, rates, again} -> 3 / 5 = 0,6 */
  assert.equal(N.similarity('Fed holds rates steady', 'Fed holds rates again'), 0.6);
  assert.equal(N.similarity('Fed holds rates', 'Fed holds rates'), 1);
  assert.equal(N.similarity('', 'apa saja'), 0);
  assert.equal(N.similarity('Oil jumps', 'Gold falls'), 0);
});

test('dedupe: yang paling awal jadi wakil, sisanya dicatat sebagai sumber lain', () => {
  const list = [
    { title: 'Fed holds rates steady as inflation cools - CNBC', url: 'u2', domain: 'cnbc.com', seen: '20261007T120500Z' },
    { title: 'Fed holds rates steady as inflation cools', url: 'u1', domain: 'reuters.com', seen: '20261007T120000Z' },
    { title: 'Oil prices jump after OPEC cut', url: 'u3', domain: 'ft.com', seen: '20261007T110000Z' },
    { title: 'Fed holds interest rates steady as inflation cools', url: 'u4', domain: 'apnews.com', seen: '20261007T121000Z' },
  ];
  const d = N.dedupe(list);
  assert.equal(d.length, 2);
  const fed = d.find(x => /Fed/.test(x.title));
  assert.equal(fed.url, 'u1');
  assert.deepEqual(fed.dupes.map(x => x.url), ['u2', 'u4']);
  assert.equal(d.find(x => /Oil/.test(x.title)).dupes.length, 0);
  /* masukan tidak diubah */
  assert.equal(list[0].dupes, undefined);
});

test('breaking: hanya 2 jam terakhir, terbaru dulu, waktu masa depan jauh dibuang', () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const list = [
    { title: 'a', seen: '20261007T113000Z' },
    { title: 'b', seen: '20261007T090000Z' },
    { title: 'c', seen: '20261007T115900Z' },
    { title: 'd', seen: '20261007T150000Z' },
    { title: 'e', seen: 'rusak' },
  ];
  assert.deepEqual(N.breaking(list, now).map(x => x.title), ['c', 'a']);
});

test('sortNews dan filterNews', () => {
  const list = [
    { title: 'x', seen: '20261007T100000Z', domain: 'a.com', srcCountry: 'US', a: { impact: 40, themes: [{ id: 'rates' }], speculative: false } },
    { title: 'y rupiah', seen: '20261007T110000Z', domain: 'b.com', srcCountry: 'ID', a: { impact: 70, themes: [{ id: 'fx' }], speculative: true } },
    { title: 'z', seen: '20261007T120000Z', domain: 'a.com', srcCountry: 'US', a: { impact: 40, themes: [], speculative: false } },
  ];
  assert.deepEqual(N.sortNews(list, 'time').map(x => x.title), ['z', 'y rupiah', 'x']);
  assert.deepEqual(N.sortNews(list, 'impact').map(x => x.title), ['y rupiah', 'z', 'x']);
  assert.deepEqual(N.filterNews(list, { country: 'US' }).map(x => x.title), ['x', 'z']);
  assert.deepEqual(N.filterNews(list, { theme: 'fx' }).map(x => x.title), ['y rupiah']);
  assert.deepEqual(N.filterNews(list, { spec: true }).map(x => x.title), ['y rupiah']);
  assert.deepEqual(N.filterNews(list, { domain: 'a.com', text: 'z' }).map(x => x.title), ['z']);
  assert.deepEqual(N.facet(list, n => n.domain), [['a.com', 2], ['b.com', 1]]);
});

test('queryFor: teks bebas jadi kueri GDELT yang aman', () => {
  assert.equal(N.queryFor('RUPIAH'), 'RUPIAH');
  assert.equal(N.queryFor('bank indonesia'), '"bank indonesia"');
  assert.equal(N.queryFor('<script>alert(1)</script>'), '"script alert 1 script"');
  assert.equal(N.queryFor('ab'), null);
  assert.equal(N.queryFor('   '), null);
  assert.equal(N.queryFor('"; DROP'), 'DROP');
});
