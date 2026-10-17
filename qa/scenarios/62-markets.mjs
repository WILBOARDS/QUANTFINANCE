/* Berita + suku bunga/valas/komoditas + makro (J1-J6). Mode server = server lokal + sumber palsu
   berformat asli (judul [UJI]). Harness otomatis menggagalkan skenario bila ada error JS, promise
   ditolak, console.error, atau loading macet. */
const S = { mode: 'server', loadingTimeout: 30000 };
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
const noBadText = async (p, id, where) => {
  const bad = await p.evaluate(x => (document.getElementById(x).innerText.match(/.{0,30}(\bNaN\b|\bundefined\b|\[object Object\]|Infinity).{0,30}/g) || []).slice(0, 3), id);
  if (bad.length) throw new Error(where + ': teks rusak ' + JSON.stringify(bad));
};
/* tabel halaman pasar selesai: semua baris punya nilai atau alasan, tidak ada "memuat" */
const listDone = (p, pre) => until(p, x => { const rows = document.querySelectorAll('#' + x + 'Body tbody tr'); return rows.length && !document.querySelector('#' + x + 'Body .loading') ? rows.length : null; }, pre, 40000);
async function checkList(p, h, cmd, page, pre, minRows) {
  await run(p, cmd);
  const vis = await p.evaluate(x => !document.getElementById('page-' + x).hidden, page);
  if (!vis) throw new Error(cmd + ': halaman ' + page + ' tidak terbuka');
  const n = await listDone(p, pre);
  if (!n || n < minRows) throw new Error(cmd + ': baris kurang (' + n + ')');
  const info = await p.evaluate(x => {
    const rows = [...document.querySelectorAll('#' + x + 'Body tbody tr')];
    return {
      badges: rows.filter(r => r.querySelector('.qb')).length,
      values: rows.filter(r => r.querySelector('td.num .lin')).length,
      na: rows.filter(r => /Tidak tersedia/.test(r.children[1].textContent)).map(r => r.querySelector('th').textContent.trim().slice(0, 30)),
      live: rows.filter(r => r.querySelector('.q-live')).length,
    };
  }, pre);
  if (info.badges !== n) throw new Error(cmd + ': ada baris tanpa lencana kualitas');
  if (!info.values) throw new Error(cmd + ': tidak ada nilai yang bisa diklik');
  const chart = await until(p, () => { const c = document.querySelector('.mk-page:not([hidden]) .pc-foot'); return c && /bar|tidak tersedia/i.test(c.textContent) ? c.textContent.slice(0, 80) : null; });
  if (!chart) throw new Error(cmd + ': grafik baris terpilih tidak selesai');
  await noBadText(p, 'page-' + page, cmd);
  await h.shot(p, 'J-' + page);
  return { ...info, rows: n };
}

