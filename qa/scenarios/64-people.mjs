/* Tokoh, perusahaan, dan tab Pasar negara (L1-L4). Mode server = server lokal + Wikidata palsu
   (qa/fakes/wikidata.mjs) yang SENGAJA memuat klaim data pribadi untuk membuktikan semuanya dibuang. */
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
const PRIVATE = /1963|17 Feb|Pasangan Pribadi|Jalan Pribadi|pribadi@example|UJI_Foto_Pribadi|laki-laki/;

export default async function (h) {
  await h.scenario('L1 PEOPLE Jensen Huang: fakta berasal-usul (item + properti Wikidata), tanpa data pribadi, tanpa gambar', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'PEOPLE Jensen Huang');
    if (!(await p.evaluate(() => !document.getElementById('page-people').hidden))) throw new Error('Halaman tokoh tidak terbuka');
    const t = await until(p, () => { const b = document.getElementById('pplBody'); return b && /pemberi kerja/.test(b.textContent) && !b.querySelector('.wd-wiki .loading') ? b.textContent : null; });
    if (!t) throw new Error('Profil tokoh tidak tampil');
    if (PRIVATE.test(t)) throw new Error('DATA PRIBADI BOCOR: ' + t.match(PRIVATE)[0]);
    const html = await p.innerHTML('#page-people');
    if (PRIVATE.test(html) || /<img/i.test(html)) throw new Error('Data pribadi/gambar ada di HTML');
    if (!/P108/.test(t) || !/Q305177/.test(t)) throw new Error('Nomor properti/item Wikidata tidak tampil');
    if (!/1993-04-05 – sekarang/.test(t)) throw new Error('Kualifier mulai/selesai tidak tampil');
    if (!/bisa tidak mutakhir/.test(t)) throw new Error('Peringatan "bisa tidak mutakhir" tidak ada');
    await p.click('#pplBody .wd-g .lin'); await p.waitForTimeout(200);
    const lin = await p.textContent('#linPop'); await p.keyboard.press('Escape');
    if (!/Wikidata Q305177 · P/.test(lin)) throw new Error('Asal-usul fakta tanpa item/properti: ' + lin.slice(0, 160));
    await h.shot(p, 'L1-tokoh');
    return { ok: true };
  }, S);

  await h.scenario('L2 NVDA PEOPLE: perusahaan dicocokkan lewat kode saham (P249), CEO dan pendiri dengan sumber', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'NVDA PEOPLE');
    const t = await until(p, () => { const b = document.getElementById('pplBody'); return b && /CEO/.test(b.textContent) ? b.textContent : null; });
    if (!t) throw new Error('Profil perusahaan tidak tampil');
    if (!/kode saham NVDA \(P249\)/.test(t)) throw new Error('Cara pencocokan tidak ditulis');
    if (!/Jensen Huang/.test(t) || !/P169/.test(t) || !/pendiri/.test(t)) throw new Error('CEO/pendiri tanpa sumber');
    if (PRIVATE.test(t)) throw new Error('Data pribadi bocor di profil perusahaan');
    return { ok: true };
  }, S);

  await h.scenario('L3 ID ECON tab Pasar: bursa, indeks/mata uang dengan kualitas, perusahaan katalog bisa diklik, riwayat makro, WGI', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'ID ECON');
    await until(p, () => /Indonesia/.test(document.getElementById('cDetail').textContent));
    await p.click('#cDetail [data-tab="market"]');
    const t = await until(p, () => { const b = document.getElementById('cMkt'); return b && !b.querySelector('.loading') && /IDX/.test(b.textContent) ? b.textContent : null; });
    if (!t) throw new Error('Tab Pasar tidak selesai');
    if (!/Bursa utama: IDX/.test(t)) throw new Error('Bursa utama tidak tampil');
    const q = await p.$$eval('#cmQuotes > div', d => d.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    if (q.length < 2) throw new Error('Indeks/mata uang/obligasi kurang: ' + q);
    const badges = await p.$$eval('#cmQuotes .qb', b => b.length);
    if (badges < q.length) throw new Error('Ada harga tanpa lencana kualitas');
    const cos = await p.$$eval('#cMkt .cx-cos [data-cm-open]', b => b.length);
    if (cos < 3) throw new Error('Perusahaan katalog kurang: ' + cos);
    const charts = await p.$$eval('#cMkt .cx-ch', c => c.length);
    if (charts !== 4) throw new Error('Grafik makro bukan 4');
    if (!/Worldwide Governance Indicators/.test(t)) throw new Error('Definisi WGI tidak ada');
    await h.shot(p, 'L3-negara-pasar');
    await p.click('#cMkt .cx-cos [data-cm-open]');
    const sec = await until(p, () => !document.getElementById('page-security').hidden);
    if (!sec) throw new Error('Klik perusahaan tidak membuka detail');
    return { harga: q.length, perusahaan: cos };
  }, S);

  await h.scenario('L4 cari tokoh lewat formulir + HP 390 px tanpa scroll samping', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2000);
    await p.setViewportSize({ width: 390, height: 800 });
    await h.go(p, 'people');
    await p.fill('#pplQ', 'nvidia');
    await p.click('#pplForm button[type="submit"]');
    const ok = await until(p, () => document.querySelectorAll('#pplList [data-qid]').length && /Nvidia/.test(document.getElementById('pplBody').textContent));
    if (!ok) throw new Error('Pencarian formulir tidak menampilkan hasil');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) throw new Error('Tokoh HP: scroll horizontal ' + over + ' px');
    return { ok: true };
  }, S);
}
