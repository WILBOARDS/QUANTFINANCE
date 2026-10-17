/* Tes keamanan: ekspor CSV, server (URL rusak, Host, CORS, CSP, validasi parameter). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../shared/csv.mjs';

test('CSV: rumus dari pihak ketiga dinetralkan, angka tidak diubah', () => {
  assert.equal(csvCell('=HYPERLINK("https://evil.example","x")'), `"'=HYPERLINK(""https://evil.example"",""x"")"`);
  assert.equal(csvCell('+cmd|calc'), "'+cmd|calc");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('-5.25'), '-5.25');
  assert.equal(csvCell(-5.25), '-5.25');
  assert.equal(csvCell(NaN), '');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('baris\rbaru'), '"baris\rbaru"');
  assert.equal(toCsv([['a', 1], ['=x', -2]]), "a,1\r\n'=x,-2");
});

/* ---------- server: dijalankan sebagai proses terpisah, tanpa kunci dan tanpa sumber luar ---------- */
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function withServer(fn) {
  const port = await freePort();
  const cacheDir = mkdtempSync(join(tmpdir(), 'qt-sec-'));
  const p = spawn(process.execPath, [join(ROOT, 'server/server.mjs')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CACHE_DIR: cacheDir, AISSTREAM_API_KEY: '', FINNHUB_API_KEY: '', FRED_API_KEY: '', DIGITRAFFIC_ENABLED: '0', ENABLE_UNOFFICIAL_YAHOO: '0', ALLOW_FILE_ORIGIN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  p.stdout.on('data', d => { log += d; }); p.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 100 && !/jalan di/.test(log); i++) await new Promise(r => setTimeout(r, 50));
  try { return await fn({ base: `http://127.0.0.1:${port}`, port, proc: p, log: () => log }); }
  finally { p.kill(); rmSync(cacheDir, { recursive: true, force: true }); }
}
const raw = (port, text) => new Promise(res => {
  const c = connect(port, '127.0.0.1', () => c.write(text));
  let out = ''; c.on('data', d => { out += d; }); c.on('end', () => res(out)); c.on('error', () => res(out)); setTimeout(() => { c.destroy(); res(out); }, 1500);
});

test('server: permintaan rusak tidak menjatuhkan proses; Host, CORS, CSP, validasi', async () => {
  await withServer(async ({ base, port, proc }) => {
    /* 1. URL tidak valid -> 400, proses tetap hidup */
    const r1 = await raw(port, 'GET http://[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    assert.match(r1, /^HTTP\/1\.1 400/);
    assert.equal(proc.exitCode, null, 'server mati karena URL rusak');
    const h = await fetch(base + '/api/health').then(r => r.json());
    assert.equal(h.app, 'QuantTerminal');
    /* 2. Host asing (DNS rebinding) ditolak, localhost & IP diterima */
    const r2 = await raw(port, 'GET /api/health HTTP/1.1\r\nHost: rebind.attacker.example:' + port + '\r\nConnection: close\r\n\r\n');
    assert.match(r2, /^HTTP\/1\.1 421/);
    const r3 = await raw(port, 'GET /api/health HTTP/1.1\r\nHost: localhost:' + port + '\r\nConnection: close\r\n\r\n');
    assert.match(r3, /^HTTP\/1\.1 200/);
    /* 3. CORS: Origin null tidak diizinkan bawaan; localhost diizinkan */
    const cn = await fetch(base + '/api/health', { headers: { Origin: 'null' } });
    assert.equal(cn.headers.get('access-control-allow-origin'), null);
    const cl = await fetch(base + '/api/health', { headers: { Origin: 'http://localhost:5500' } });
    assert.equal(cl.headers.get('access-control-allow-origin'), 'http://localhost:5500');
    const ce = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(ce.headers.get('access-control-allow-origin'), null);
    /* 4. CSP: skrip lewat hash, tanpa unsafe-inline; tidak ada gambar dari https mana pun */
    if (existsSync(join(ROOT, 'dist/quant-terminal.html'))) {
      const page = await fetch(base + '/');
      const csp = page.headers.get('content-security-policy');
      const scriptSrc = csp.split(';').find(x => x.trim().startsWith('script-src'));
      assert.ok(!/unsafe-inline/.test(scriptSrc), scriptSrc);
      assert.match(scriptSrc, /'sha256-[A-Za-z0-9+/=]{40,}'/);
      assert.ok(!/img-src[^;]*https:/.test(csp));
      assert.equal(page.headers.get('x-frame-options'), 'DENY');
    }
    /* 5. validasi parameter: nilai di luar daftar ditolak sebelum menyentuh sumber luar */
    for (const [path, code] of [['/api/crypto/klines?symbol=BTCUSDT&interval=1d&limit=999', 400], ['/api/crypto/klines?symbol=<x>', 400], ['/api/finnhub?kind=profile&symbol=AAPL', 503], ['/api/nope', 404]]) {
      const r = await fetch(base + path);
      assert.equal(r.status, code, path);
      const j = await r.json();
      assert.equal(j.ok, false);
    }
    /* 6. kunci API tidak pernah muncul di /api/providers */
    const prov = await fetch(base + '/api/providers').then(r => r.text());
    assert.ok(!/token=|api_key=[^*]/.test(prov));
    assert.equal(proc.exitCode, null);
  });
});
