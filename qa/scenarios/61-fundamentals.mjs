/* Fundamental SEC EDGAR + Screener (H1-H6). Mode server = server lokal + SEC palsu berformat asli
   (qa/fakes/sec.mjs, nama perusahaan [UJI], angka dari generator berbenih, BUKAN laporan asli).
   Harness otomatis menggagalkan skenario bila ada error JS, promise ditolak, console.error,
   atau loading macet. */
const S = { mode: 'server', loadingTimeout: 30000 };
const run = async (p, text) => {
  await p.click('#cmdInput');
  await p.fill('#cmdInput', text);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
};
const until = async (p, fn, arg, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await p.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await p.waitForTimeout(250);
  }
};
const linText = async (p, sel) => {
  await p.click(sel); await p.waitForTimeout(200);
  const t = await p.textContent('#linPop');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  return t;
};
const noBadText = async (p, id, where) => {
  const bad = await p.evaluate(x => (document.getElementById(x).innerText.match(/.{0,30}(\bNaN\b|\bundefined\b|\[object Object\]|Infinity).{0,30}/g) || []).slice(0, 3), id);
  if (bad.length) throw new Error(where + ': teks rusak ' + JSON.stringify(bad));
};
const faReady = p => until(p, () => { const b = document.querySelector('#secBody .fa-body'); return b && !b.querySelector('.loading') && b.querySelectorAll('.lin').length > 2 ? b.querySelectorAll('.lin').length : null; });
const sub = async (p, k) => { await p.click(`#secBody [data-fa-sub="${k}"][role="tab"]`); await p.waitForTimeout(300); return faReady(p); };

