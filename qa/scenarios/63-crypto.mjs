/* Kripto tambahan + heatmap (K1-K5). Mode server = server lokal + sumber palsu berformat asli
   (qa/fakes/crypto-x.mjs; angka berbenih, bukan data pasar asli). Harness otomatis menggagalkan
   skenario bila ada error JS, promise ditolak, console.error, atau loading macet. */
const S = { mode: 'server', loadingTimeout: 120000 };
const run = async (p, text) => {
  await p.click('#cmdInput');
  await p.fill('#cmdInput', text);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
};
const until = async (p, fn, arg, ms = 25000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await p.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await p.waitForTimeout(250);
  }
};
const tab = async (p, id) => { await p.click(`#secTabs [data-st="${id}"]`); return until(p, () => { const b = document.getElementById('secBody'); return b && !b.querySelector('.loading') && b.textContent.trim().length > 30 ? b.textContent : null; }); };
const noBad = async (p, where) => {
  const bad = await p.evaluate(() => (document.querySelector('main').innerText.match(/.{0,30}(\bNaN\b|\bundefined\b|\[object Object\]|Infinity).{0,30}/g) || []).slice(0, 3));
  if (bad.length) throw new Error(where + ': teks rusak ' + JSON.stringify(bad));
};

export default async function (h) {
  await h.scenario('K1 BTC Transaksi: data bursa berlabel, transaksi besar dengan ambang yang bisa diubah, tanpa klaim whale', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    const t = await tab(p, 'trades');
    if (!t || !/data bursa Binance spot/.test(t)) throw new Error('Label data bursa tidak ada: ' + (t || '').slice(0, 120));
    if (/whale|smart money/i.test(t.replace(/Bukan sinyal "whale" atau "smart money"/, ''))) throw new Error('Klaim whale/smart money muncul');
    const big1 = await p.$$eval('#secBody table', ts => (ts[0] && ts[0].querySelectorAll('tbody tr').length) || 0);
    await p.fill('#cxThr', '1000');
    await p.click('[data-cx-thr] button[type="submit"]'); await p.waitForTimeout(200);
    const big2 = await p.$$eval('#secBody table', ts => ts[0].querySelectorAll('tbody tr').length);
    if (!(big2 >= big1 && big2 > 0)) throw new Error('Ambang lebih kecil tidak menambah transaksi besar: ' + big1 + ' -> ' + big2);
    const thr = await p.evaluate(() => JSON.parse(localStorage.getItem('qt.cxThr:BTCUSDT')));
    if (thr !== 1000) throw new Error('Ambang tidak disimpan: ' + thr);
    await p.click('[data-cx-thr-reset]'); await p.waitForTimeout(200);
    if (+(await p.inputValue('#cxThr')) !== 250000) throw new Error('Ambang bawaan BTC bukan 250000');
    await p.click('#secBody .cx-cards .lin'); await p.waitForTimeout(200);
    const lin = await p.textContent('#linPop');
    await p.keyboard.press('Escape');
    if (!/m=false/.test(lin)) throw new Error('Asal-usul porsi taker beli tanpa rumus: ' + lin.slice(0, 120));
    /* ganti tab lalu kembali: pendengar lama tidak boleh menulis ke tab lain */
    await tab(p, 'overview');
    await noBad(p, 'Transaksi');
    await h.shot(p, 'K1-transaksi');
    return { besarBawaan: big1, besarAmbang1000: big2 };
  }, S);

  await h.scenario('K2 BTC Derivatif: funding, funding disetahunkan (Kalkulasi), open interest + perubahan, label derivatif', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    const t = await tab(p, 'derivs');
    if (!/data bursa derivatif Binance/.test(t)) throw new Error('Label derivatif tidak ada');
    const vals = await p.$$eval('#secBody .kv dd', d => d.map(x => x.textContent.trim()));
    if (vals.filter(v => v && v !== '–').length < 5) throw new Error('Nilai derivatif kurang: ' + vals);
    if (!(await p.$('#secBody .cx-spark path'))) throw new Error('Grafik open interest tidak ada');
    const calc = await p.$$eval('#secBody .kv .q-calculated', x => x.length);
    if (calc < 3) throw new Error('Metrik turunan tidak berlabel Kalkulasi');
    await noBad(p, 'Derivatif');
    await h.shot(p, 'K2-derivatif');
    return { nilai: vals.length };
  }, S);

  await h.scenario('K3 On-chain: BTC dari mempool.space; SOL "Belum tersedia" dengan alasan', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    const t = await tab(p, 'onchain');
    if (!/data on-chain Bitcoin \(mempool\.space\)/.test(t)) throw new Error('Label on-chain tidak ada');
    const blocks = await p.$$eval('#secBody table tbody tr', r => r.length);
    if (blocks < 5) throw new Error('Blok terbaru kurang: ' + blocks);
    await run(p, 'SOL GP');
    const s = await tab(p, 'onchain');
    if (!/Belum tersedia/.test(s) || !/Bitcoin/.test(s)) throw new Error('SOL on-chain tanpa alasan: ' + s.slice(0, 120));
    return { blok: blocks };
  }, S);

  await h.scenario('K4 HEAT CRYPTO: treemap ukuran = kapitalisasi pasar, warna = perubahan, klik buka detail', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'HEAT CRYPTO');
    const n = await until(p, () => HeatmapPage.state.ok && document.querySelectorAll('#hmMap .hm-t').length);
    if (!n) throw new Error('Treemap kripto kosong');
    /* luas kotak sebanding kapitalisasi: kotak terbesar = koin dengan kapitalisasi terbesar */
    const areas = await p.$$eval('#hmMap .hm-t', g => g.map(x => { const r = x.querySelector('rect'); return { a: +r.getAttribute('width') * +r.getAttribute('height'), l: x.getAttribute('aria-label') }; }));
    const first = areas.reduce((m, x) => (x.a > m.a ? x : m), areas[0]);
    if (!/^BTC /.test(first.l)) throw new Error('Kotak terbesar bukan BTC: ' + first.l);
    const leg = await p.textContent('#hmLegend');
    if (!/Perubahan/.test(leg)) throw new Error('Legenda warna tidak ada');
    await p.click('#hmMap .hm-t', { modifiers: ['Shift'] }); await p.waitForTimeout(200);
    const lin = await p.textContent('#linPop');
    await p.keyboard.press('Escape');
    if (!/CoinGecko/.test(lin)) throw new Error('Asal-usul kotak tanpa sumber: ' + lin.slice(0, 100));
    await p.click('#hmMap .hm-t');
    const sec = await until(p, () => !document.getElementById('page-security').hidden);
    if (!sec) throw new Error('Klik kotak tidak membuka detail');
    return { kotak: n };
  }, S);

  await h.scenario('K5 HEAT US + INDONESIA: kotak dari kapitalisasi Finnhub; saham tanpa kapitalisasi didaftar terpisah; HP tanpa scroll samping', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'HEAT US');
    const us = await until(p, () => HeatmapPage.state.ok && HeatmapPage.state.region === 'US' ? HeatmapPage.state : null, null, 120000);
    if (!us || !(us.tiles > 0 || us.rest > 0)) throw new Error('HEAT US kosong: ' + JSON.stringify(us));
    await run(p, 'HEAT INDONESIA');
    const id = await until(p, () => HeatmapPage.state.ok && HeatmapPage.state.region === 'INDONESIA' ? HeatmapPage.state : null, null, 60000);
    if (!id || id.tiles !== 0 || id.rest < 1) throw new Error('Indonesia harus tanpa ukuran karangan: ' + JSON.stringify(id));
    const why = await p.textContent('#hmRest');
    if (!/Finnhub gratis hanya memberi profil saham AS/.test(why)) throw new Error('Alasan tanpa kapitalisasi tidak ditulis');
    await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(500);
    await run(p, 'HEAT CRYPTO');
    await until(p, () => document.querySelectorAll('#hmMap .hm-t').length);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) throw new Error('Heatmap HP: scroll horizontal ' + over + ' px');
    await noBad(p, 'Heatmap');
    await h.shot(p, 'K5-heatmap-hp');
    return { us, id };
  }, S);
}
