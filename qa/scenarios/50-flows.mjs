/* 15 alur wajib (E1-E15). Setiap skenario otomatis gagal bila ada exception tak tertangkap,
   promise rejection, console.error, atau indikator loading yang macet (lihat qa/harness.mjs).
   Mode server = server lokal + sumber palsu berformat asli (judul [UJI]); offline = semua sumber gagal. */
const S = { mode: 'server' };
const run = async (p, text) => {
  await p.click('#cmdInput');
  await p.fill('#cmdInput', text);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
};
const visible = (p, id) => p.evaluate(x => { const el = document.getElementById(x); return !!el && !el.hidden && el.getClientRects().length > 0; }, id);
const until = async (p, fn, arg, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await p.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await p.waitForTimeout(250);
  }
};

export default async function (h) {
  await h.scenario('E1 buka aplikasi: header, bilah perintah, bilah samping, status', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => ({
      cmd: !!document.getElementById('cmdInput'), side: document.querySelectorAll('.side-nav [data-page]').length,
      srv: document.getElementById('srvText').textContent, mkt: document.getElementById('mktText').textContent, clock: document.getElementById('clock').textContent.length > 5,
    }));
    if (!r.cmd || r.side < 8 || !/tersambung/i.test(r.srv) || !/Bursa buka/.test(r.mkt) || !r.clock) throw new Error('Header/bilah samping tidak lengkap: ' + JSON.stringify(r));
    await h.shot(p, 'E1-buka');
    return r;
  }, S);

  await h.scenario('E2 pindah halaman lewat bilah samping (semua halaman)', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(1500);
    const pages = await p.$$eval('.side-nav [data-page]', b => b.map(x => x.dataset.page));
    for (const pg of pages) await h.go(p, pg);
    await h.go(p, 'market');
    return { halaman: pages.length };
  }, S);

  await h.scenario('E3 cari aset: saran autocomplete per jenis', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(1500);
    await p.click('#cmdInput'); await p.fill('#cmdInput', 'nvid'); await p.waitForTimeout(400);
    const a = await p.$$eval('#cmdDrop .cmdk-item .code', e => e.map(x => x.textContent));
    if (!a.includes('NVDA')) throw new Error('NVDA tidak muncul untuk "nvid": ' + a);
    await p.fill('#cmdInput', 'AAPL '); await p.waitForTimeout(300);
    const v = await p.$$eval('#cmdDrop .cmdk-item .code', e => e.map(x => x.textContent));
    if (!v.includes('AAPL GP') || !v.includes('AAPL FA')) throw new Error('Verb untuk AAPL tidak muncul: ' + v);
    await p.fill('#cmdInput', 'eurusd'); await p.waitForTimeout(300);
    const f = await p.$$eval('#cmdDrop .cmdk-group', e => e.map(x => x.textContent));
    await h.shot(p, 'E3-cari');
    await p.keyboard.press('Escape');
    return { nvid: a.slice(0, 3), grupEurusd: f };
  }, S);

  await h.scenario('E4 buka kuotasi AAPL Q: harga + metadata data', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'AAPL Q');
    if (!(await visible(p, 'page-security'))) throw new Error('Halaman detail aset tidak terbuka');
    const q = await until(p, () => { const s = SecurityPage.state; return s.quote ? s.quote : null; });
    if (!q || !['live', 'delayed'].includes(q.quality) || !(q.value > 0)) throw new Error('Kuotasi AAPL tidak valid: ' + JSON.stringify(q));
    const meta = await p.textContent('#secQuote');
    for (const k of ['Sumber', 'Waktu data', 'Diambil', 'Kualitas']) if (!meta.includes(k)) throw new Error('Metadata hilang: ' + k);
    await p.click('#secQuote .lin'); await p.waitForTimeout(200);
    const lin = await p.textContent('#linPop');
    if (!/Asal-usul data/.test(lin) || !/Finnhub/.test(lin)) throw new Error('Popover asal-usul tidak lengkap');
    await p.keyboard.press('Escape');
    await h.shot(p, 'E4-kuotasi');
    return q;
  }, S);

  await h.scenario('E5 buka grafik BTC GP + E6 ganti timeframe dan jenis grafik', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    const st = await until(p, () => (SecurityPage.chart && SecurityPage.chart.state.bars > 0 ? SecurityPage.chart.state : null));
    if (!st) throw new Error('Grafik BTC tidak punya bar');
    const out = { awal: st };
    for (const tf of ['1M', '5D', 'YTD', '1D']) {
      await p.click(`.pc-tf [data-tf="${tf}"]`);
      const s2 = await until(p, t => { const c = SecurityPage.chart; return c && c.state.tf === t && c.state.bars > 0 ? c.state : null; }, tf);
      if (!s2) throw new Error('Timeframe ' + tf + ' tidak memuat bar');
      out[tf] = s2.bars;
    }
    await p.click('.pc-type [data-type="line"]'); await p.waitForTimeout(300);
    await p.click('.pc-reset');
    await h.shot(p, 'E5-grafik');
    return out;
  }, S);

  await h.scenario('E7 fundamental AAPL FA (Finnhub lewat server)', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'AAPL FA');
    const ok = await until(p, () => { const b = document.getElementById('secBody'); return b && b.querySelectorAll('.lin').length > 3 ? b.querySelectorAll('.lin').length : null; });
    if (!ok) throw new Error('Angka fundamental tidak tampil');
    const tab = await p.$eval('#secTabs [aria-selected="true"]', e => e.textContent);
    if (!/Fundamental/.test(tab)) throw new Error('Tab aktif bukan Fundamental: ' + tab);
    await h.shot(p, 'E7-fundamental');
    return { angka: ok };
  }, S);

  await h.scenario('E8 berita NVDA NEWS', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'NVDA NEWS');
    const n = await until(p, () => { const b = document.getElementById('secBody'); return b && b.querySelectorAll('.list .item-title').length || null; }, null, 20000);
    if (!n) throw new Error('Berita NVDA kosong');
    const txt = await p.textContent('#secBody');
    if (!/analisis otomatis/i.test(txt)) throw new Error('Label "analisis otomatis" tidak ada');
    return { judul: n };
  }, S);

  await h.scenario('E9 negara ID ECON dan US ECON', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'ID ECON');
    if (!(await visible(p, 'page-country'))) throw new Error('Halaman negara tidak terbuka');
    const ok = await until(p, () => /Indonesia/.test(document.getElementById('cDetail').textContent));
    if (!ok) throw new Error('Detail Indonesia tidak tampil');
    await run(p, 'US ECON');
    const us = await until(p, () => /Amerika Serikat|United States/.test(document.getElementById('cDetail').textContent));
    if (!us) throw new Error('Detail AS tidak tampil');
    return { ok: true };
  }, S);

  await h.scenario('E10 bilah perintah: HELP, COMPARE, perintah salah, riwayat', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'HELP');
    const open = await p.evaluate(() => !!document.querySelector('#helpDlg[open]'));
    if (!open) throw new Error('HELP tidak membuka dialog');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await run(p, 'AAPL COMPARE MSFT NVDA');
    const rows = await until(p, () => document.querySelectorAll('#cmpTable tbody tr').length || null);
    if (rows !== 3) throw new Error('Tabel bandingkan tidak 3 baris: ' + rows);
    await until(p, () => !document.querySelector('#cmpChart .loading'));
    await run(p, 'BTC FA');
    const err = await p.textContent('#cmdDrop');
    if (!/tidak berlaku/.test(err)) throw new Error('Perintah salah tidak memberi pesan: ' + err);
    await p.keyboard.press('Escape');
    await p.click('#cmdInput'); await p.keyboard.press('ArrowUp');
    const hist = await p.inputValue('#cmdInput');
    await p.keyboard.press('Escape');
    await run(p, 'HOME');
    if (!(await visible(p, 'page-market'))) throw new Error('HOME tidak kembali ke Pasar');
    await h.shot(p, 'E10-perintah');
    return { riwayatTerakhir: hist };
  }, S);

  await h.scenario('E11 watchlist: buat, ganti nama, tambah, urutkan, hapus, WATCH', async (p, { base }) => {
    await p.goto(base + '#watchlist'); await p.waitForTimeout(2000);
    await p.click('#wlNew'); await p.fill('#wlName', 'Teknologi'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    let tabs = await p.$$eval('#wlTabs [data-wl]', e => e.map(x => x.textContent));
    if (!tabs.some(t => /Teknologi/.test(t))) throw new Error('Daftar baru tidak muncul: ' + tabs);
    for (const sym of ['AMD', 'EURUSD', 'GOLD']) { await p.fill('#wlAdd', sym); await p.click('#wlAddBtn'); await p.waitForTimeout(250); }
    let syms = await p.$$eval('#wlBody tbody tr [data-open]', e => e.map(x => x.textContent));
    if (syms.join() !== 'AMD,EURUSD,GOLD') throw new Error('Isi daftar salah: ' + syms);
    await p.click('#wlBody tbody tr:nth-child(3) [data-mv="-1"]'); await p.waitForTimeout(200);
    syms = await p.$$eval('#wlBody tbody tr [data-open]', e => e.map(x => x.textContent));
    if (syms.join() !== 'AMD,GOLD,EURUSD') throw new Error('Urutan tidak berubah: ' + syms);
    await p.click('#wlRename'); await p.fill('#wlName', 'Tek & valas'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    await run(p, 'WATCH NVDA');
    await h.go(p, 'watchlist');
    syms = await p.$$eval('#wlBody tbody tr [data-open]', e => e.map(x => x.textContent));
    if (!syms.includes('NVDA')) throw new Error('WATCH NVDA tidak menambah: ' + syms);
    await until(p, () => !document.querySelector('#wlBody .loading'), null, 20000);
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('qt.watchlists')));
    await h.shot(p, 'E11-watchlist');
    await p.click('#wlDel'); await p.click('#wlDel'); await p.waitForTimeout(200);
    tabs = await p.$$eval('#wlTabs [data-wl]', e => e.map(x => x.textContent));
    if (tabs.some(t => /Tek/.test(t))) throw new Error('Daftar tidak terhapus');
    return { tersimpan: stored.lists.map(l => l.name + ':' + l.items.length) };
  }, S);

  await h.scenario('E12 alert: lewat perintah dan form, jeda, hapus', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'ALERT AAPL > 1');
    const msg = await p.textContent('#cmdDrop');
    if (!/Alert dibuat/.test(msg)) throw new Error('ALERT tidak dibuat: ' + msg);
    await h.go(p, 'alerts');
    await p.fill('#alSym', 'BTC'); await p.selectOption('#alField', 'chg'); await p.selectOption('#alOp', '<'); await p.fill('#alVal', '-50');
    await p.click('#alForm button[type="submit"]'); await p.waitForTimeout(400);
    const rows = await p.$$eval('#alBody tbody tr', e => e.map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 60)));
    if (rows.length < 2) throw new Error('Alert tidak tampil: ' + rows);
    const trig = await until(p, () => Alerts.list().find(a => a.symbol === 'AAPL' && a.triggeredAt), null, 15000);
    if (!trig) throw new Error('ALERT AAPL > 1 tidak terpicu padahal harga nyata > 1');
    await p.click('#alBody tbody tr:last-child [data-toggle]').catch(() => {});
    await p.click('#alBody tbody tr:first-child [data-del]');
    await h.shot(p, 'E12-alert');
    return { baris: rows.length, terpicu: { nilai: trig.triggeredValue, sumber: trig.triggeredSource } };
  }, S);

  await h.scenario('E13 pengaturan: buka, ubah, tes server, tutup', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2000);
    await p.click('#btnSettings'); await p.waitForTimeout(200);
    if (!(await p.evaluate(() => document.getElementById('settings').open))) throw new Error('Dialog pengaturan tidak terbuka');
    await p.click('#setLive'); await p.waitForTimeout(300); await p.click('#setLive');
    await p.fill('#setServer', base.replace(/\/$/, '')); await p.click('#setServerTest'); await p.waitForTimeout(1500);
    const out = await p.textContent('#setServerOut');
    if (!/Tersambung/.test(out)) throw new Error('Tes server gagal: ' + out);
    await p.keyboard.press('Escape');
    return { tes: out.slice(0, 60) };
  }, S);

  await h.scenario('E14 offline: penyedia tidak tersedia ditampilkan jujur, tidak macet', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'AAPL Q');
    await until(p, () => SecurityPage.state.quote, null, 15000);
    const q = await p.evaluate(() => SecurityPage.state.quote);
    if (q.value !== null || q.quality !== 'unavailable') throw new Error('Offline tapi harga ada: ' + JSON.stringify(q));
    const t = await p.textContent('#secQuote');
    if (!/Tidak tersedia/.test(t)) throw new Error('Tidak ada label "Tidak tersedia"');
    await p.click('#secTabs [data-st="chart"]');
    const na = await until(p, () => { const el = document.querySelector('.pc-na'); return el && !el.hidden ? el.textContent : null; });
    if (!na) throw new Error('Grafik offline tidak menampilkan alasan');
    await h.go(p, 'watchlist');
    await until(p, () => !document.querySelector('#wlBody .loading'), null, 20000);
    const nums = await p.$$eval('#wlBody tbody td.num', e => e.map(x => x.textContent.trim()));
    if (nums.some(n => /\d/.test(n))) throw new Error('Offline tapi watchlist menampilkan angka: ' + nums);
    await h.shot(p, 'E14-offline');
    return { alasanGrafik: na.slice(0, 80) };
  }, { mode: 'offline', loadingTimeout: 25000 });

  await h.scenario('E15 mode demo: label simulasi jelas, mati = tanpa simulasi', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(1500);
    await p.evaluate(() => localStorage.setItem('qt.demo', 'true'));
    await p.reload(); await p.waitForTimeout(3000);
    const on = await p.evaluate(() => ({ banner: !document.getElementById('demoBanner').hidden, sim: document.querySelectorAll('.q-sim, .tag-sim').length }));
    if (!on.banner || !on.sim) throw new Error('Mode demo tanpa label: ' + JSON.stringify(on));
    /* kuotasi terpadu TIDAK pernah memakai simulasi, walau mode demo aktif */
    await run(p, 'AAPL Q');
    const q = await until(p, () => SecurityPage.state.quote, null, 15000);
    if (q.quality === 'sim') throw new Error('Halaman detail aset memakai harga simulasi');
    await h.go(p, 'market');
    await p.click('#demoOff'); await p.waitForTimeout(3000);
    const off = await p.evaluate(() => ({ demo: State.demo, sim: [...document.querySelectorAll('.q-sim, .tag-sim')].filter(e => e.getClientRects().length).length }));
    if (off.demo || off.sim) throw new Error('Mode demo mati tapi masih ada simulasi: ' + JSON.stringify(off));
    return { on, off };
  }, { mode: 'mock' });

  await h.scenario('E16 HP 390 px: halaman baru tanpa scroll horizontal', async (p, { base }) => {
    const res = {};
    for (const pg of ['security', 'watchlist', 'alerts', 'market']) { await p.goto(base + '#' + pg); await p.waitForTimeout(1500); res[pg] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); }
    await h.shot(p, 'E16-hp-watchlist');
    if (Object.values(res).some(v => v > 1)) throw new Error('Overflow horizontal: ' + JSON.stringify(res));
    return res;
  }, { ...S, vp: { width: 390, height: 844 } });
}
