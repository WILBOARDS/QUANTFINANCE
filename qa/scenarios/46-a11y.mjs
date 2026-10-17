/* Aksesibilitas otomatis dengan axe-core (WCAG 2.x A + AA) di setiap halaman, header, dan bilah samping.
   Gagal bila ada pelanggaran berdampak "serious" atau "critical". axe hanya dimuat di tes, tidak ikut ke aplikasi.
   Catatan: alat otomatis hanya menangkap sebagian masalah; uji dengan keyboard & pembaca layar tetap perlu. */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function audit(p, selector) {
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ path: AXE });
  return p.evaluate(async sel => {
    const r = await window.axe.run(document.querySelector(sel), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, contoh: v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join('').slice(0, 120)) }));
  }, selector);
}

export default async function (h) {
  await h.scenario('X1 aksesibilitas (axe, WCAG A/AA) semua halaman', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    const out = {};
    const chrome = await audit(p, 'header.top');
    if (chrome.length) out.header = chrome;
    const side = await audit(p, '.side-nav');
    if (side.length) out.sidebar = side;
    const pages = await p.$$eval('main .page', els => els.map(e => e.id.replace('page-', '')));
    for (const pg of pages) {
      await p.evaluate(id => App.showPage(id), pg);
      await p.waitForTimeout(pg === 'country' || pg === 'macro' || pg === 'news' ? 4000 : 2000);
      const v = await audit(p, '#page-' + pg);
      if (v.length) out[pg] = v;
    }
    writeFileSync(new URL('../out/a11y.json', import.meta.url), JSON.stringify(out, null, 2));
    if (Object.keys(out).length) throw new Error('Pelanggaran aksesibilitas (rincian: qa/out/a11y.json): ' + Object.entries(out).map(([k, v]) => k + '=' + v.map(x => x.id + 'x' + x.n).join('+')).join('; '));
    return { halaman: pages.length };
  }, { mode: 'server', loadingTimeout: 25000, bypassCSP: true });
}
