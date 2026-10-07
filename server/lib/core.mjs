/* Utilitas server: .env, cache bertingkat (memori + disk), fetch ke sumber dengan
   batas waktu, antrean per penyedia (rate limit), dan catatan status penyedia. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/* ---------- .env sederhana (tanpa library) ---------- */
export function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/* ---------- status penyedia: dipakai halaman "Sumber data" ---------- */
export class Registry {
  constructor() { this.p = new Map(); }
  define(id, meta) {
    this.p.set(id, {
      id, ...meta, status: meta.configured === false ? 'unconfigured' : 'idle',
      requests: 0, errors: 0, cacheHits: 0, lastOk: null, lastError: null, lastErrorMsg: null,
      latencyMs: null, day: today(), dayRequests: 0, backoffUntil: 0,
    });
    return this.get(id);
  }
  get(id) { return this.p.get(id); }
  ok(id, ms) {
    const s = this.p.get(id); if (!s) return;
    rollDay(s); s.requests++; s.dayRequests++; s.lastOk = new Date().toISOString(); s.latencyMs = ms; s.status = 'ok';
  }
  fail(id, err, ms) {
    const s = this.p.get(id); if (!s) return;
    rollDay(s); s.requests++; s.dayRequests++; s.errors++; s.lastError = new Date().toISOString();
    s.lastErrorMsg = String(err && err.message || err).slice(0, 200); s.latencyMs = ms ?? s.latencyMs;
    s.status = s.lastOk && Date.now() - Date.parse(s.lastOk) < 3600e3 ? 'degraded' : 'down';
  }
  hit(id) { const s = this.p.get(id); if (s) s.cacheHits++; }
  list() { return [...this.p.values()].map(s => ({ ...s, backoffUntil: s.backoffUntil ? new Date(s.backoffUntil).toISOString() : null })); }
}
const today = () => new Date().toISOString().slice(0, 10);
function rollDay(s) { const d = today(); if (s.day !== d) { s.day = d; s.dayRequests = 0; } }

/* ---------- cache: memori + disk (supaya restart server tidak membuang kuota API) ---------- */
export class Cache {
  /* maxFiles: batas jumlah file di disk. Tanpa batas, variasi parameter bisa memenuhi disk. */
  constructor(dir, { maxFiles = 3000, maxAgeMs = 8 * 86400e3 } = {}) {
    this.mem = new Map(); this.inflight = new Map(); this.dir = dir;
    this.maxFiles = maxFiles; this.maxAgeMs = maxAgeMs; this.writes = 0;
    try { mkdirSync(dir, { recursive: true }); } catch { /* abaikan */ }
    this.prune();
  }
  /* hapus file yang lebih tua dari maxAgeMs, lalu yang tertua bila jumlahnya melewati maxFiles */
  prune() {
    try {
      const now = Date.now();
      const files = readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => { const p = join(this.dir, f); try { return { p, m: statSync(p).mtimeMs }; } catch { return null; } }).filter(Boolean);
      const old = files.filter(f => now - f.m > this.maxAgeMs);
      for (const f of old) { try { unlinkSync(f.p); } catch { /* abaikan */ } }
      const rest = files.filter(f => now - f.m <= this.maxAgeMs).sort((a, b) => a.m - b.m);
      for (const f of rest.slice(0, Math.max(0, rest.length - this.maxFiles))) { try { unlinkSync(f.p); } catch { /* abaikan */ } }
    } catch { /* folder belum ada */ }
  }
  file(key) { return join(this.dir, createHash('sha1').update(key).digest('hex') + '.json'); }
  peek(key) {
    let e = this.mem.get(key);
    if (!e) {
      try { e = JSON.parse(readFileSync(this.file(key), 'utf8')); this.mem.set(key, e); } catch { e = null; }
    }
    return e;
  }
  set(key, value, ttlMs) {
    const e = { t: Date.now(), ttl: ttlMs, value };
    this.mem.set(key, e);
    if (this.mem.size > 2000) this.mem.delete(this.mem.keys().next().value);
    if (ttlMs >= 5 * 60e3) {
      try { writeFileSync(this.file(key), JSON.stringify(e)); } catch { /* abaikan */ }
      if (++this.writes % 200 === 0) this.prune();
    }
    return e;
  }
  /* ambil dari cache bila masih segar; kalau tidak, jalankan fn(). Bila fn gagal dan ada
     salinan lama (maks maxStaleMs), kembalikan salinan lama DENGAN tanda stale. */
  /* noStale: jangan kembalikan salinan lama saat gagal (dipakai rantai multi-host supaya
     cermin/cadangan dicoba dulu sebelum menyerah ke salinan lama) */
  async wrap(key, ttlMs, fn, { maxStaleMs = 7 * 86400e3, onHit, noStale = false } = {}) {
    const e = this.peek(key);
    if (e && Date.now() - e.t < e.ttl) { onHit && onHit(); return { value: e.value, cached: true, stale: false, t: e.t }; }
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        const ne = this.set(key, value, ttlMs);
        return { value, cached: false, stale: false, t: ne.t };
      } catch (err) {
        if (!noStale && e && Date.now() - e.t < maxStaleMs) return { value: e.value, cached: true, stale: true, t: e.t, error: String(err.message || err) };
        throw err;
      } finally { this.inflight.delete(key); }
    })();
    this.inflight.set(key, p);
    return p;
  }
}

