/* Tes fundamental SEC EDGAR: peringkas companyfacts, rasio, pertumbuhan, valuasi, Piotroski
   (input hilang -> "Data kurang"), Altman (dihitung tangan), parser ticker/submissions,
   dan rute server (/api/sec/*: 503 tanpa SEC_USER_AGENT, 400 untuk parameter rusak). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as F from '../shared/fundamentals.mjs';

const fx = n => JSON.parse(readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
const RAW = fx('sec-companyfacts.json');
const C = F.compactFacts(RAW);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('compactFacts: deret tahunan, label tahun fiskal dari tanggal, dedupe ambil yang terakhir dilaporkan', () => {
  assert.equal(C.cik, '0001234567');
  assert.match(C.entityName, /\[UJI\]/);
  const rev = C.annual.revenue;
  assert.deepEqual(rev.map(r => r.fy), [2024, 2023, 2022, 2021]);
  assert.deepEqual(rev.map(r => r.value), [1e9, 8e8, 7e8, 6.5e8]);
  /* FY2023: 790 jt di 10-K 2023, dinyatakan ulang 800 jt di 10-K 2024 (dilaporkan lebih akhir) -> 800 jt */
  const r23 = rev[1];
  assert.equal(r23.accn, '0001234567-25-000010');
  assert.equal(r23.filed, '2025-02-20');
  assert.equal(r23.fp, 'FY');
  assert.equal(r23.form, '10-K');
  assert.equal(r23.concept, 'Revenues');
  assert.equal(r23.unit, 'USD');
  assert.equal(r23.start, '2023-01-01');
  assert.equal(r23.end, '2023-12-31');
  /* setiap nilai membawa asal-usulnya */
  for (const k of ['value', 'unit', 'end', 'start', 'fy', 'fp', 'form', 'filed', 'accn', 'concept']) assert.ok(k in r23, k);
  /* neraca: akhir tahun ini + pembanding tahun lalu dari 10-K */
  assert.deepEqual(C.annual.assets.map(r => [r.fy, r.value]), [[2024, 2e9], [2023, 1.6e9], [2022, 1.5e9]]);
  assert.equal(C.annual.assets[0].start, null);
  assert.deepEqual(C.annual.longTermDebt.map(r => r.fy), [2024]);
  assert.equal(C.sharesOutstanding[0].value, 50500000);
  assert.equal(C.sharesOutstanding[0].concept, F.SHARES_OUT);
  assert.equal(C.units.epsDiluted, 'USD/shares');
  assert.deepEqual(C.conceptsUsed.revenue, ['Revenues']);
});

test('compactFacts: kuartal 3 bulan, amandemen 10-Q/A, kuartal turunan dari YTD ditandai "calculated"', () => {
  const q = Object.fromEntries(C.quarterly.revenue.map(r => [r.fp + r.fy, r]));
  /* pembanding Q1 2023 di dalam 10-Q 2024 tidak boleh masuk */
  assert.ok(!C.quarterly.revenue.some(r => r.end === '2023-03-31'));
  assert.equal(q.Q12024.value, 231e6);                 // 10-Q/A (dilaporkan 2024-06-15) mengganti 230 jt
  assert.equal(q.Q12024.form, '10-Q/A');
  assert.equal(q.Q22024.value, 240e6);
  assert.equal(q.Q22024.quality, undefined);           // angka 3 bulan langsung dari laporan
  assert.equal(q.Q32024.value, 250e6);
  assert.equal(q.Q42024.value, 1e9 - 720e6);           // setahun − YTD 9 bulan
  assert.equal(q.Q42024.quality, 'calculated');
  assert.match(q.Q42024.formula, /YTD 9 bulan/);
  assert.equal(q.Q42024.start, '2024-10-01');
  const cfo = Object.fromEntries(C.quarterly.cfo.map(r => [r.fp + r.fy, r]));
  assert.equal(cfo.Q12024.value, 30e6);
  assert.equal(cfo.Q22024.value, 32e6);
  assert.equal(cfo.Q22024.quality, 'calculated');
  assert.equal(cfo.Q32024.value, 33e6);
  assert.equal(cfo.Q42024.value, 35e6);
  /* EPS tidak bisa dijumlah: tidak ada Q4 turunan */
  assert.deepEqual(C.quarterly.epsDiluted.map(r => r.fp + r.fy), ['Q12024']);
  /* neraca kuartalan: 10-Q periode sendiri + akhir tahun fiskal dari 10-K (sebagai Q4) */
  assert.deepEqual(C.quarterly.assets.map(r => r.fp + r.fy + ':' + r.value), ['Q42024:2000000000', 'Q12024:1650000000', 'Q42023:1600000000', 'Q42022:1500000000']);
  /* FCF turunan */
  const fcf = C.annual.fcf[0];
  assert.equal(fcf.value, 100e6);
  assert.equal(fcf.quality, 'calculated');
  assert.match(fcf.formula, /capex/);
});

