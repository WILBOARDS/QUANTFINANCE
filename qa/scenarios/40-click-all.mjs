/* Audit "klik semua tombol": buka setiap halaman lewat navigasi, lalu klik setiap kontrol yang
   terlihat (tombol, tab, chip, baris tabel pertama, select). Setelah setiap klik dicek:
   - tidak ada error JS (otomatis lewat harness)
   - dialog yang terbuka bisa ditutup
   Setelah setiap halaman dicek:
   - tidak ada teks NaN / undefined / [object Object] yang tampil
   - tidak ada lencana "Simulasi" selama Demo Mode mati
   Tautan keluar (target=_blank) tidak diklik; tautan itu hanya dicek memakai rel=noopener. */
/* semua halaman yang ada di DOM (halaman baru otomatis ikut diaudit) */
const pagesOf = p => p.$$eval('main .page', els => els.map(e => e.id.replace('page-', '')));
const MAX_CLICKS = 130;

/* kunci stabil sebuah kontrol supaya tidak diklik dua kali walau DOM digambar ulang */
const COLLECT = (root) => {
  const sel = 'button, [role="tab"], [role="button"], select, tbody tr[data-iso], tbody tr[data-i], tbody tr[data-mmsi], tbody tr[data-sym], li[data-sym] .row, tbody tr[data-url], tbody tr[data-choke]';
  const out = [];
  const seenRow = new Map();
  for (const el of document.querySelectorAll(`#page-${root} ${sel.split(', ').join(`, #page-${root} `)}`)) {
    if (el.disabled || !el.getClientRects().length || el.closest('[hidden]')) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || st.pointerEvents === 'none') continue;
    const isRow = el.tagName === 'TR' || el.classList.contains('row');
    const tb = isRow ? el.closest('tbody, ul, ol') : null;
    if (tb) { const n = seenRow.get(tb) || 0; if (n >= 2) continue; seenRow.set(tb, n + 1); }
    const data = [...el.attributes].filter(a => a.name.startsWith('data-') || a.name === 'id' || a.name === 'aria-label').map(a => a.name + '=' + a.value).join(',');
    const key = el.tagName + '|' + data + '|' + (isRow ? '' : el.textContent.trim().slice(0, 30));
    el.setAttribute('data-qa-key', key);
    out.push(key);
  }
  return out;
};

async function closeOverlays(p) {
  for (let i = 0; i < 3; i++) {
    const open = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.id)).catch(() => []);
    if (!open.length) return;
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  }
}

/* halaman tanpa tombol di bilah samping (detail aset) dibuka lewat App.showPage */
const open = async (p, h, page) => { if (await p.$(`.side-nav [data-page="${page}"]`)) return h.go(p, page); await p.evaluate(id => App.showPage(id), page); await p.waitForTimeout(300); };
async function auditPage(p, h, page) {
  await open(p, h, page);
  await p.waitForTimeout(2500);
  const clicked = new Set(), failed = [];
  for (let n = 0; n < MAX_CLICKS; n++) {
    const keys = await p.evaluate(COLLECT, page);
    const next = keys.find(k => !clicked.has(k));
    if (!next) break;
    clicked.add(next);
    const el = await p.$(`[data-qa-key="${next.replace(/["\\]/g, '\\$&')}"]`);
    if (!el) continue;
    try {
      const tag = await el.evaluate(e => e.tagName);
      if (tag === 'SELECT') {
        const vals = await el.evaluate(s => [...s.options].map(o => o.value));
        for (const v of vals.slice(0, 4)) { await el.selectOption(v); await p.waitForTimeout(250); }
      } else {
        await el.click({ timeout: 2500 });
        await p.waitForTimeout(300);
      }
    } catch (e) {
      failed.push(next.slice(0, 80) + ': ' + String(e.message).split('\n')[0].slice(0, 100));
    }
    await closeOverlays(p);
    /* klik bisa memindahkan halaman (mis. "buka di negara"); kembali supaya audit lanjut */
    const still = await p.evaluate(id => !document.getElementById('page-' + id).hidden, page);
    if (!still) { await open(p, h, page); await p.waitForTimeout(800); }
  }
  await p.waitForTimeout(1200);
  const bad = await p.evaluate(id => {
    const root = document.getElementById('page-' + id);
    const txt = root.innerText;
    const m = txt.match(/.{0,30}(\bNaN\b|\bundefined\b|\[object Object\]|Infinity).{0,30}/g) || [];
    const sim = State.demo ? 0 : [...document.querySelectorAll('.q-sim')].filter(e => e.getClientRects().length).length;
    const unsafeLinks = [...root.querySelectorAll('a[target="_blank"]')].filter(a => !/noopener/.test(a.rel)).map(a => a.href.slice(0, 60));
    return { teksRusak: m.slice(0, 5), lencanaSimulasi: sim, tautanTanpaNoopener: unsafeLinks.slice(0, 5) };
  }, page);
  return { page, klik: clicked.size, gagal: failed, ...bad };
}

async function run(p, h) {
  const res = [];
  for (const pg of await pagesOf(p)) res.push(await auditPage(p, h, pg));
  const problems = res.filter(r => r.gagal.length || r.teksRusak.length || r.lencanaSimulasi || r.tautanTanpaNoopener.length);
  if (problems.length) throw new Error('Masalah UI: ' + JSON.stringify(problems));
  return Object.fromEntries(res.map(r => [r.page, r.klik]));
}

export default async function (h) {
  await h.scenario('D1 klik semua tombol, tanpa server (sumber palsu)', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    return run(p, h);
  }, { mode: 'mock', loadingTimeout: 25000 });
  await h.scenario('D2 klik semua tombol, offline (semua sumber gagal)', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2000);
    return run(p, h);
  }, { mode: 'offline', loadingTimeout: 25000 });
  await h.scenario('D3 klik semua tombol, server lokal', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(3000);
    return run(p, h);
  }, { mode: 'server', loadingTimeout: 25000 });
  await h.scenario('D4 header: pengaturan, palet, chip server', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2000);
    for (const id of ['btnSettings', 'btnCmd', 'srvChip']) {
      await p.click('#' + id); await p.waitForTimeout(500);
      await closeOverlays(p);
    }
    /* klik di luar dialog / Escape harus menutup; dialog tidak boleh tertinggal terbuka */
    const open = await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.id));
    if (open.length) throw new Error('Dialog tidak tertutup: ' + open);
  }, { mode: 'mock' });
}
