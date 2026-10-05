/* Tes browser end-to-end. Jalankan: npm run e2e
   Mode A: file HTML dibuka langsung (tanpa server), API dijawab sumber palsu berformat asli.
   Mode B: server lokal (dengan sumber palsu), semua halaman.
   Mode C: tanpa jaringan sama sekali: semua panel harus menulis "tidak tersedia", tanpa error JS. */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fakeUpstream } from './fake-upstream.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, channel: exe ? undefined : 'msedge', args: ['--no-sandbox'] });
const FILE = 'file://' + new URL('../dist/quant-terminal.html', import.meta.url).pathname;
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
let fails = 0;

async function page(vp, { mock = true, offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'no-preference' });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push('PAGEERROR ' + String(e.stack || e).slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) p.errs.push('console ' + m.text().slice(0, 200)); });
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('http://127.0.0.1:8799') || u.startsWith('data:')) return route.continue();
    if (offline || !mock) return route.abort('internetdisconnected');
    const r = fakeUpstream(u);
    if (!r) return route.abort('blockedbyclient');
    return route.fulfill({ status: r.status, contentType: r.type, body: r.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return p;
}
async function scenario(name, fn, vp = { width: 1440, height: 900 }, opts) {
  const p = await page(vp, opts);
  try {
    const note = await fn(p);
    const ok = !p.errs.length;
    if (!ok) fails++;
    results.push(`${ok ? 'OK  ' : 'ERR '} ${name}${note ? ' -> ' + JSON.stringify(note) : ''}${p.errs.length ? '\n      ' + p.errs.join('\n      ') : ''}`);
  } catch (e) {
    fails++;
    results.push(`FAIL ${name}: ${String(e.message).split('\n')[0].slice(0, 220)}${p.errs.length ? '\n      ' + p.errs.join('\n      ') : ''}`);
    try { await p.screenshot({ path: OUT + 'fail-' + name.replace(/\W+/g, '_') + '.png' }); } catch { /* abaikan */ }
  }
  await p.context().close();
}
const shot = (p, n, o = {}) => p.screenshot({ path: OUT + n + '.png', ...o });
const go = async (p, page) => { await p.click(`.nav [data-page="${page}"]`); await wait(300); };

/* ---------------- Mode A: tanpa server ---------------- */
await scenario('A1 pasar tanpa server: kripto live, saham n/a', async p => {
  await p.goto(FILE); await wait(2500);
  const r = await p.evaluate(() => ({ btc: BY.BTC.quality, btcPrice: BY.BTC.price, aapl: BY.AAPL.quality, aaplPrice: BY.AAPL.price, mode: document.getElementById('modeText').textContent, srv: document.getElementById('srvText').textContent }));
  if (r.btc !== 'live' || !(r.btcPrice > 0)) throw new Error('BTC tidak live: ' + JSON.stringify(r));
  if (r.aapl !== 'unavailable' || Number.isFinite(r.aaplPrice)) throw new Error('AAPL seharusnya tidak tersedia (tanpa demo): ' + JSON.stringify(r));
  await shot(p, 'A1-pasar');
  return r;
}, undefined, { mock: true });
await scenario('A2 grafik BTC dari klines + order book', async p => {
  await p.goto(FILE); await wait(1500);
  await p.click('#rows li[data-sym="BTC"] .row'); await wait(1500);
  const na = await p.evaluate(() => document.getElementById('chartNa').hidden);
  if (!na) throw new Error('Grafik BTC menampilkan "tidak tersedia"');
  await p.click('[data-at="book"]'); await wait(1200);
  const txt = await p.textContent('#assetTabBody');
  if (!/Spread/.test(txt)) throw new Error('Order book tidak tampil');
  await shot(p, 'A2-btc');
});
await scenario('A3 globe 3D di halaman pasar', async p => {
  await p.goto(FILE); await wait(1000);
  await p.click('.map-card .seg [data-view="globe"]'); await wait(1500);
  await shot(p, 'A3-market-globe', { clip: { x: 0, y: 90, width: 1080, height: 400 } });
});
await scenario('A4 negara tanpa server (World Bank/IMF langsung)', async p => {
  await p.goto(FILE + '#country'); await wait(3500);
  const n = await p.$$eval('#cTable tbody tr', r => r.length);
  if (n < 150) throw new Error('Baris negara terlalu sedikit: ' + n);
  await shot(p, 'A4-negara');
  return { negara: n };
});
await scenario('A5 intel 3D tanpa server: bencana USGS, kapal Baltik langsung', async p => {
  await p.goto(FILE + '#intel'); await wait(5000);
  const s = await p.evaluate(() => ({ hz: IntelPage && document.querySelectorAll('#intelFeed .feed-row').length, ships: document.querySelector('#layerChips [data-l="ships"]').title }));
  await shot(p, 'A5-intel');
  return s;
});

/* ---------------- Mode C: offline total ---------------- */
await scenario('C1 offline: semua halaman tanpa error JS', async p => {
  await p.goto(FILE); await wait(2000);
  for (const pg of ['intel', 'country', 'news', 'ships', 'macro', 'cash', 'sources', 'about', 'market']) { await go(p, pg); await wait(900); }
  await go(p, 'ships'); await wait(800);
  const t = await p.textContent('#vesselWrap');
  if (!/tidak tersedia/i.test(t)) throw new Error('Halaman kapal tidak menulis "tidak tersedia" saat offline');
  await shot(p, 'C1-offline-kapal');
  await go(p, 'news'); await wait(1500);
  await shot(p, 'C1-offline-berita');
}, undefined, { offline: true });

/* ---------------- Mode B: dengan server ---------------- */
const srv = spawn(process.execPath, ['--import', new URL('./server-preload.mjs', import.meta.url).pathname, new URL('../server/server.mjs', import.meta.url).pathname], {
  env: { ...process.env, CACHE_DIR: OUT + 'cache', PORT: '8799', AISSTREAM_API_KEY: 'uji', FINNHUB_API_KEY: 'uji', FRED_API_KEY: '', ENABLE_UNOFFICIAL_YAHOO: '1', DIGITRAFFIC_ENABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
for (let i = 0; i < 40 && !/jalan di/.test(srvLog); i++) await wait(150);
const URLB = 'http://127.0.0.1:8799/';
/* mode server: browser TIDAK boleh ke internet langsung, supaya semua jalur server benar-benar teruji */
const SRV = { mock: false };

await scenario('B1 server: saham AS live (Finnhub), indeks (Yahoo/FRED), kripto', async p => {
  await p.goto(URLB); await wait(6000);
  const r = await p.evaluate(() => ({ srv: document.getElementById('srvText').textContent, aapl: [BY.AAPL.quality, BY.AAPL.srcName], spx: [BY.SPX.quality, BY.SPX.srcName], bbca: [BY.BBCA.quality, BY.BBCA.srcName], btc: BY.BTC.quality }));
  if (r.aapl[0] !== 'live') throw new Error('AAPL tidak live: ' + JSON.stringify(r));
  await shot(p, 'B1-pasar-server');
  return r;
}, undefined, SRV);
await scenario('B2 server: intel 3D dengan kapal AIS bergerak', async p => {
  await p.goto(URLB + '#intel'); await wait(7000);
  const a = await p.evaluate(() => IntelPage && document.querySelector('#layerChips [data-l="ships"]').title);
  await shot(p, 'B2-intel');
  await p.click('#layerChips [data-l="news"]'); await wait(3000);
  await shot(p, 'B2-intel-berita');
  return { kapal: a };
}, undefined, SRV);
await scenario('B3 server: halaman kapal, lompat ke Hormuz, pilih kapal', async p => {
  await p.goto(URLB + '#ships'); await wait(6000);
  await p.click('#shipJump [data-j="Hormuz"]'); await wait(2500);
  await shot(p, 'B3-kapal-hormuz');
  const rows = await p.$$eval('#vesselWrap tbody tr', r => r.length);
  if (!rows) throw new Error('Tabel kapal kosong');
  await p.click('#vesselWrap tbody tr'); await wait(1500);
  const side = await p.textContent('#shipSide');
  if (!/MMSI/.test(side)) throw new Error('Panel kapal tidak tampil');
  await shot(p, 'B3-kapal-detail');
  const choke = await p.$$eval('#chokeWrap tbody tr', r => r.length);
  return { kapal: rows, chokepoint: choke };
}, undefined, SRV);
await scenario('B4 server: negara Indonesia + berita & spekulasi + perbandingan', async p => {
  await p.goto(URLB + '#country'); await wait(5000);
  await p.click('#cTable tbody tr[data-iso="IDN"]').catch(() => {}); await wait(2500);
  await shot(p, 'B4-negara-idn');
  await p.click('#cDetail [data-tab="news"]'); await wait(9000);
  await shot(p, 'B4-negara-berita');
  const naNews = await p.$$eval('#page-country .na-box strong', e => e.map(x => x.textContent));
  await p.click('#cDetail [data-tab="overview"]'); await wait(4000);
  const naOv = await p.$$eval('#page-country .na-box strong', e => e.map(x => x.textContent));
  const mon = await p.$$eval('#cMon dt', e => e.map(x => x.textContent));
  if (naNews.length || naOv.length) throw new Error('Panel tidak tersedia di mode server: ' + JSON.stringify([naNews, naOv]));
  await p.click('#cDetail [data-tab="compare"]'); await wait(1200);
  await shot(p, 'B4-negara-banding');
  return { moneter: mon };
}, undefined, SRV);
await scenario('B5 server: terminal berita', async p => {
  await p.goto(URLB + '#news'); await wait(5000);
  const n = await p.$$eval('#newsTable tbody tr', r => r.length);
  if (n < 10) throw new Error('Berita terlalu sedikit: ' + n);
  await shot(p, 'B5-berita');
  return { judul: n };
}, undefined, SRV);
await scenario('B6 server: makro, rezim, korelasi, analog', async p => {
  await p.goto(URLB + '#macro'); await wait(12000);
  const reg = await p.textContent('#regimeBody');
  if (!/Risk|Netral|Transisi/.test(reg)) throw new Error('Rezim tidak dihitung');
  const na = await p.$$eval('#page-macro .na-box strong', e => e.map(x => x.textContent));
  const cmdtyNa = await p.$$eval('#cmdtyBody td.c-na', e => e.length);
  if (na.length) throw new Error('Panel makro tidak tersedia di mode server: ' + JSON.stringify(na));
  const cb = await p.$$eval('#cbBody tbody tr', e => e.length);
  await shot(p, 'B6-makro', { fullPage: true });
  return { bankSentral: cb, komoditasKosong: cmdtyNa };
}, undefined, SRV);
await scenario('B7 server: sumber data', async p => {
  await p.goto(URLB + '#sources'); await wait(4000);
  await shot(p, 'B7-sumber', { fullPage: true });
}, undefined, SRV);
await scenario('B8 server: palet perintah Ctrl+K', async p => {
  await p.goto(URLB); await wait(2500);
  await p.keyboard.press('Control+k'); await wait(300);
  await p.keyboard.type('COMPARE ID US CN'); await wait(300);
  await shot(p, 'B8-palet');
  await p.keyboard.press('Enter'); await wait(2500);
  const tab = await p.$eval('#cDetail [aria-selected="true"]', e => e.textContent);
  if (!/Bandingkan/.test(tab)) throw new Error('COMPARE tidak membuka tab bandingkan');
  await p.keyboard.press('Control+k'); await p.keyboard.type('Jensen Huang'); await wait(1500);
  await shot(p, 'B8-palet-tokoh');
}, undefined, SRV);
await scenario('B9 server: AAPL fundamental + insider + kenapa bergerak', async p => {
  await p.goto(URLB); await wait(3000);
  await p.click('#rows li[data-sym="AAPL"] .row'); await wait(2500);
  await p.click('[data-at="why"]'); await wait(3000);
  await shot(p, 'B9-aapl-why', { clip: { x: 680, y: 490, width: 400, height: 380 } });
  await p.click('[data-at="fund"]'); await wait(1500);
  await shot(p, 'B9-aapl-fund', { clip: { x: 680, y: 490, width: 400, height: 380 } });
  await p.click('[data-at="insider"]'); await wait(1500);
  const t = await p.textContent('#assetTabBody');
  if (!/Menjual|Membeli|Campuran|Netral/.test(t)) throw new Error('Sinyal insider tidak tampil');
}, undefined, SRV);
await scenario('B10 HP 390 px tanpa scroll horizontal', async p => {
  const res = {};
  for (const pg of ['market', 'intel', 'country', 'news', 'ships', 'macro', 'sources']) {
    await p.goto(URLB + '#' + pg); await wait(1800);
    res[pg] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  }
  await shot(p, 'B10-hp-intel');
  if (Object.values(res).some(v => v > 1)) throw new Error('Overflow horizontal: ' + JSON.stringify(res));
  return res;
}, { width: 390, height: 844 }, SRV);
await scenario('B11 laptop 1366x768 + tablet 1024', async p => {
  await p.goto(URLB + '#intel'); await wait(3000);
  await shot(p, 'B11-laptop-intel');
  await p.setViewportSize({ width: 1024, height: 768 });
  await p.goto(URLB + '#ships'); await wait(3000);
  await shot(p, 'B11-tablet-kapal');
}, { width: 1366, height: 768 }, SRV);
await scenario('B12 performa: muat halaman dan waktu gambar globe per frame', async p => {
  const t0 = Date.now();
  await p.goto(URLB); const load = Date.now() - t0;
  await p.goto(URLB + '#intel'); await wait(6000);
  const r = await p.evaluate(async () => {
    const g = IntelPage.globe, out = [];
    g.setAuto(true);
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 40)); out.push(g.lastDrawMs); }
    out.sort((a, b) => a - b);
    g.flyTo(56.3, 26.4, 25, 10); await new Promise(r => setTimeout(r, 300));
    const near = [];
    for (let i = 0; i < 10; i++) { g.redraw(); await new Promise(r => setTimeout(r, 60)); near.push(g.lastDrawMs); }
    near.sort((a, b) => a - b);
    const nav = performance.getEntriesByType('navigation')[0];
    return { medianMs: +out[20].toFixed(1), p90Ms: +out[36].toFixed(1), nearMedianMs: +near[5].toFixed(1), domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd) };
  });
  return { loadMs: load, ...r, note: 'Chromium headless tanpa GPU; browser biasa lebih cepat' };
}, undefined, SRV);

srv.kill();
await browser.close();
console.log(results.join('\n'));
console.log(fails ? `\n${fails} skenario bermasalah` : '\nSemua skenario lolos');
process.exit(fails ? 1 : 0);