export default async function (h) {
  await h.scenario('H1 AAPL FA: laporan SEC dengan asal-usul (konsep XBRL, accession, tanggal lapor) + CSV', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'AAPL FA');
    if (!(await faReady(p))) throw new Error('Fundamental AAPL tidak tampil');
    await sub(p, 'sum');
    const head = await p.textContent('#secBody .fa-head');
    if (!/CIK/.test(head) || !/0000320193/.test(head)) throw new Error('Kepala FA tanpa CIK: ' + head.slice(0, 120));
    const sumTxt = await linText(p, '#secBody .fa-body .kv .lin');
    if (!/SEC EDGAR companyfacts/.test(sumTxt) || !/accession/i.test(sumTxt) || !/filed|dilaporkan/i.test(sumTxt)) throw new Error('Asal-usul angka FA kurang: ' + sumTxt.slice(0, 200));
    const tabs = await p.$$eval('#secBody [data-fa-sub][role="tab"]', b => b.map(x => x.textContent));
    if (tabs.length !== 12) throw new Error('Sub-tab FA bukan 12: ' + tabs.join(','));
    const n = await sub(p, 'is');
    const cols = await p.$$eval('#secBody .fa-tbl thead th', t => t.length);
    if (cols < 3) throw new Error('Laba rugi: kolom tahun kurang (' + cols + ')');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#secBody [data-fa-csv="is"]')]);
    if (!/aapl-is-sec\.csv/i.test(dl.suggestedFilename())) throw new Error('Nama CSV aneh: ' + dl.suggestedFilename());
    for (const k of ['bs', 'cf', 'ratio', 'growth', 'val', 'earn', 'div', 'own', 'ins']) {
      await p.click(`#secBody [data-fa-sub="${k}"][role="tab"]`);
      const ok = await until(p, () => { const b = document.querySelector('#secBody .fa-body'); return b && !b.querySelector('.loading') && b.textContent.trim().length > 40; });
      if (!ok) throw new Error('Sub-tab ' + k + ' kosong/macet');
    }
    await p.click('#secBody [data-fa-sub="own"][role="tab"]'); await p.waitForTimeout(300);
    if (!/Belum tersedia/.test(await p.textContent('#secBody .fa-body'))) throw new Error('Kepemilikan 13F tidak menulis "Belum tersedia"');
    await noBadText(p, 'secBody', 'FA');
    await h.shot(p, 'H1-fa');
    return { angkaLabaRugi: n, kolom: cols, csv: dl.suggestedFilename() };
  }, S);

  await h.scenario('H2 Kualitas: Piotroski 9 kriteria, "Lihat perhitungan", "Data kurang" tanpa normalisasi, Altman', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'AAPL FA');
    await faReady(p);
    await sub(p, 'quality');
    const ok = await until(p, () => document.querySelectorAll('#secBody .fa-pio tbody tr:not(.fa-calc)').length || null);
    if (ok !== 9) throw new Error('Kriteria Piotroski bukan 9: ' + ok);
    const score = await p.textContent('#secBody .fa-score');
    /* AAPL palsu tidak melaporkan utang jangka panjang FY lalu -> kriteria leverage "Data kurang" */
    if (!/dari 8 kriteria/.test(score) || !/Data kurang/.test(score) || !/TIDAK dinormalisasi/.test(score)) throw new Error('Skor Piotroski tidak jujur soal data kurang: ' + score);
    const dk = await p.$$eval('#secBody .fa-pio .tpill.fa-dk', x => x.length);
    if (dk !== 1) throw new Error('Jumlah kriteria "Data kurang" bukan 1: ' + dk);
    const btn = '#secBody .fa-pio [data-fa-calc]';
    const id = await p.$eval(btn, b => b.dataset.faCalc);
    await p.click(btn); await p.waitForTimeout(150);
    const open = await p.evaluate(x => { const r = document.getElementById('faCalc-' + x); return r && !r.hidden ? r.textContent : null; }, id);
    if (!open || !/Rumus/.test(open) || !/Sumber: SEC EDGAR/.test(open)) throw new Error('Lihat perhitungan tidak membuka rumus/sumber: ' + open);
    const exp = await p.$eval(btn, b => b.getAttribute('aria-expanded'));
    if (exp !== 'true') throw new Error('aria-expanded tidak berubah');
    await p.click('#secBody [data-fa-calc-all]'); await p.waitForTimeout(150);
    const allOpen = await p.$$eval('#secBody tr.fa-calc', r => r.every(x => !x.hidden));
    if (!allOpen) throw new Error('Buka semua perhitungan tidak membuka semuanya');
    const dkRow = await p.$$eval('#secBody .fa-pio tr.fa-calc', r => r.map(x => x.textContent).find(t => /Data kurang/.test(t)) || '');
    if (!/Data kurang/.test(dkRow)) throw new Error('Baris perhitungan tanpa keterangan Data kurang');
    const alt = await p.textContent('#secBody .fa-body');
    if (!/Altman Z''/.test(alt) || !/Ambang/.test(alt)) throw new Error('Altman tidak tampil dengan ambang');
    /* tahun fiskal lain */
    const yrs = await p.$$eval('#faFy option', o => o.map(x => x.value));
    if (yrs.length > 1) { await p.selectOption('#faFy', yrs[1]); await until(p, y => document.querySelector('.fa-score') && document.querySelector('#faFy').value === y, yrs[1]); }
    await noBadText(p, 'secBody', 'Kualitas');
    await h.shot(p, 'H2-kualitas');
    return { skor: score.trim(), tahun: yrs.length };
  }, S);

  await h.scenario('H3 JPM (bank, SIC 6xxx): Altman ditandai tidak berlaku', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'JPM FA');
    await faReady(p);
    await sub(p, 'quality');
    const ok = await until(p, () => /Altman/.test((document.querySelector('#secBody .fa-body') || {}).textContent || '') && !document.querySelector('#secBody .fa-body .loading'));
    if (!ok) throw new Error('Kualitas JPM tidak tampil');
    const t = await p.textContent('#secBody .fa-body');
    if (!/tidak berlaku|bank|keuangan/i.test(t)) throw new Error('Altman untuk bank tidak diberi catatan');
    return { ok: true };
  }, S);

  await h.scenario('H4 saham non-AS (BBCA FA): penjelasan fundamental resmi gratis hanya untuk pelapor SEC', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BBCA FA');
    const t = await until(p, () => { const b = document.getElementById('secBody'); return b && !b.querySelector('.loading') && /SEC/.test(b.textContent) ? b.textContent : null; });
    if (!t || !/pelapor SEC/.test(t)) throw new Error('BBCA FA tanpa penjelasan: ' + (t || '').slice(0, 160));
    return { ok: true };
  }, S);

  await h.scenario('H5 SCREEN GROWTH: tabel hasil screening, urut, filter, klik baris buka FA', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'SCREEN GROWTH');
    const vis = await p.evaluate(() => !document.getElementById('page-screener').hidden);
    if (!vis) throw new Error('Halaman screener tidak terbuka');
    const n = await until(p, () => document.querySelectorAll('#scrBody tbody tr').length || (/Tidak ada pelapor/.test(document.getElementById('scrBody').textContent) ? -1 : null), null, 30000);
    if (!n || n < 1) throw new Error('Tabel hasil screening kosong: ' + n);
    const sum = await p.textContent('#scrSum');
    if (!/Hasil screening Growth/.test(sum) || !/dari \d+ pelapor/.test(sum)) throw new Error('Ringkasan tidak lengkap: ' + sum);
    if (/rekomendasi/i.test(sum) && !/bukan rekomendasi/i.test(sum)) throw new Error('Kata rekomendasi muncul');
    const meta = await p.textContent('#scrMeta');
    if (!/CY\d{4}/.test(meta)) throw new Error('Periode frame tidak tampil: ' + meta);
    /* semua baris lolos filter: pertumbuhan > 15% */
    const g = await p.evaluate(() => [...document.querySelectorAll('#scrBody tbody tr')].map(tr => tr.children[8].textContent));
    if (g.some(x => !(parseFloat(x.replace(/,/g, '')) > 15))) throw new Error('Ada baris yang tidak lolos filter Growth: ' + g.slice(0, 5));
    const lin = await linText(p, '#scrBody tbody tr:first-child [data-scr="revGrowth"]');
    if (!/SEC EDGAR frames/.test(lin) || !/Pendapatan tahun ini/.test(lin)) throw new Error('Asal-usul sel screener kurang: ' + lin.slice(0, 160));
    await p.click('#scrBody th [data-sort="ticker"]'); await p.waitForTimeout(200);
    const tk = await p.$$eval('#scrBody tbody tr td:first-child b', b => b.map(x => x.textContent));
    if (tk.join() !== [...tk].sort((a, b) => a.localeCompare(b)).join()) throw new Error('Urut kode tidak benar');
    /* ganti preset + filter manual */
    await p.click('#scrPresets [data-preset="QUALITY"]');
    await until(p, () => /Hasil screening Quality/.test(document.getElementById('scrSum').textContent));
    await p.click('#scrFbox summary');
    await p.fill('#scrFilters input[data-f="roe"][data-b="min"]', '20');
    await p.click('#scrApply'); await p.waitForTimeout(200);
    const f = await p.textContent('#scrSum');
    if (!/ROE > 20/.test(f)) throw new Error('Filter manual tidak dipakai: ' + f);
    await p.click('#scrPresets [data-preset="GROWTH"]');
    await until(p, () => document.querySelectorAll('#scrBody tbody tr').length > 0 && /Growth/.test(document.getElementById('scrSum').textContent));
    await p.click('#scrBody tbody tr:first-child td:first-child');
    const sec = await until(p, () => !document.getElementById('page-security').hidden && document.querySelector('#secTabs [aria-selected="true"]') ? document.querySelector('#secTabs [aria-selected="true"]').textContent : null);
    if (!/Fundamental/.test(sec || '')) throw new Error('Klik baris tidak membuka tab Fundamental: ' + sec);
    await faReady(p);
    await noBadText(p, 'page-screener', 'Screener');
    await h.shot(p, 'H5-screener');
    return { baris: n };
  }, S);

  await h.scenario('H6 SCREEN VALUE + MOMENTUM: hanya aset yang punya harga, cakupan ditulis; HP 390 px tanpa scroll samping', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'SCREEN VALUE');
    const v = await until(p, () => /P\/E dihitung untuk \d+ dari \d+/.test(document.getElementById('scrSum').textContent) ? document.getElementById('scrSum').textContent : null, null, 40000);
    if (!v) throw new Error('Cakupan P/E tidak ditulis');
    await run(p, 'SCREEN MOMENTUM');
    const m = await until(p, () => /Momentum dihitung untuk \d+ dari \d+/.test(document.getElementById('scrSum').textContent) ? document.getElementById('scrSum').textContent : null, null, 40000);
    if (!m) throw new Error('Cakupan momentum tidak ditulis');
    await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) throw new Error('Screener HP: scroll horizontal ' + over + ' px');
    await run(p, 'AAPL FA');
    await faReady(p);
    const over2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over2 > 1) throw new Error('FA HP: scroll horizontal ' + over2 + ' px');
    await h.shot(p, 'H6-hp');
    return { value: v.match(/P\/E dihitung untuk \d+ dari \d+/)[0], momentum: m.match(/Momentum dihitung untuk \d+ dari \d+/)[0] };
  }, S);
}