/* ---------- ember token: boleh meledak sampai `cap` permintaan, lalu `perSec` per detik ---------- */
export class Bucket {
  constructor(cap, perSec) { this.cap = cap; this.rate = perSec; this.tokens = cap; this.t = Date.now(); this.chain = Promise.resolve(); }
  run(fn) {
    const job = this.chain.then(async () => {
      for (;;) {
        const now = Date.now();
        this.tokens = Math.min(this.cap, this.tokens + (now - this.t) / 1000 * this.rate); this.t = now;
        if (this.tokens >= 1) { this.tokens -= 1; break; }
        await new Promise(r => setTimeout(r, Math.ceil((1 - this.tokens) / this.rate * 1000)));
      }
    });
    this.chain = job.catch(() => {});
    return job.then(fn);
  }
}

/* ---------- antrean per penyedia: jarak minimal antar permintaan ---------- */
/* maxWaitMs: permintaan yang menunggu antrean lebih lama dari ini ditolak (503) dengan cepat,
   daripada membuat browser kehabisan waktu lalu memanggil sumber yang sama langsung. */
export class Gate {
  constructor(minGapMs, { maxWaitMs = 25000 } = {}) { this.gap = minGapMs; this.maxWait = maxWaitMs; this.next = 0; this.chain = Promise.resolve(); }
  run(fn) {
    const queuedAt = Date.now();
    const job = this.chain.then(async () => {
      const wait = this.next - Date.now();
      if (Date.now() - queuedAt + Math.max(0, wait) > this.maxWait) throw new UpstreamError('Antrean penuh (batas laju sumber); coba lagi sebentar lagi', 503);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      try { return await fn(); } finally { this.next = Date.now() + this.gap; }
    });
    this.chain = job.catch(() => {});
    return job;
  }
}

/* ---------- fetch ke sumber ---------- */
export class UpstreamError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}
export async function upstream(url, { timeout = 15000, headers = {}, as = 'json', method = 'GET' } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method, signal: ctl.signal,
      headers: { 'User-Agent': 'QuantTerminal/2.0 (+https://github.com/wilboards/quantfinance; edukasi)', Accept: as === 'json' ? 'application/json' : '*/*', ...headers },
    });
    const text = await res.text();
    if (!res.ok) throw new UpstreamError(`HTTP ${res.status}: ${text.slice(0, 160).replace(/\s+/g, ' ')}`, res.status);
    if (as === 'text') return text;
    try { return JSON.parse(text); } catch { throw new UpstreamError('Respons bukan JSON: ' + text.slice(0, 160).replace(/\s+/g, ' '), 502); }
  } catch (e) {
    if (e.name === 'AbortError') throw new UpstreamError('Batas waktu habis (' + timeout / 1000 + ' dtk)', 504);
    /* fetch Node hanya bilang "fetch failed"; sebab aslinya (DNS, koneksi ditolak, TLS) ada di e.cause */
    if (e instanceof TypeError && e.cause) throw new UpstreamError('Gagal terhubung: ' + (e.cause.code || e.cause.message || 'jaringan'), 502);
    throw e;
  } finally { clearTimeout(timer); }
}

/* hapus kunci API dari URL sebelum ditampilkan ke browser */
export function redact(url) {
  return String(url).replace(/([?&](?:api_key|apikey|token|key)=)[^&]+/gi, '$1***');
}

/* ---------- batas permintaan per IP (melindungi kuota API kalau server terbuka ke jaringan) ---------- */
export class IpLimiter {
  constructor(perMin) { this.per = perMin; this.m = new Map(); }
  allow(ip) {
    const now = Date.now();
    let b = this.m.get(ip);
    if (!b || now - b.t > 60e3) { b = { t: now, n: 0 }; this.m.set(ip, b); }
    b.n++;
    /* buang hanya ember yang sudah kedaluwarsa; menghapus semua (clear) memberi celah reset batas */
    if (this.m.size > 5000) for (const [k, v] of this.m) if (now - v.t > 60e3) this.m.delete(k);
    return b.n <= this.per;
  }
}
