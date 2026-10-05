/* Uji parser terhadap fixture berformat API asli. Jalankan: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../shared/parsers.mjs';

const fx = n => readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
const js = n => JSON.parse(fx(n));

test('World Bank: baris null dibuang, agregat tetap ada, nilai terbaru per negara', () => {
  const r = P.parseWorldBank(js('worldbank-bulk.json'));
  assert.equal(r.rows.length, 3);
  assert.equal(r.meta.lastUpdated, '2026-09-15');
  const latest = P.wbLatest(r.rows);
  assert.deepEqual(latest.IDN, { value: 5.03, year: 2025 });
  assert.equal(latest.SOM, undefined, 'nilai null tidak boleh jadi 0');
});
test('World Bank: pesan error dilempar, tidak diam-diam kosong', () => {
  assert.throws(() => P.parseWorldBank(js('worldbank-error.json')), /World Bank/);
  assert.throws(() => P.parseWorldBank({ foo: 1 }), /tidak dikenal/);
});
test('IMF DataMapper: tahun non-angka dan nilai "n/a" dibuang, urut naik', () => {
  const r = P.parseImf(js('imf.json'), 'NGDP_RPCH');
  assert.deepEqual(r.series.IDN.map(x => x.year), [1999, 2000, 2024, 2025, 2026, 2027]);
  assert.equal(r.series.XYZ, undefined);
  assert.equal(P.imfAt(r.series.USA, 2026), 2.1);
  assert.equal(P.imfAt(r.series.USA, 2030), null);
});
test('GDELT artlist: tanggal ISO, duplikat judul sindikasi dibuang, tanpa url dilewati', () => {
  const a = P.parseGdeltArticles(js('gdelt-artlist.json'));
  assert.equal(a.length, 3);
  assert.equal(a[0].seen, '2026-10-05T08:15:00Z');
  assert.equal(a[1].srcCountry, 'United States');
  assert.equal(P.gdeltDate('bukan tanggal'), null);
});
test('GDELT timeline dan GEO', () => {
  const t = P.parseGdeltTimeline(js('gdelt-timeline.json'));
  assert.equal(t.length, 3);
  assert.equal(t[0].v, -1.25);
  const g = P.parseGdeltGeo(js('gdelt-geo.json'));
  assert.equal(g.length, 2);
  assert.equal(g[0].count, 42);
  assert.equal(g[0].articles.length, 2);
  assert.equal(g[0].articles[0].title, 'Rupiah slips as inflation & rates in focus');
  assert.equal(g[1].articles.length, 0);
});
test('FRED: "." dan kosong dibuang; CSV baru dan lama dikenali', () => {
  assert.deepEqual(P.parseFredObs(js('fred.json')).map(x => x.value), [4.11, 4.15, 4.09]);
  assert.deepEqual(P.parseFredCsv(fx('fred.csv')), [{ date: '2026-09-29', value: 4.11 }, { date: '2026-10-01', value: 4.15 }]);
  assert.deepEqual(P.parseFredCsv(fx('fred-old.csv')), [{ date: '2026-09-29', value: 3.61 }]);
  assert.throws(() => P.parseFredCsv('<html>error</html>'));
});
test('PortWatch: tiga bentuk tanggal + geometri + ringkasan', () => {
  const rows = P.parsePortWatch(js('portwatch.json'));
  assert.deepEqual(rows.map(r => r.date), ['2025-10-01', '2025-10-02', '2025-10-03']);
  assert.equal(rows[0].lat, 26.57);
  const s = P.summarizeChokepoints(rows);
  const h = s.find(x => x.name === 'Strait of Hormuz');
  assert.equal(h.last, 84);
  assert.equal(h.avg7, 87);
  assert.equal(h.lat, 26.57);
  assert.equal(h.chg, null, 'tanpa data setahun, perubahan harus null (bukan tebakan)');
  assert.throws(() => P.parsePortWatch({ error: { message: 'Invalid query' } }), /Invalid query/);
});
test('AISStream: posisi (heading 511 = tidak ada), statis, waktu UTC', () => {
  const p = P.parseAisStream(js('aisstream-position.json'));
  assert.equal(p.kind, 'pos');
  assert.equal(p.mmsi, 636019999);
  assert.equal(p.heading, null);
  assert.equal(p.sog, 12.4);
  assert.equal(p.name, 'TEST TANKER');
  assert.equal(new Date(p.ts).toISOString(), '2026-10-05T08:22:32.318Z');
  const s = P.parseAisStream(js('aisstream-static.json'));
  assert.equal(s.kind, 'static');
  assert.equal(s.shipType, 84);
  assert.equal(P.shipClass(s.shipType, s.name), 'gas');
  assert.equal(P.parseAisStream({ MetaData: {} }), null);
  assert.equal(P.parseAisStream({ MetaData: { MMSI: 1 }, Message: { PositionReport: { Latitude: 91, Longitude: 0 } } }), null, 'lintang mustahil ditolak');
});
test('Kelas kapal AIS', () => {
  assert.equal(P.shipClass(70), 'cargo');
  assert.equal(P.shipClass(80, 'NORDIC OIL'), 'tanker');
  assert.equal(P.shipClass(60), 'passenger');
  assert.equal(P.shipClass(null), 'unknown');
  assert.equal(P.shipClass(99), 'other');
});
test('Digitraffic: lokasi + metadata (draught desimeter -> meter)', () => {
  const l = P.parseDigitrafficLocations(js('digitraffic-locations.json'));
  assert.equal(l.length, 2);
  assert.equal(l[1].heading, null);
  assert.equal(l[0].lon, 24.95);
  const v = P.parseDigitrafficVessels(js('digitraffic-vessels.json'));
  assert.equal(v[0].draught, 6.8);
  assert.equal(v[0].dest, 'FIHEL');
});
test('USGS dan GDACS', () => {
  const u = P.parseUsgs(js('usgs.json'));
  assert.equal(u[0].mag, 6.1);
  assert.equal(u[0].depth, 35.2);
  const g = P.parseGdacs(js('gdacs.json'));
  assert.equal(g[0].kind, 'TC');
  assert.equal(g[0].alert, 'Orange');
  assert.equal(g[0].time, '2026-10-03T00:00:00.000Z');
});
test('Kurs, BIS CSV (kutip, kosong), kripto, Finnhub, Yahoo, Wikipedia', () => {
  const fxr = P.parseErApi(js('erapi.json'));
  assert.equal(fxr.rates.IDR, 16400.5);
  assert.throws(() => P.parseErApi({ result: 'error', 'error-type': 'quota-reached' }), /quota-reached/);
  const b = P.parseBisCsv(fx('bis.csv'));
  assert.deepEqual(b.ID.map(x => x.value), [5.5, 5.25]);
  assert.equal(b.XX, undefined);
  const bn = P.parseBinance24h(js('binance-24h.json'));
  assert.equal(bn[0].price, 97200);
  assert.equal(bn[0].chgPct, 1.25);
  const kl = P.parseBinanceKlines(js('binance-klines.json'));
  assert.equal(kl[1].close, 97200);
  assert.equal(kl[0].time, 1759536000);
  const d = P.parseBinanceDepth(js('binance-depth.json'));
  assert.equal(d.bids[0][0], 97199.99);
  const cg = P.parseCoinGecko(js('coingecko-markets.json'));
  assert.equal(cg[0].sym, 'BTC');
  assert.equal(P.parseFinnhubQuote({ c: 0, d: null }, 'ZZZZ'), null, 'kode tidak dikenal -> null, bukan harga 0');
  assert.equal(P.parseFinnhubQuote(js('finnhub-quote.json'), 'AAPL').prev, 233.79);
  const y = P.parseYahooChart(js('yahoo-chart.json'));
  assert.equal(y.currency, 'GBp');
  assert.equal(y.bars.length, 2);
  assert.equal(P.parseWikiSummary(js('wiki-summary.json')).url, 'https://en.wikipedia.org/wiki/Test_Person');
});
test('Sinyal insider hanya menghitung kode P dan S', () => {
  const rows = P.parseFinnhubInsider(js('finnhub-insider.json'));
  const s = P.insiderSignal(rows, 180, Date.parse('2026-10-05'));
  assert.equal(s.buys, 1);
  assert.equal(s.sells, 1);
  assert.equal(s.sellValue, 5000 * 230.5);
  assert.equal(s.label, 'Menjual');
  assert.equal(P.insiderSignal([], 180).label, 'Tidak ada transaksi pasar');
});
test('parseCsv menangani kutip ganda dan baris CRLF', () => {
  assert.deepEqual(P.parseCsv('a,b\r\n"x,1","y ""q"""\r\n'), [['a', 'b'], ['x,1', 'y "q"']]);
});
