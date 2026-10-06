/* Alat bantu tes E2E: browser, mode jaringan, server uji, dan pemeriksaan otomatis.
   Setiap skenario OTOMATIS gagal bila:
   - ada exception yang tidak tertangkap (pageerror / window.onerror)
   - ada promise rejection yang tidak ditangani (unhandledrejection)
   - ada console.error selain kegagalan jaringan yang memang disengaja
   - ada indikator ".loading" yang masih terlihat setelah batas waktu (loading macet)
   Mode jaringan:
   - mock    : file HTML dibuka langsung; API dijawab sumber palsu berformat asli (qa/fake-upstream.mjs)
   - offline : semua permintaan ke luar ditolak
   - server  : server lokal + sumber palsu; browser DILARANG ke internet langsung */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { fakeUpstream } from './fake-upstream.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
export const OUT = here('./out/');
mkdirSync(OUT, { recursive: true });
export const FILE = pathToFileURL(here('../dist/quant-terminal.html')).href;
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const DESKTOP = { width: 1440, height: 900 };

/* tangkap error di dalam halaman sebelum kode aplikasi jalan */
const INIT = `(() => {
  window.__qtErr = [];
  addEventListener('error', e => { window.__qtErr.push('error: ' + (e.message || e.type) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')); });
  addEventListener('unhandledrejection', e => { const r = e.reason; window.__qtErr.push('unhandledrejection: ' + (r && (r.stack || r.message) || String(r)).slice(0, 300)); });
})();`;

async function freePort() {
  return new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}

export async function createHarness() {
  const { browser, info } = await launchBrowser();
  const results = [];
  let fails = 0, srv = null, srvBase = null, srvLog = '';

  async function startServer(extraEnv = {}) {
    if (srv) return srvBase;
    const port = await freePort();
    srv = spawn(process.execPath, ['--import', pathToFileURL(here('./server-preload.mjs')).href, here('../server/server.mjs')], {
      env: { ...process.env, CACHE_DIR: OUT + 'cache', PORT: String(port), HOST: '127.0.0.1', AISSTREAM_API_KEY: 'uji', FINNHUB_API_KEY: 'uji', FRED_API_KEY: '', ENABLE_UNOFFICIAL_YAHOO: '1', DIGITRAFFIC_ENABLED: '1', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
    for (let i = 0; i < 80 && !/jalan di/.test(srvLog); i++) await wait(100);
    if (!/jalan di/.test(srvLog)) throw new Error('Server uji tidak mau jalan:\n' + srvLog.slice(-800));
    srvBase = `http://127.0.0.1:${port}/`;
    return srvBase;
  }

  async function page(vp, mode) {
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'no-preference' });
    await ctx.addInitScript(INIT);
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push('PAGEERROR ' + String(e.stack || e).slice(0, 300)));
    p.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|ERR_BLOCKED_BY_CLIENT/.test(t)) return;   // kegagalan jaringan yang disengaja
      p.errs.push('console.error ' + t.slice(0, 240));
    });
    await ctx.route('**/*', async route => {
      const u = route.request().url();
      if (u.startsWith('file:') || u.startsWith('data:') || (srvBase && u.startsWith(srvBase.slice(0, -1)))) return route.continue();
      if (mode !== 'mock') return route.abort('internetdisconnected');
      const r = fakeUpstream(u);
      if (!r) return route.abort('blockedbyclient');
      return route.fulfill({ status: r.status, contentType: r.type, body: r.body, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    return p;
  }

  async function stuckLoading(p, ms) {
    const until = Date.now() + ms;
    let vis = [];
    while (Date.now() < until) {
      vis = await p.$$eval('.loading', els => els.filter(e => e.offsetParent !== null && e.getClientRects().length).map(e => (e.closest('[id]') || e).id || e.textContent.slice(0, 40))).catch(() => []);
      if (!vis.length) return [];
      await wait(500);
    }
    return vis;
  }

  /* opts: { vp, mode: 'mock'|'offline'|'server', loadingTimeout } */
  async function scenario(name, fn, opts = {}) {
    const mode = opts.mode || 'mock';
    if (mode === 'server') await startServer();
    const p = await page(opts.vp || DESKTOP, mode);
    const t0 = Date.now();
    try {
      const note = await fn(p, { base: mode === 'server' ? srvBase : FILE, mode });
      const stuck = await stuckLoading(p, opts.loadingTimeout ?? 20000);
      if (stuck.length) p.errs.push('LOADING MACET: ' + stuck.join(', '));
      const inPage = await p.evaluate(() => window.__qtErr || []).catch(() => []);
      for (const e of inPage) if (!p.errs.some(x => x.includes(e.slice(0, 60)))) p.errs.push('IN-PAGE ' + e);
      const ok = !p.errs.length;
      if (!ok) fails++;
      results.push(`${ok ? 'OK  ' : 'ERR '} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)${note ? ' -> ' + JSON.stringify(note) : ''}${p.errs.length ? '\n      ' + p.errs.join('\n      ') : ''}`);
    } catch (e) {
      fails++;
      results.push(`FAIL ${name}: ${String(e.message).split('\n')[0].slice(0, 260)}${p.errs.length ? '\n      ' + p.errs.join('\n      ') : ''}`);
      try { await p.screenshot({ path: OUT + 'fail-' + name.replace(/\W+/g, '_') + '.png' }); } catch { /* abaikan */ }
    }
    await p.context().close();
  }

  const shot = (p, n, o = {}) => p.screenshot({ path: OUT + n + '.png', ...o });
  /* navigasi lewat UI (bukan langsung URL) supaya tombol navigasinya ikut teruji */
  const go = async (p, pageId) => {
    const sel = `[data-page="${pageId}"]`;
    const btn = await p.$(`.nav ${sel}, .side-nav ${sel}`);
    if (!btn) throw new Error('Tombol navigasi tidak ada: ' + pageId);
    await btn.click(); await wait(300);
    const vis = await p.evaluate(id => { const el = document.getElementById('page-' + id); return !!el && !el.hidden; }, pageId);
    if (!vis) throw new Error('Halaman tidak terbuka setelah klik navigasi: ' + pageId);
  };

  async function close() {
    if (srv) srv.kill();
    await browser.close();
  }
  return { scenario, shot, go, wait, FILE, close, results, get fails() { return fails; }, browserInfo: info, startServer, get serverBase() { return srvBase; } };
}