export default async function (h) {
  await h.scenario('J1 RATES: Treasury, spread, OECD 10Y, kurva, suku bunga kebijakan BIS, perubahan dalam bp', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    const r = await checkList(p, h, 'RATES', 'rates', 'mkRates', 10);
    if (r.live) throw new Error('Seri FRED ditandai Live');
    const curve = await until(p, () => document.querySelector('#mkRatesExtra .mk-curve svg circle') ? document.querySelectorAll('#mkRatesExtra .mk-curve svg circle').length : null);
    if (!curve || curve < 3) throw new Error('Kurva Treasury tidak tergambar');
    const cb = await until(p, () => { const t = document.querySelector('#mkRatesExtra .mk-cb'); return t && !t.querySelector('.loading') ? t.textContent : null; });
    if (!/Bank Indonesia|Federal Reserve/.test(cb || '')) throw new Error('Tabel bank sentral tidak tampil');
    const bp = await p.textContent('#mkRatesBody tbody');
    if (!/ bp/.test(bp)) throw new Error('Perubahan tidak dalam basis poin');
    /* klik baris lain -> grafik pindah */
    await p.click('#mkRatesBody tr[data-id="rate:US2Y"] th [data-mk-pick]');
    const t = await until(p, () => /US2Y/.test(document.getElementById('mkRatesChartTitle').textContent));
    if (!t) throw new Error('Grafik tidak pindah ke US2Y');
    return r;
  }, S);

  await h.scenario('J2 FX: kurs referensi harian (bukan Live), CSV, klik Detail buka halaman aset', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    const r = await checkList(p, h, 'FX', 'fx', 'mkFx', 10);
    if (r.live) throw new Error('Kurs referensi harian ditandai Live: ' + r.live);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#page-fx [data-mk-csv]')]);
    if (dl.suggestedFilename() !== 'fx.csv') throw new Error('Nama CSV: ' + dl.suggestedFilename());
    await p.click('#mkFxBody tr[data-id="fx:USDIDR"] [data-mk-open-row]');
    const sec = await until(p, () => !document.getElementById('page-security').hidden && /USDIDR/.test(document.getElementById('page-security').textContent));
    if (!sec) throw new Error('Detail USDIDR tidak terbuka');
    return r;
  }, S);

  await h.scenario('J3 CMDTY: semua komoditas dengan lencana kualitas; yang tanpa sumber ditulis Tidak tersedia + alasan', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    const r = await checkList(p, h, 'CMDTY', 'cmdty', 'mkCmdty', 12);
    /* baris "Tidak tersedia" harus punya alasan di kolom sumber */
    const noReason = await p.evaluate(() => [...document.querySelectorAll('#mkCmdtyBody tbody tr')].filter(r => /Tidak tersedia/.test(r.children[1].textContent) && !r.querySelector('.mk-src').textContent.trim()).length);
    if (noReason) throw new Error(noReason + ' baris tidak tersedia tanpa alasan');
    return r;
  }, S);

  await h.scenario('J4 N RUPIAH: kueri GDELT baru (bukan saringan lokal), mode kueri tampil, kembali ke kategori', async (p, { base }) => {
    const urls = [];
    p.on('request', rq => { if (/\/api\/gdelt\/doc|api\.gdeltproject\.org/.test(rq.url())) urls.push(decodeURIComponent(rq.url().replace(/\+/g, ' '))); });
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'N RUPIAH');
    const vis = await p.evaluate(() => !document.getElementById('page-news').hidden);
    if (!vis) throw new Error('Halaman berita tidak terbuka');
    const ok = await until(p, () => document.querySelectorAll('#newsTable tbody tr[data-url]').length || null);
    if (!ok) throw new Error('Hasil kueri kosong');
    if (!urls.some(u => /query=RUPIAH/i.test(u))) throw new Error('Permintaan GDELT tidak memuat kueri rupiah: ' + urls.slice(-2).join(' | '));
    const mode = await p.textContent('#newsMode');
    if (!/Kueri GDELT: RUPIAH/i.test(mode)) throw new Error('Mode kueri tidak ditulis: ' + mode);
    if (await p.inputValue('#newsQ')) throw new Error('Kueri dimasukkan ke saringan lokal');
    await p.click('#newsGqClear');
    await until(p, () => !document.getElementById('newsMode').textContent && document.querySelectorAll('#newsTable tbody tr[data-url]').length);
    /* kueri dari kotak pencarian GDELT */
    await p.fill('#newsGq', 'bank indonesia');
    await p.click('#newsGqForm button[type="submit"]');
    await until(p, () => /bank indonesia/i.test(document.getElementById('newsMode').textContent) && document.querySelectorAll('#newsTable tbody tr[data-url]').length);
    if (!urls.some(u => /"bank indonesia"/i.test(u))) throw new Error('Kueri frasa tidak dikirim dalam tanda kutip');
    return { judul: ok, permintaan: urls.length };
  }, S);

  await h.scenario('J5 berita: Breaking/Terbaru/Paling relevan, saringan tema/negara/domain/spekulatif, penggabungan judul serupa', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await h.go(p, 'news');
    await until(p, () => document.querySelectorAll('#newsTable tbody tr[data-url]').length);
    const st = await p.evaluate(() => NewsPage.state);
    if (!(st.raw >= st.unique)) throw new Error('Jumlah judul tidak masuk akal: ' + JSON.stringify(st));
    await p.click('#newsView [data-view="impact"]');
    const imp = await p.$$eval('#newsTable tbody tr[data-url] td:last-child', t => t.map(x => +x.textContent));
    if (imp.some((v, i) => i && v > imp[i - 1])) throw new Error('Paling relevan tidak urut skor: ' + imp.slice(0, 6));
    await p.click('#newsView [data-view="time"]');
    await p.click('#newsView [data-view="breaking"]');
    const br = await p.evaluate(() => NewsPage.state.shown);
    const brTxt = await p.textContent('#newsTable tbody');
    if (!br && !/2 jam terakhir/.test(brTxt)) throw new Error('Breaking kosong tanpa penjelasan');
    await p.click('#newsView [data-view="time"]');
    const all = await p.evaluate(() => NewsPage.state.shown);
    const opt = await p.$$eval('#newsFTheme option', o => o.map(x => x.value).filter(Boolean));
    if (!opt.length) throw new Error('Pilihan tema kosong');
    await p.selectOption('#newsFTheme', opt[0]);
    const th = await p.evaluate(() => NewsPage.state.shown);
    if (!(th <= all && th > 0)) throw new Error('Saringan tema tidak bekerja: ' + th + ' dari ' + all);
    await p.selectOption('#newsFTheme', '');
    const cty = await p.$$eval('#newsFCountry option', o => o.map(x => x.value).filter(Boolean));
    if (cty.length) { await p.selectOption('#newsFCountry', cty[0]); const c = await p.$$eval('#newsTable tbody tr[data-url] td:nth-child(4)', t => [...new Set(t.map(x => x.textContent))]); if (c.length !== 1) throw new Error('Saringan negara bocor: ' + c); await p.selectOption('#newsFCountry', ''); }
    await p.check('#newsFSpec');
    const sp = await p.$$eval('#newsTable tbody tr[data-url]', r => r.every(x => x.querySelector('.tpill.spec')));
    if (!sp) throw new Error('Saringan spekulatif bocor');
    await p.uncheck('#newsFSpec');
    const head = await p.textContent('#newsTable thead');
    if (!/Tema/.test(head) || !(await p.$('#newsTable thead .q-inference'))) throw new Error('Label Analisis otomatis hilang dari kepala tabel');
    const foot = await p.textContent('#newsSrc');
    if (!/judul unik/.test(foot) || !/Analisis otomatis/.test(foot)) throw new Error('Baris sumber tidak menyebut penggabungan/analisis otomatis: ' + foot);
    const dup = await p.$$eval('#newsTable .tpill.dup', d => d.length);
    if (dup) {
      await p.click('#newsTable tbody tr:has(.tpill.dup) td.wrap');
      const side = await p.textContent('#newsSide');
      if (!/Judul serupa dari sumber lain/.test(side)) throw new Error('Panel samping tidak menampilkan sumber lain');
    }
    await noBadText(p, 'page-news', 'Berita');
    await h.shot(p, 'J5-berita');
    return { ...st, gabung: dup, tema: th, breaking: br };
  }, S);

  await h.scenario('J6 Makro: survei Fed regional berlabel pengganti PMI, breadth Belum tersedia, model Eksperimental; HP tanpa scroll samping', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await h.go(p, 'macro');
    const t = await until(p, () => { const b = document.getElementById('surveyBody'); return b && !b.querySelector('.loading') && b.textContent.length > 50 ? b.textContent : null; });
    if (!t) throw new Error('Kartu survei tidak selesai');
    if (!/BUKAN PMI/.test(t) || !/Belum tersedia/.test(t)) throw new Error('Label pengganti PMI / breadth tidak jujur');
    const flags = await p.$$eval('#page-macro .flag', f => f.map(x => x.textContent));
    if (flags.filter(x => /Eksperimental/.test(x)).length < 2) throw new Error('Model rezim/analog tidak berlabel Eksperimental: ' + flags);
    await p.setViewportSize({ width: 390, height: 800 });
    for (const pg of ['rates', 'fx', 'cmdty', 'news']) {
      await h.go(p, pg); await p.waitForTimeout(600);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) throw new Error(pg + ' HP: scroll horizontal ' + over + ' px');
    }
    return { ok: true };
  }, S);
}