test('compactFacts: format tidak dikenal melempar error (bukan data kosong diam-diam)', () => {
  assert.throws(() => F.compactFacts({ cik: 1 }), /tidak dikenal/);
  assert.throws(() => F.compactFacts(null), /tidak dikenal/);
  /* tanpa us-gaap (mis. pelapor IFRS): deret kosong, ditandai */
  const ifrs = F.compactFacts({ cik: 5, entityName: 'X', facts: { 'ifrs-full': {} } });
  assert.equal(ifrs.usGaap, false);
  assert.deepEqual(ifrs.annual.revenue, []);
});

test('rasio FY2024 dengan rumus eksplisit; input hilang = "Data kurang"', () => {
  const R = F.ratiosFor(C, 2024);
  close(R.grossMargin.value, 0.4);
  close(R.opMargin.value, 0.15);
  close(R.netMargin.value, 0.1);
  close(R.roa.value, 0.05);
  close(R.roe.value, 0.1);
  close(R.currentRatio.value, 2);
  close(R.debtEquity.value, 0.3);
  close(R.assetTurnover.value, 0.5);
  close(R.fcfMargin.value, 0.1);
  assert.equal(R.roe.quality, 'calculated');
  assert.match(R.roe.formula, /Laba bersih ÷ Ekuitas/);
  assert.equal(R.roe.inputs[0].rec.concept, 'NetIncomeLoss');
  const R23 = F.ratiosFor(C, 2023);
  assert.equal(R23.debtEquity.value, null);
  assert.match(R23.debtEquity.reason, /^Data kurang: Utang jangka panjang \(FY2023\)/);
  close(R23.grossMargin.value, 300 / 800);
  /* daftar rasio per tahun, terbaru dulu */
  assert.deepEqual(F.ratios(C).map(x => x.fy), [2024, 2023, 2022, 2021]);
});

test('pertumbuhan YoY dan QoQ; basis ≤ 0 tidak dihitung', () => {
  const G = Object.fromEntries(F.growthYoY(C).map(x => [x.fy, x.items]));
  close(G[2024].revenue.value, 0.25);
  close(G[2024].netIncome.value, 100 / 60 - 1);
  close(G[2022].revenue.value, 700 / 650 - 1);
  assert.equal(G[2021].revenue.value, null);           // tidak ada FY2020
  assert.match(G[2021].revenue.reason, /Data kurang/);
  const Q = F.growthQoQ(C);
  const q2 = Q.find(x => x.fp === 'Q2' && x.fy === 2024);
  close(q2.items.revenue.value, 240 / 231 - 1);
  const neg = F.growthYoY({ annual: { revenue: [{ value: 5, fy: 2024, fp: 'FY', end: '2024-12-31' }, { value: -2, fy: 2023, fp: 'FY', end: '2023-12-31' }] } }, { keys: ['revenue'] });
  assert.equal(neg[0].items.revenue.value, null);
  assert.match(neg[0].items.revenue.reason, /≤ 0/);
});

test('valuasi hanya dengan harga nyata; tanpa harga semua "Data kurang"', () => {
  const price = { value: 60, currency: 'USD', source: 'Finnhub /quote', asOf: '2025-03-01T20:00:00Z', fetchedAt: '2025-03-01T20:00:05Z', quality: 'delayed' };
  const V = F.valuation(C, price);
  close(V.items.marketCap.value, 60 * 50.5e6, 1e-3);
  close(V.items.pe.value, 60 / 1.96);
  close(V.items.ps.value, 3.03);
  close(V.items.pb.value, 3.03);
  close(V.items.evSales.value, (3.03e9 + 3e8 - 2e8) / 1e9);
  assert.equal(V.items.marketCap.inputs[0].rec.isPrice, true);
  assert.match(V.items.marketCap.formula, /EntityCommonStockSharesOutstanding/);
  const N = F.valuation(C, { value: null, reason: 'FINNHUB_API_KEY belum diisi' });
  for (const k of Object.keys(F.VALUATION_LABELS)) { assert.equal(N.items[k].value, null); assert.match(N.items[k].reason, /Data kurang: harga tidak tersedia/); }
  const X = F.valuation(C, { ...price, currency: 'EUR' });
  assert.match(X.items.pe.reason, /mata uang/);
  const E = F.valuation({ ...C, annual: { ...C.annual, epsDiluted: [{ ...C.annual.epsDiluted[0], value: -0.5 }] } }, price);
  assert.equal(E.items.pe.value, null);
  assert.match(E.items.pe.reason, /EPS ≤ 0/);
});

