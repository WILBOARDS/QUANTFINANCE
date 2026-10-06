/* Mode B: server lokal + sumber palsu; browser DILARANG ke internet langsung supaya jalur server teruji. */
const S = { mode: 'server' };
export default async function (h) {
  const { wait, shot } = h;
  await h.scenario('B1 server: saham AS live (Finnhub), indeks (Yahoo/FRED), kripto', async (p, { base }) => {
    await p.goto(base); await wait(6000);
    const r = await p.evaluate(() => ({ srv: document.getElementById('srvText').textContent, aapl: [BY.AAPL.quality, BY.AAPL.srcName], spx: [BY.SPX.quality, BY.SPX.srcName], bbca: [BY.BBCA.quality, BY.BBCA.srcName], btc: BY.BTC.quality }));
    if (r.aapl[0] !== 'live') throw new Error('AAPL tidak live: ' + JSON.stringify(r));
    await shot(p, 'B1-pasar-server');
    return r;
  }, S);
  await h.scenario('B2 server: intel 3D dengan kapal AIS bergerak', async (p, { base }) => {
    await p.goto(base + '#intel'); await wait(7000);
    const a = await p.evaluate(() => document.querySelector('#layerChips [data-l="ships"]').title);
    await shot(p, 'B2-intel');
    await p.click('#layerChips [data-l="news"]'); await wait(3000);
    await shot(p, 'B2-intel-berita');
    return { kapal: a };
  }, S);
  await h.scenario('B3 server: halaman kapal, lompat ke Hormuz, pilih kapal', async (p, { base }) => {
    await p.goto(base + '#ships'); await wait(6000);
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
  }, S);
  await h.scenario('B4 server: negara Indonesia + berita & spekulasi + perbandingan', async (p, { base }) => {
    await p.goto(base + '#country'); await wait(5000);
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
  }, S);
  await h.scenario('B5 server: terminal berita', async (p, { base }) => {
    await p.goto(base + '#news'); await wait(5000);
    const n = await p.$$eval('#newsTable tbody tr', r => r.length);
    if (n < 10) throw new Error('Berita terlalu sedikit: ' + n);
    await shot(p, 'B5-berita');
    return { judul: n };
  }, S);
  await h.scenario('B6 server: makro, rezim, korelasi, analog', async (p, { base }) => {
    await p.goto(base + '#macro'); await wait(12000);
    const reg = await p.textContent('#regimeBody');
    if (!/Risk|Netral|Transisi/.test(reg)) throw new Error('Rezim tidak dihitung');
    const na = await p.$$eval('#page-macro .na-box strong', e => e.map(x => x.textContent));
    const cmdtyNa = await p.$$eval('#cmdtyBody td.c-na', e => e.length);
    if (na.length) throw new Error('Panel makro tidak tersedia di mode server: ' + JSON.stringify(na));
    const cb = await p.$$eval('#cbBody tbody tr', e => e.length);
    await shot(p, 'B6-makro', { fullPage: true });
    return { bankSentral: cb, komoditasKosong: cmdtyNa };
  }, S);
  await h.scenario('B7 server: sumber data', async (p, { base }) => {
    await p.goto(base + '#sources'); await wait(4000);
    const t = await p.textContent('#srvBody');
    if (!/tersambung/i.test(t)) throw new Error('Halaman Sumber tidak mendeteksi server');
    await shot(p, 'B7-sumber', { fullPage: true });
  }, S);
  await h.scenario('B8 server: palet perintah Ctrl+K', async (p, { base }) => {
    await p.goto(base); await wait(2500);
    await p.keyboard.press('Control+k'); await wait(300);
    await p.keyboard.type('COMPARE ID US CN'); await wait(300);
    await shot(p, 'B8-palet');
    await p.keyboard.press('Enter'); await wait(2500);
    const tab = await p.$eval('#cDetail [aria-selected="true"]', e => e.textContent);
    if (!/Bandingkan/.test(tab)) throw new Error('COMPARE tidak membuka tab bandingkan');
    await p.keyboard.press('Control+k'); await p.keyboard.type('Jensen Huang'); await wait(1500);
    await shot(p, 'B8-palet-tokoh');
    await p.keyboard.press('Escape');
  }, S);
  await h.scenario('B9 server: AAPL fundamental + insider + kenapa bergerak', async (p, { base }) => {
    await p.goto(base); await wait(3000);
    await p.click('#rows li[data-sym="AAPL"] .row'); await wait(2500);
    await p.click('[data-at="why"]'); await wait(3000);
    await shot(p, 'B9-aapl-why', { clip: { x: 680, y: 490, width: 400, height: 380 } });
    await p.click('[data-at="fund"]'); await wait(1500);
    await shot(p, 'B9-aapl-fund', { clip: { x: 680, y: 490, width: 400, height: 380 } });
    await p.click('[data-at="insider"]'); await wait(1500);
    const t = await p.textContent('#assetTabBody');
    if (!/Menjual|Membeli|Campuran|Netral/.test(t)) throw new Error('Sinyal insider tidak tampil');
  }, S);
  await h.scenario('B10 HP 390 px tanpa scroll horizontal', async (p, { base }) => {
    const res = {};
    for (const pg of ['market', 'intel', 'country', 'news', 'ships', 'macro', 'sources']) {
      await p.goto(base + '#' + pg); await wait(1800);
      res[pg] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    }
    await shot(p, 'B10-hp');
    if (Object.values(res).some(v => v > 1)) throw new Error('Overflow horizontal: ' + JSON.stringify(res));
    return res;
  }, { ...S, vp: { width: 390, height: 844 } });
  await h.scenario('B11 laptop 1366x768 + tablet 768', async (p, { base }) => {
    await p.goto(base + '#intel'); await wait(3000);
    await shot(p, 'B11-laptop-intel');
    await p.setViewportSize({ width: 768, height: 1024 });
    const res = {};
    for (const pg of ['market', 'ships', 'country']) { await p.goto(base + '#' + pg); await wait(1500); res[pg] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); }
    await shot(p, 'B11-tablet');
    if (Object.values(res).some(v => v > 1)) throw new Error('Overflow horizontal tablet: ' + JSON.stringify(res));
  }, { ...S, vp: { width: 1366, height: 768 } });
  await h.scenario('B12 performa: muat halaman dan waktu gambar globe per frame', async (p, { base }) => {
    const t0 = Date.now();
    await p.goto(base); const load = Date.now() - t0;
    await p.goto(base + '#intel'); await wait(6000);
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
    return { loadMs: load, ...r, note: 'Chromium headless tanpa GPU' };
  }, S);
}
