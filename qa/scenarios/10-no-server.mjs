/* Mode A: file HTML dibuka langsung (tanpa server), API dijawab sumber palsu berformat asli. */
export default async function (h) {
  const { wait, shot } = h;
  await h.scenario('A1 pasar tanpa server: kripto live, saham n/a', async (p, { base }) => {
    await p.goto(base); await wait(2500);
    const r = await p.evaluate(() => ({ btc: BY.BTC.quality, btcPrice: BY.BTC.price, aapl: BY.AAPL.quality, aaplPrice: BY.AAPL.price, mode: document.getElementById('modeText').textContent, srv: document.getElementById('srvText').textContent }));
    if (r.btc !== 'live' || !(r.btcPrice > 0)) throw new Error('BTC tidak live: ' + JSON.stringify(r));
    if (r.aapl !== 'unavailable' || Number.isFinite(r.aaplPrice)) throw new Error('AAPL seharusnya tidak tersedia (tanpa demo): ' + JSON.stringify(r));
    await shot(p, 'A1-pasar');
    return r;
  });
  await h.scenario('A2 grafik BTC dari klines + order book', async (p, { base }) => {
    await p.goto(base); await wait(1500);
    await p.click('#rows li[data-sym="BTC"] .row'); await wait(1500);
    const na = await p.evaluate(() => document.getElementById('chartNa').hidden);
    if (!na) throw new Error('Grafik BTC menampilkan "tidak tersedia"');
    await p.click('[data-at="book"]'); await wait(1200);
    const txt = await p.textContent('#assetTabBody');
    if (!/Spread/.test(txt)) throw new Error('Order book tidak tampil');
    await shot(p, 'A2-btc');
  });
  await h.scenario('A3 globe 3D di halaman pasar', async (p, { base }) => {
    await p.goto(base); await wait(1000);
    await p.click('.map-card .seg [data-view="globe"]'); await wait(1500);
    await shot(p, 'A3-market-globe', { clip: { x: 0, y: 90, width: 1080, height: 400 } });
  });
  await h.scenario('A4 negara tanpa server (World Bank/IMF langsung)', async (p, { base }) => {
    await p.goto(base + '#country'); await wait(3500);
    const n = await p.$$eval('#cTable tbody tr', r => r.length);
    if (n < 150) throw new Error('Baris negara terlalu sedikit: ' + n);
    await shot(p, 'A4-negara');
    return { negara: n };
  });
  await h.scenario('A5 intel 3D tanpa server: bencana USGS, kapal Baltik langsung', async (p, { base }) => {
    await p.goto(base + '#intel'); await wait(5000);
    const s = await p.evaluate(() => ({ hz: document.querySelectorAll('#intelFeed .feed-row').length, ships: document.querySelector('#layerChips [data-l="ships"]').title }));
    await shot(p, 'A5-intel');
    return s;
  });
}