test('Piotroski: 9 kriteria, satu input hilang -> "Data kurang", skor X dari Y tanpa normalisasi', () => {
  const P = F.piotroski(C, 2024);
  assert.equal(P.criteria.length, 9);
  const by = Object.fromEntries(P.criteria.map(c => [c.id, c]));
  for (const c of P.criteria) {
    assert.ok(['Profitabilitas', 'Leverage & likuiditas', 'Efisiensi operasi'].includes(c.group));
    assert.ok(c.formula.length > 5);
    for (const i of c.inputs) for (const k of ['name', 'value', 'period', 'concept']) assert.ok(k in i, c.id + ' ' + k);
  }
  /* F1: 100 / 1600 = 0.0625 > 0 */
  assert.equal(by.F1.pass, true); close(by.F1.value, 0.0625);
  assert.equal(by.F2.pass, true);
  /* F3: 100/1600 − 60/1500 = 0.0225 */
  assert.equal(by.F3.pass, true); close(by.F3.value, 0.0625 - 0.04);
  assert.equal(by.F4.pass, true);
  /* F5: utang jangka panjang FY2023 tidak dilaporkan -> Data kurang (bukan dianggap 0) */
  assert.equal(by.F5.pass, null);
  assert.match(by.F5.reason, /^Data kurang: .*Utang jangka panjang tahun lalu \(FY2023\)/);
  assert.equal(by.F5.inputs.find(i => i.name === 'Utang jangka panjang tahun lalu').value, null);
  /* F6: 800/400 = 2.0 vs 600/350 */
  assert.equal(by.F6.pass, true); close(by.F6.value, 2 - 600 / 350);
  /* F7: 51 jt > 50 jt saham -> gagal */
  assert.equal(by.F7.pass, false);
  /* F8: 0.40 vs 0.375 ; F9: 1000/1600 vs 800/1500 */
  assert.equal(by.F8.pass, true); close(by.F8.value, 0.4 - 0.375);
  assert.equal(by.F9.pass, true); close(by.F9.value, 1000 / 1600 - 800 / 1500);
  assert.equal(P.score, 7);
  assert.equal(P.complete, 8);
  assert.equal(P.text, '7 dari 8 kriteria yang datanya lengkap');
  assert.equal(P.missing, 1);
  /* tahun tanpa data lengkap: banyak kriteria null, tetap tidak dinormalisasi ke 9 */
  const P22 = F.piotroski(C, 2022);
  assert.ok(P22.complete < 9);
  assert.equal(P22.text, `${P22.score} dari ${P22.complete} kriteria yang datanya lengkap`);
});

