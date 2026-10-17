/* Pengukuran kinerja: muat awal, inisialisasi, gambar awal tiap halaman, daftar besar, globe per frame.
   Ambang sengaja longgar (Chromium headless tanpa GPU di mesin bersama); tujuannya menangkap regresi besar,
   dan angkanya dicatat di hasil tes. */
const S = { mode: 'server' };
export default async function (h) {
  await h.scenario('P1 kinerja: muat, inisialisasi, gambar awal halaman, daftar besar', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    const start = await p.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const init = performance.getEntriesByName('qt:init')[0];
      return { dclMs: Math.round(nav.domContentLoadedEventEnd), initMs: init ? Math.round(init.duration) : null };
    });
    const pages = await p.$$eval('.side-nav [data-page]', b => b.map(x => x.dataset.page));
    for (const pg of pages) await h.go(p, pg);
    const per = await p.evaluate(() => Object.fromEntries(performance.getEntriesByType('measure').filter(e => e.name.startsWith('qt:halaman:')).map(e => [e.name.slice(11), Math.round(e.duration)])));
    /* daftar besar: watchlist 150 aset (render tabel sinkron) */
    await p.evaluate(() => {
      const ids = REG.all().filter(e => ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate'].includes(e.type)).slice(0, 150).map(e => e.id);
      localStorage.setItem('qt.watchlists', JSON.stringify({ lists: [{ id: 'w1', name: 'Besar', items: ids }], active: 'w1', n: 1 }));
    });
    await p.reload(); await p.waitForTimeout(2000);
    await h.go(p, 'watchlist');
    const big = await p.evaluate(() => ({ rows: document.querySelectorAll('#wlBody tbody tr').length, ms: Math.round(performance.getEntriesByName('qt:halaman:watchlist').pop().duration) }));
    await h.go(p, 'country');
    const ctry = await p.evaluate(() => ({ rows: document.querySelectorAll('#cTable tbody tr').length, ms: Math.round(performance.getEntriesByName('qt:halaman:country').pop().duration) }));
    await h.go(p, 'sources'); await p.waitForTimeout(800);
    const card = await p.$$eval('#perfBody tbody tr', r => r.length);
    if (!card) throw new Error('Kartu Kinerja di halaman Sumber data kosong');
    if (start.initMs === null || start.initMs > 2500) throw new Error('Inisialisasi terlalu lambat: ' + start.initMs + ' ms');
    const slow = Object.entries(per).filter(([, ms]) => ms > 1500);
    if (slow.length) throw new Error('Gambar awal halaman > 1500 ms: ' + JSON.stringify(slow));
    if (big.rows < 150) throw new Error('Watchlist besar tidak lengkap: ' + big.rows);
    /* aplikasi tetap terkendali sampai sini: tidak ada error, tidak ada loading macet (dicek harness) */
    return { ...start, halamanMs: per, watchlist150: big, negara: ctry };
  }, S);
}
