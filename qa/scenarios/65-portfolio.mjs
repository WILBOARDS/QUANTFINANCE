/* Portofolio + risiko (M1-M3). Mode server = server lokal + sumber palsu berformat asli.
   Harness otomatis menggagalkan skenario bila ada error JS, promise ditolak, console.error,
   atau loading macet. */
const S = { mode: 'server', loadingTimeout: 40000 };
const run = async (p, text) => {
  await p.click('#cmdInput');
  await p.fill('#cmdInput', text);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
};
const until = async (p, fn, arg, ms = 40000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await p.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await p.waitForTimeout(300);
  }
};
const add = async (p, sym, qty, avg, cur = '') => {
  await p.fill('#pfSym', sym); await p.fill('#pfQty', qty); await p.fill('#pfAvg', avg);
  await p.selectOption('#pfCur', cur);
  await p.click('#pfForm button[type="submit"]');
  await p.waitForTimeout(300);
};
const done = p => until(p, () => document.querySelectorAll('#pfBody tbody tr').length && !document.querySelector('#pfMeta .loading') && !document.querySelector('#pfRisk .loading') && document.getElementById('pfRisk').textContent.length > 20 ? document.querySelectorAll('#pfBody tbody tr').length : null);

export default async function (h) {
  await h.scenario('M1 PORT: tambah AAPL, BTC, EURUSD; nilai + L/R dengan asal-usul, alokasi, risiko dihitung atau "Data kurang"', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'PORT');
    if (!(await p.evaluate(() => !document.getElementById('page-portfolio').hidden))) throw new Error('Halaman portofolio tidak terbuka');
    await add(p, 'AAPL', '10', '150');
    await add(p, 'BTC', '0,5', '60000', 'USDT');
    await add(p, 'EURUSD', '1000', '1,05');
    const n = await done(p);
    if (n !== 3) throw new Error('Baris posisi bukan 3: ' + n);
    const meta = await p.textContent('#pfMeta');
    if (!/Total/.test(meta) || !/L\/R/.test(meta)) throw new Error('Ringkasan total tidak tampil: ' + meta);
    const valued = await p.evaluate(() => PortfolioPage.state.valued);
    const excl = await p.textContent('#pfExcluded');
    if (valued + (excl.match(/<li>|:/g) ? 0 : 0) < 2) throw new Error('Terlalu sedikit posisi yang dinilai: ' + valued + ' ' + excl);
    /* asal-usul nilai menyebut kurs */
    await p.click('#pfBody tbody tr:first-child td:nth-child(5) .lin'); await p.waitForTimeout(200);
    const lin = await p.textContent('#linPop'); await p.keyboard.press('Escape');
    if (!/kurs/.test(lin)) throw new Error('Asal-usul nilai tanpa kurs: ' + lin.slice(0, 160));
    const alloc = await p.$$eval('#pfAlloc .pf-bar', b => b.length);
    if (alloc < 4) throw new Error('Grafik alokasi kurang: ' + alloc);
    const risk = await p.textContent('#pfRisk');
    if (!/Volatilitas tahunan|Data kurang/.test(risk)) throw new Error('Bagian risiko tidak jelas: ' + risk.slice(0, 160));
    if (/Volatilitas tahunan/.test(risk) && !/Metodologi/.test(risk)) throw new Error('Metodologi risiko tidak ditulis');
    await h.shot(p, 'M1-portofolio');
    return { dinilai: valued, risiko: /Volatilitas/.test(risk) ? 'dihitung' : 'data kurang', alokasi: alloc };
  }, S);

  await h.scenario('M2 portofolio: muat ulang tetap tersimpan, ganti dasar IDR memakai kurs nyata, CSV ekspor, hapus', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(1500);
    await p.evaluate(() => localStorage.setItem('qt.portfolio', JSON.stringify({ items: [{ id: 'stock:AAPL', qty: 10, avg: 150, cur: null }, { id: 'fx:EURUSD', qty: 1000, avg: 1.05, cur: null }] })));
    await p.reload(); await p.waitForTimeout(2000);
    await h.go(p, 'portfolio');
    if ((await done(p)) !== 2) throw new Error('Posisi tersimpan tidak dimuat');
    await p.selectOption('#pfBase', 'IDR');
    await until(p, () => /IDR/.test(document.querySelector('#pfBody thead').textContent) && !document.querySelector('#pfMeta .loading'));
    await p.click('#pfBody tbody tr:first-child td:nth-child(5) .lin'); await p.waitForTimeout(200);
    const lin = await p.textContent('#linPop'); await p.keyboard.press('Escape');
    if (!/USD→IDR|USDIDR/.test(lin)) throw new Error('Konversi IDR tanpa kurs USDIDR: ' + lin.slice(0, 200));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#pfExport')]);
    if (dl.suggestedFilename() !== 'portofolio.csv') throw new Error('Nama CSV: ' + dl.suggestedFilename());
    await p.click('#pfBody tbody tr:first-child [data-pf-del]');
    await until(p, () => PortfolioPage.state.items === 1);
    await p.reload(); await p.waitForTimeout(1500);
    const left = await p.evaluate(() => JSON.parse(localStorage.getItem('qt.portfolio')).items.length);
    if (left !== 1) throw new Error('Hapus tidak tersimpan');
    return { ok: true };
  }, S);

  await h.scenario('M3 portofolio: impor CSV (pemisah ;, desimal koma), baris salah dilaporkan; HP tanpa scroll samping', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(1500);
    await h.go(p, 'portfolio');
    await p.setInputFiles('#pfImport', { name: 'pf.csv', mimeType: 'text/csv', buffer: Buffer.from('kode;jumlah;harga_rata;mata_uang\nMSFT;5;300,5;USD\nXYZNOPE;1;1;USD\n=CMD();1;1;USD\n') });
    const msg = await until(p, () => /diimpor/.test(document.getElementById('pfMsg').textContent) ? document.getElementById('pfMsg').textContent : null);
    if (!/1 posisi diimpor/.test(msg) || !/XYZNOPE/.test(msg) || !/kode tidak sah/.test(msg)) throw new Error('Pesan impor kurang: ' + msg);
    await done(p);
    await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) throw new Error('Portofolio HP: scroll horizontal ' + over + ' px');
    return { pesan: msg };
  }, S);
}