test("Altman Z'' dan Z asli dihitung tangan; bank tidak berlaku; komponen hilang = Data kurang", () => {
  const A = F.altman(C, 2024, { sic: '3571' });
  assert.equal(A.applicable, true);
  const z = A.zpp;
  const X = Object.fromEntries(z.components.map(c => [c.id, c]));
  close(X.X1.value, (800 - 400) / 2000);
  close(X.X2.value, 500 / 2000);
  close(X.X3.value, 150 / 2000);
  close(X.X4.value, 1000 / 1000);
  /* 6.56·0.2 + 3.26·0.25 + 6.72·0.075 + 1.05·1.0 = 1.312 + 0.815 + 0.504 + 1.05 = 3.681 */
  close(z.score, 3.681);
  assert.equal(z.zone, 'aman');
  assert.deepEqual(z.thresholds, { safe: 2.6, distress: 1.1 });
  assert.match(z.interpretation, /Bukan jaminan/);
  assert.equal(A.z, null);
  assert.match(A.zReason, /kapitalisasi pasar/);
  /* Z asli dengan kapitalisasi pasar 3 M: 1.2·0.2 + 1.4·0.25 + 3.3·0.075 + 0.6·3 + 1.0·0.5 = 3.1375 */
  const B = F.altman(C, 2024, { sic: '3571', marketCap: { value: 3e9, period: 'harga 2025-03-01', concept: 'Harga × saham beredar' } });
  close(B.z.score, 3.1375);
  assert.equal(B.z.zone, 'aman');
  assert.equal(B.z.components.length, 5);
  /* bank (SIC 6000–6999) */
  const bank = F.altman(C, 2024, { sic: '6021', sicDescription: 'National Commercial Banks' });
  assert.equal(bank.applicable, false);
  assert.match(bank.reason, /Tidak berlaku untuk bank/);
  /* total liabilitas hilang -> X4 null -> skor null, tidak ditebak dari aset − ekuitas */
  const noTL = F.compactFacts({ ...RAW, facts: { ...RAW.facts, 'us-gaap': Object.fromEntries(Object.entries(RAW.facts['us-gaap']).filter(([k]) => k !== 'Liabilities')) } });
  const M = F.altman(noTL, 2024, { sic: '3571' });
  assert.equal(M.zpp.score, null);
  assert.match(M.zpp.reason, /^Data kurang: X4/);
  /* zona */
  assert.equal(F.isFinancialSic('6999'), true);
  assert.equal(F.isFinancialSic('7372'), false);
  assert.equal(F.isFinancialSic(''), false);
});

test('parseTickers, secTicker, parseSubmissions (SIC, daftar laporan, tautan aman)', () => {
  const T = F.parseTickers(fx('sec-tickers.json'));
  assert.deepEqual(T.byTicker.UJIM, [1234567, '[UJI] Contoh Manufaktur Inc.']);
  assert.equal(T.byCik[7654321], 'UJIB');               // ticker pertama = kelas utama
  assert.ok(T.byTicker['UJIB-P']);
  assert.ok(!T.byTicker.BAD && !T.byTicker['<X>']);
  assert.equal(F.secTicker('BRK.B'), 'BRK-B');
  assert.ok(T.byTicker[F.secTicker('brk.b')]);
  assert.throws(() => F.parseTickers({}), /tidak dikenal/);
  const S = F.parseSubmissions(fx('sec-submissions.json'));
  assert.equal(S.cik, '0007654321');
  assert.equal(S.sic, '6021');
  assert.equal(S.fiscalYearEnd, '1231');
  assert.deepEqual(S.filings.map(f => f.form), ['4', '8-K', 'SCHEDULE 13G', '10-K', '10-Q']);   // DEF 14A tidak diambil
  const k = S.filings.find(f => f.form === '10-K');
  assert.equal(k.url, 'https://www.sec.gov/Archives/edgar/data/7654321/000765432125000010/ujib-20241231.htm');
  assert.equal(k.indexUrl, 'https://www.sec.gov/Archives/edgar/data/7654321/000765432125000010/0007654321-25-000010-index.htm');
  assert.equal(S.filings.find(f => f.form === '4').url, 'https://www.sec.gov/Archives/edgar/data/7654321/000199999925000101/xslF345X05/wk-form4_1741640000.xml');
  /* dokumen dengan ".." diganti tautan indeks */
  assert.match(S.filings.find(f => f.form === 'SCHEDULE 13G').url, /-index\.htm$/);
  assert.equal(F.companyUrl(320193), 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193');
  assert.equal(F.factsUrl('320193'), 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json');
  assert.throws(() => F.parseSubmissions({}), /tidak dikenal/);
});

/* ---------- rute server ---------- */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function withServer(extraEnv, fn, args = []) {
  const port = await freePort();
  const cacheDir = mkdtempSync(join(tmpdir(), 'qt-sec-'));
  const p = spawn(process.execPath, [...args, join(ROOT, 'server/server.mjs')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CACHE_DIR: cacheDir, AISSTREAM_API_KEY: '', FINNHUB_API_KEY: '', FRED_API_KEY: '', DIGITRAFFIC_ENABLED: '0', ENABLE_UNOFFICIAL_YAHOO: '0', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  p.stdout.on('data', d => { log += d; }); p.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 200 && !/jalan di/.test(log); i++) await new Promise(r => setTimeout(r, 50));
  try { return await fn(`http://127.0.0.1:${port}`); }
  finally { p.kill(); rmSync(cacheDir, { recursive: true, force: true }); }
}
const getJ = async url => { const r = await fetch(url); return { status: r.status, j: await r.json() }; };

test('server: tanpa SEC_USER_AGENT -> 503 dengan pesan jelas; parameter rusak -> 400', async () => {
  await withServer({ SEC_USER_AGENT: '' }, async base => {
    for (const path of ['/api/sec/cik?ticker=AAPL', '/api/sec/facts?cik=320193', '/api/sec/filings?cik=320193', '/api/sec/frames?concept=Revenues&unit=USD&period=CY2024']) {
      const { status, j } = await getJ(base + path);
      assert.equal(status, 503, path);
      assert.equal(j.ok, false);
      assert.match(j.error.message, /SEC_USER_AGENT/);
      assert.match(j.error.message, /\.env/);
      assert.ok(!/@example|@gmail/.test(j.error.message), 'tidak boleh mengarang email');
    }
    for (const path of ['/api/sec/cik?ticker=<x>', '/api/sec/cik', '/api/sec/facts?cik=abc', '/api/sec/facts?cik=12345678901', '/api/sec/filings?cik=1;2',
      '/api/sec/frames?concept=Evil&unit=USD&period=CY2024', '/api/sec/frames?concept=Revenues&unit=EUR&period=CY2024', '/api/sec/frames?concept=Revenues&unit=shares&period=CY2024',
      '/api/sec/frames?concept=Assets&unit=USD&period=CY2024', '/api/sec/frames?concept=Revenues&unit=USD&period=CY2024Q4I', '/api/sec/frames?concept=Revenues&unit=USD&period=CY1999',
      '/api/sec/frames?concept=Revenues&unit=USD&period=CY2999', '/api/sec/frames?concept=Revenues&unit=USD&period=../../x']) {
      const { status, j } = await getJ(base + path);
      assert.equal(status, 400, path);
      assert.equal(j.ok, false);
    }
    const prov = await getJ(base + '/api/providers');
    const sec = prov.j.providers.find(p => p.id === 'sec');
    assert.ok(sec, 'penyedia sec terdaftar');
    assert.equal(sec.status, 'unconfigured');
  });
});

test('server: dengan SEC_USER_AGENT + sumber palsu berformat asli -> cik, facts ringkas, filings, frames', async () => {
  const preload = pathToFileURL(join(ROOT, 'qa/server-preload.mjs')).href;
  await withServer({ SEC_USER_AGENT: 'QuantTerminal uji test@example.invalid' }, async base => {
    const c = await getJ(base + '/api/sec/cik?ticker=AAPL');
    assert.equal(c.status, 200);
    assert.equal(c.j.data.cik, '0000320193');
    assert.equal(c.j.provider, 'sec');
    const b = await getJ(base + '/api/sec/cik?ticker=BRK.B');
    assert.equal(b.j.data.ticker, 'BRK-B');
    const nf = await getJ(base + '/api/sec/cik?ticker=ZZZZZ');
    assert.equal(nf.status, 404);
    const f = await getJ(base + '/api/sec/facts?cik=320193');
    assert.equal(f.status, 200);
    assert.match(f.j.data.entityName, /\[UJI\]/);
    assert.ok(f.j.data.annual.revenue.length >= 5);
    assert.ok(f.j.data.quarterly.revenue.length >= 4);
    assert.equal(f.j.quality, 'historical');
    assert.match(f.j.sourceUrl, /companyfacts\/CIK0000320193\.json$/);
    const unknown = await getJ(base + '/api/sec/facts?cik=1');
    assert.equal(unknown.status, 404);
    const s = await getJ(base + '/api/sec/filings?cik=19617');
    assert.equal(s.j.data.sic, '6021');
    assert.ok(s.j.data.filings.some(x => x.form === '4'));
    const fr = await getJ(base + '/api/sec/frames?concept=Revenues&unit=USD&period=CY2024');
    assert.equal(fr.status, 200);
    assert.ok(fr.j.data.rows.length > 5);
    assert.ok(!fr.j.data.rows.some(r => r[0] >= 9900000), 'pelapor tanpa ticker dibuang');
    assert.ok(Object.values(fr.j.data.ent).every(e => e[1]));
    const inst = await getJ(base + '/api/sec/frames?concept=Assets&unit=USD&period=CY2024Q4I');
    assert.equal(inst.status, 200);
    assert.equal(inst.j.data.rows[0][2], '');               // instan: tanpa tanggal mulai
  }, ['--import', preload]);
});
