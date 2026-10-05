/* =====================================================================
   QuantTerminal server (Node 22+, TANPA library tambahan)
   - Menyajikan dist/quant-terminal.html
   - Proxy + cache ke API gratis. Kunci API dibaca dari .env, TIDAK PERNAH dikirim ke browser.
   - Satu format respons: { ok, provider, source, sourceUrl, fetchedAt, cached, stale, quality, data }
   Jalankan:  npm start   lalu buka http://localhost:8787
   ===================================================================== */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as P from '../shared/parsers.mjs';
import { loadEnv, Registry, Cache, Gate, Bucket, upstream, redact, IpLimiter, UpstreamError } from './lib/core.mjs';
import { AisHub } from './lib/ais.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...loadEnv(join(ROOT, '.env')), ...process.env };
const PORT = +(env.PORT || 8787);
const HOST = env.HOST || '127.0.0.1';
const ORIGINS = new Set((env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,null').split(',').map(s => s.trim()).filter(Boolean));
const KEY = {
  aisstream: env.AISSTREAM_API_KEY || '',
  finnhub: env.FINNHUB_API_KEY || '',
  fred: env.FRED_API_KEY || '',
  coingecko: env.COINGECKO_DEMO_KEY || '',
};
const YAHOO = env.ENABLE_UNOFFICIAL_YAHOO === '1';
const VERSION = '2.0.0';

const reg = new Registry();
const cache = new Cache(env.CACHE_DIR || join(ROOT, '.cache'));   // e2e memakai folder terpisah supaya data uji tidak bercampur
const limiter = new IpLimiter(+(env.RATE_LIMIT_PER_MIN || 240));

/* ---------- daftar penyedia (ditampilkan di "Sumber data") ---------- */
const DEF = [
  ['worldbank', { name: 'World Bank WDI', kind: 'Ekonomi', auth: 'tanpa kunci', limit: 'tidak dipublikasikan; di-cache 12 jam', homepage: 'https://data.worldbank.org', quality: 'historical' }],
  ['imf', { name: 'IMF DataMapper (WEO)', kind: 'Ekonomi', auth: 'tanpa kunci', limit: 'tidak dipublikasikan; di-cache 12 jam', homepage: 'https://www.imf.org/external/datamapper', quality: 'historical' }],
  ['gdelt', { name: 'GDELT DOC/GEO 2.0', kind: 'Berita', auth: 'tanpa kunci', limit: '1 permintaan per 5 detik per IP; di-cache 15 menit', homepage: 'https://www.gdeltproject.org', quality: 'delayed' }],
  ['fred', { name: KEY.fred ? 'FRED API' : 'FRED (CSV publik)', kind: 'Makro AS', auth: KEY.fred ? 'kunci server' : 'tanpa kunci (CSV)', limit: KEY.fred ? '120 per menit' : 'tidak dipublikasikan; di-cache 3 jam', homepage: 'https://fred.stlouisfed.org', quality: 'eod' }],
  ['portwatch', { name: 'IMF PortWatch', kind: 'Pelayaran', auth: 'tanpa kunci', limit: 'ArcGIS; di-cache 6 jam', homepage: 'https://portwatch.imf.org', quality: 'delayed' }],
  ['aisstream', { name: 'AISStream.io', kind: 'Kapal (live)', auth: 'kunci server', configured: !!KEY.aisstream, limit: 'WebSocket; kotak pantau terbatas', homepage: 'https://aisstream.io', quality: 'live' }],
  ['digitraffic', { name: 'Digitraffic (Fintraffic)', kind: 'Kapal (live, Baltik)', auth: 'tanpa kunci', configured: env.DIGITRAFFIC_ENABLED !== '0', limit: 'polling 60 detik', homepage: 'https://www.digitraffic.fi/en/marine-traffic/', quality: 'live' }],
  ['usgs', { name: 'USGS Earthquakes', kind: 'Bencana', auth: 'tanpa kunci', limit: 'feed publik; di-cache 5 menit', homepage: 'https://earthquake.usgs.gov', quality: 'live' }],
  ['gdacs', { name: 'GDACS', kind: 'Bencana', auth: 'tanpa kunci', limit: 'feed publik; di-cache 15 menit', homepage: 'https://www.gdacs.org', quality: 'delayed' }],
  ['fx', { name: 'ExchangeRate-API (open)', kind: 'Kurs', auth: 'tanpa kunci', limit: 'harian; di-cache 1 jam', homepage: 'https://www.exchangerate-api.com', quality: 'eod' }],
  ['bis', { name: 'BIS policy rates', kind: 'Bank sentral', auth: 'tanpa kunci', limit: 'di-cache 12 jam', homepage: 'https://data.bis.org/topics/CBPOL', quality: 'eod' }],
  ['coingecko', { name: 'CoinGecko', kind: 'Kripto', auth: KEY.coingecko ? 'kunci demo server' : 'tanpa kunci', limit: '±5–30 per menit (publik); di-cache 60 detik', homepage: 'https://www.coingecko.com', quality: 'delayed' }],
  ['binance', { name: 'Binance (publik)', kind: 'Kripto', auth: 'tanpa kunci', limit: 'bobot 6000/menit; di-cache 5 detik', homepage: 'https://www.binance.com', quality: 'live' }],
  ['finnhub', { name: 'Finnhub', kind: 'Saham AS', auth: 'kunci server', configured: !!KEY.finnhub, limit: '60 per menit', homepage: 'https://finnhub.io', quality: 'live' }],
  ['yahoo', { name: 'Yahoo Finance (TIDAK RESMI)', kind: 'Saham global', auth: 'tanpa kunci', configured: YAHOO, limit: 'tidak resmi, bisa putus kapan saja', homepage: 'https://finance.yahoo.com', quality: 'delayed' }],
  ['wikipedia', { name: 'Wikipedia REST', kind: 'Tokoh publik', auth: 'tanpa kunci', limit: 'di-cache 24 jam', homepage: 'https://www.wikipedia.org', quality: 'historical' }],
];
for (const [id, meta] of DEF) reg.define(id, meta);

/* GDELT: tepat 1 per 6 detik (limiter mereka ketat). Lainnya: ember token sesuai batas resmi. */
const gates = { gdelt: new Gate(6000), coingecko: new Bucket(5, 0.4), finnhub: new Bucket(25, 0.9), yahoo: new Bucket(8, 2), worldbank: new Bucket(10, 5), imf: new Bucket(6, 3), fred: new Bucket(20, 1.8) };

const ais = new AisHub({
  registry: reg, aisKey: KEY.aisstream,
  digitrafficUser: env.DIGITRAFFIC_USER || 'QuantTerminal/2.0', digitrafficEnabled: env.DIGITRAFFIC_ENABLED !== '0',
});

/* ---------- pembantu ---------- */
class BadRequest extends Error { constructor(m) { super(m); this.status = 400; } }
const need = (v, re, name) => { if (typeof v !== 'string' || !re.test(v)) throw new BadRequest(`Parameter "${name}" tidak valid`); return v; };
const opt = (v, re, def) => (v && re.test(v) ? v : def);

/* panggil sumber lewat cache + antrean + catatan status */
async function viaCache(provider, key, ttl, url, fetcher, extra = {}) {
  const st = reg.get(provider);
  if (st && st.backoffUntil > Date.now()) {
    const e = cache.peek(key);
    if (e) return { ...wrapEnv(provider, url, { value: e.value, cached: true, stale: Date.now() - e.t > e.ttl, t: e.t }), ...extra };
    throw new UpstreamError(`Penyedia ${provider} sedang dibatasi (rate limit) sampai ${new Date(st.backoffUntil).toLocaleTimeString('en-GB')}`, 429);
  }
  const r = await cache.wrap(key, ttl, async () => {
    const t0 = Date.now();
    const go = async () => {
      try { const v = await fetcher(); reg.ok(provider, Date.now() - t0); return v; }
      catch (e) {
        reg.fail(provider, e, Date.now() - t0);
        if (e.status === 429 && st) st.backoffUntil = Date.now() + 90e3;
        throw e;
      }
    };
    return gates[provider] ? gates[provider].run(go) : go();
  }, { onHit: () => reg.hit(provider) });
  return { ...wrapEnv(provider, url, r), ...extra };
}
function wrapEnv(provider, url, r) {
  const st = reg.get(provider) || {};
  return {
    ok: true, provider, source: st.name, sourceUrl: redact(url), fetchedAt: new Date(r.t).toISOString(),
    cached: r.cached, stale: !!r.stale, staleReason: r.error || null, quality: r.stale ? 'stale' : st.quality, data: r.value,
  };
}

/* nilai akhir bulan (end of period) dari deret harian/mingguan */
function monthEnd(pts) {
  const m = new Map();
  for (const p of pts) m.set(p.date.slice(0, 7), p);
  return [...m.values()];
}

/* ---------- rute API ---------- */
const ROUTES = {
  '/api/health': async () => ({
    ok: true, app: 'QuantTerminal', version: VERSION, time: new Date().toISOString(),
    keys: { aisstream: !!KEY.aisstream, finnhub: !!KEY.finnhub, fred: !!KEY.fred, coingecko: !!KEY.coingecko }, yahoo: YAHOO,
  }),
  '/api/providers': async () => ({ ok: true, providers: reg.list(), time: new Date().toISOString() }),

  /* World Bank: indicator wajib, country=all atau ISO3;ISO3, mrnev atau date */
  '/api/worldbank': async q => {
    const ind = need(q.get('indicator'), /^[A-Za-z0-9_.]{2,40}(;[A-Za-z0-9_.]{2,40}){0,30}$/, 'indicator');   // banyak indikator dipisah ";" (butuh source)
    const country = opt(q.get('country'), /^(all|[A-Z]{3}(;[A-Z]{3}){0,20})$/, 'all');
    const mrnev = opt(q.get('mrnev'), /^\d{1,2}$/, '');
    const date = opt(q.get('date'), /^\d{4}(:\d{4})?$/, '');
    const source = opt(q.get('source'), /^\d{1,3}$/, '');
    const params = new URLSearchParams({ format: 'json', per_page: '20000' });
    if (mrnev) params.set('mrnev', mrnev); else if (date) params.set('date', date); else params.set('mrnev', '1');
    if (source) params.set('source', source);
    const url = `https://api.worldbank.org/v2/country/${country}/indicator/${ind}?${params}`;
    return viaCache('worldbank', 'wb:' + url, 12 * 3600e3, url, async () => P.parseWorldBank(await upstream(url, { timeout: 25000 })));
  },

  '/api/imf': async q => {
    const ind = need(q.get('indicator'), /^[A-Za-z0-9_]{2,30}$/, 'indicator');
    const url = `https://www.imf.org/external/datamapper/api/v1/${ind}`;
    return viaCache('imf', 'imf:' + ind, 12 * 3600e3, url, async () => P.parseImf(await upstream(url, { timeout: 25000, headers: { Accept: 'application/json', 'Accept-Language': 'en' } }), ind));
  },

  /* GDELT DOC: query bebas (dibatasi panjang & karakter), mode terbatas */
  '/api/gdelt/doc': async q => {
    const query = need(q.get('query'), /^[^<>{}\\]{3,400}$/, 'query');
    const mode = opt(q.get('mode'), /^(artlist|timelinetone|timelinevolraw|timelinevol)$/, 'artlist');
    const timespan = opt(q.get('timespan'), /^\d{1,3}(min|h|d|w)$/, '3d');
    const max = opt(q.get('maxrecords'), /^\d{1,3}$/, '75');
    const sort = opt(q.get('sort'), /^(DateDesc|HybridRel|ToneAsc|ToneDesc)$/, 'DateDesc');
    const params = new URLSearchParams({ query, mode, format: 'json', timespan, maxrecords: String(Math.min(+max, 250)), sort });
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
    return viaCache('gdelt', 'gd:' + url, 15 * 60e3, url, async () => {
      const txt = await upstream(url, { as: 'text', timeout: 30000 });
      let j;
      try { j = JSON.parse(txt); } catch { throw new UpstreamError('GDELT: ' + txt.slice(0, 160).replace(/\s+/g, ' '), 502); }
      return mode === 'artlist' ? P.parseGdeltArticles(j) : P.parseGdeltTimeline(j);
    });
  },
  '/api/gdelt/geo': async q => {
    const query = need(q.get('query'), /^[^<>{}\\]{3,400}$/, 'query');
    const timespan = opt(q.get('timespan'), /^\d{1,3}(h|d)$/, '24h');
    const params = new URLSearchParams({ query, mode: 'PointData', format: 'GeoJSON', timespan });
    const url = `https://api.gdeltproject.org/api/v2/geo/geo?${params}`;
    return viaCache('gdelt', 'gg:' + url, 30 * 60e3, url, async () => {
      const txt = await upstream(url, { as: 'text', timeout: 30000 });
      let j;
      try { j = JSON.parse(txt); } catch { throw new UpstreamError('GDELT GEO: ' + txt.slice(0, 160).replace(/\s+/g, ' '), 502); }
      return P.parseGdeltGeo(j);
    });
  },

  /* FRED: dengan kunci pakai API resmi; tanpa kunci pakai fredgraph.csv publik */
  '/api/fred': async q => {
    const ids = need(q.get('series'), /^[A-Z0-9_]{2,40}(,[A-Z0-9_]{2,40}){0,15}$/, 'series').split(',');
    const start = opt(q.get('start'), /^\d{4}-\d{2}-\d{2}$/, new Date(Date.now() - 3 * 365 * 86400e3).toISOString().slice(0, 10));
    const freq = opt(q.get('freq'), /^m$/, '');      // m = ambil nilai akhir tiap bulan (hemat ukuran untuk riwayat panjang)
    const out = {};
    const errors = {};
    let lastEnv = null;
    for (const id of ids) {
      const url = KEY.fred
        ? `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&observation_start=${start}&file_type=json&api_key=${KEY.fred}`
        : `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`;
      try {
        lastEnv = await viaCache('fred', 'fred:' + id + ':' + start + ':' + !!KEY.fred, 3 * 3600e3, url, async () =>
          KEY.fred ? P.parseFredObs(await upstream(url)) : P.parseFredCsv(await upstream(url, { as: 'text' })));
        out[id] = { data: freq === 'm' ? monthEnd(lastEnv.data) : lastEnv.data, fetchedAt: lastEnv.fetchedAt, stale: lastEnv.stale, sourceUrl: lastEnv.sourceUrl, freq: freq || 'asli' };
      } catch (e) { errors[id] = String(e.message || e); }
    }
    if (!Object.keys(out).length) throw new UpstreamError('FRED gagal: ' + Object.values(errors)[0], 502);
    return { ok: true, provider: 'fred', source: reg.get('fred').name, quality: 'eod', fetchedAt: new Date().toISOString(), data: out, errors };
  },

  /* IMF PortWatch: transit harian di chokepoint (berbasis AIS, jeda ±4 hari) */
  '/api/portwatch/chokepoints': async q => {
    const days = Math.min(+(opt(q.get('days'), /^\d{1,3}$/, '400')), 800);
    const base = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
    return viaCache('portwatch', 'pw:' + days, 6 * 3600e3, base, async () => {
      const rows = [];
      const cutoff = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
      for (let page = 0; page < 12; page++) {
        const params = new URLSearchParams({ where: '1=1', outFields: '*', orderByFields: 'date DESC', resultOffset: String(page * 2000), resultRecordCount: '2000', returnGeometry: page === 0 ? 'true' : 'false', outSR: '4326', f: 'json' });
        const part = P.parsePortWatch(await upstream(`${base}?${params}`, { timeout: 30000 }));
        rows.push(...part);
        if (part.length < 2000 || part.some(r => r.date < cutoff)) break;
      }
      return { rows: [], summary: P.summarizeChokepoints(rows.filter(r => r.date >= cutoff)) };   // ringkasan + deret per chokepoint sudah cukup
    });
  },

  '/api/ships': async q => {
    const b = opt(q.get('box'), /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, '');
    const cls = opt(q.get('cls'), /^[a-z]{3,12}$/, '');
    const snap = ais.snapshot({ box: b ? b.split(',').map(Number) : null, cls: cls || null });
    return { ok: true, provider: 'ais', source: 'AISStream.io + Digitraffic', quality: 'live', fetchedAt: snap.generatedAt, data: snap };
  },
  '/api/ships/track': async q => {
    const mmsi = +need(q.get('mmsi'), /^\d{6,9}$/, 'mmsi');
    const t = ais.track(mmsi);
    if (!t) throw new UpstreamError('Kapal tidak ada di memori server (belum terlihat atau sudah >6 jam)', 404);
    return { ok: true, provider: 'ais', source: t.src, quality: 'live', fetchedAt: new Date().toISOString(), data: t };
  },

  '/api/hazards': async () => {
    const urlU = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
    const urlG = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP';
    const [u, g] = await Promise.allSettled([
      viaCache('usgs', 'usgs:4.5w', 5 * 60e3, urlU, async () => P.parseUsgs(await upstream(urlU))),
      viaCache('gdacs', 'gdacs:events', 15 * 60e3, urlG, async () => P.parseGdacs(await upstream(urlG))),
    ]);
    return {
      ok: u.status === 'fulfilled' || g.status === 'fulfilled', provider: 'hazards', source: 'USGS + GDACS', quality: 'live', fetchedAt: new Date().toISOString(),
      data: {
        usgs: u.status === 'fulfilled' ? u.value : { ok: false, error: String(u.reason.message) },
        gdacs: g.status === 'fulfilled' ? g.value : { ok: false, error: String(g.reason.message) },
      },
    };
  },

  '/api/fx': async () => {
    const url = 'https://open.er-api.com/v6/latest/USD';
    try { return await viaCache('fx', 'fx:usd', 3600e3, url, async () => P.parseErApi(await upstream(url))); }
    catch (e) {
      const url2 = 'https://api.frankfurter.app/latest?from=USD';
      const r = await viaCache('fx', 'fx:frank', 3600e3, url2, async () => P.parseFrankfurter(await upstream(url2)));
      return { ...r, fallback: 'Frankfurter (ECB)', primaryError: String(e.message) };
    }
  },

  '/api/bis/policy': async () => {
    const start = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 7);
    const url1 = `https://stats.bis.org/api/v1/data/WS_CBPOL/M./all?startPeriod=${start}&detail=dataonly`;
    const url2 = `https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.*?startPeriod=${start}&detail=dataonly&format=csv`;
    return viaCache('bis', 'bis:' + start, 12 * 3600e3, url1, async () => {
      try { return P.parseBisCsv(await upstream(url1, { as: 'text', headers: { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' } })); }
      catch { return P.parseBisCsv(await upstream(url2, { as: 'text', headers: { Accept: 'application/vnd.sdmx.data+csv;version=2.0.0, text/csv' } })); }
    });
  },

  '/api/crypto/markets': async q => {
    const per = opt(q.get('per'), /^\d{1,3}$/, '50');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${Math.min(+per, 100)}&page=1&price_change_percentage=24h`;
    const headers = KEY.coingecko ? { 'x-cg-demo-api-key': KEY.coingecko } : {};
    return viaCache('coingecko', 'cg:' + per, 60e3, url, async () => P.parseCoinGecko(await upstream(url, { headers })));
  },
  '/api/crypto/binance24h': async q => {
    const syms = need(q.get('symbols'), /^[A-Z0-9]{5,12}(,[A-Z0-9]{5,12}){0,20}$/, 'symbols').split(',');
    const enc = encodeURIComponent(JSON.stringify(syms));
    const hosts = ['https://api.binance.com', 'https://data-api.binance.vision'];
    let lastErr;
    for (const h of hosts) {
      const url = `${h}/api/v3/ticker/24hr?symbols=${enc}`;
      try { return await viaCache('binance', 'bn:' + h + syms.join(','), 5e3, url, async () => P.parseBinance24h(await upstream(url, { timeout: 8000 }))); }
      catch (e) { lastErr = e; }
    }
    throw lastErr;
  },

  '/api/crypto/klines': async q => {
    const sym = need(q.get('symbol'), /^[A-Z0-9]{5,12}$/, 'symbol');
    const iv = opt(q.get('interval'), /^(1m|5m|15m|1h|4h|1d|1w)$/, '1d');
    const lim = Math.min(+opt(q.get('limit'), /^\d{1,4}$/, '365'), 1000);
    let lastErr;
    for (const h of ['https://api.binance.com', 'https://data-api.binance.vision']) {
      const url = `${h}/api/v3/klines?symbol=${sym}&interval=${iv}&limit=${lim}`;
      try { return await viaCache('binance', 'kl:' + url, iv.endsWith('m') ? 30e3 : 5 * 60e3, url, async () => P.parseBinanceKlines(await upstream(url, { timeout: 10000 }))); }
      catch (e) { lastErr = e; }
    }
    throw lastErr;
  },
  '/api/crypto/depth': async q => {
    const sym = need(q.get('symbol'), /^[A-Z0-9]{5,12}$/, 'symbol');
    let lastErr;
    for (const h of ['https://api.binance.com', 'https://data-api.binance.vision']) {
      const url = `${h}/api/v3/depth?symbol=${sym}&limit=100`;
      try { return await viaCache('binance', 'dp:' + url, 2e3, url, async () => P.parseBinanceDepth(await upstream(url, { timeout: 8000 }))); }
      catch (e) { lastErr = e; }
    }
    throw lastErr;
  },
  '/api/crypto/ohlc': async q => {
    const id = need(q.get('id'), /^[a-z0-9-]{2,40}$/, 'id');
    const days = opt(q.get('days'), /^(1|7|14|30|90|180|365)$/, '30');
    const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
    const headers = KEY.coingecko ? { 'x-cg-demo-api-key': KEY.coingecko } : {};
    return viaCache('coingecko', 'cgo:' + id + days, 10 * 60e3, url, async () => P.parseCoinGeckoOhlc(await upstream(url, { headers })));
  },

  /* Finnhub (kunci gratis): profil, metrik, insider, earnings, berita perusahaan, rekan sejenis */
  '/api/finnhub': async q => {
    if (!KEY.finnhub) throw new UpstreamError('FINNHUB_API_KEY belum diisi di .env', 503);
    const kind = need(q.get('kind'), /^(profile|metric|insider|earnings|news|peers|recommendation)$/, 'kind');
    const sym = need(q.get('symbol'), /^[A-Z0-9.\-]{1,12}$/, 'symbol');
    const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 10);
    const path = {
      profile: `stock/profile2?symbol=${sym}`, metric: `stock/metric?symbol=${sym}&metric=all`, insider: `stock/insider-transactions?symbol=${sym}`,
      earnings: `stock/earnings?symbol=${sym}`, news: `company-news?symbol=${sym}&from=${from}&to=${to}`, peers: `stock/peers?symbol=${sym}`, recommendation: `stock/recommendation?symbol=${sym}`,
    }[kind];
    const parse = { profile: P.parseFinnhubProfile, metric: P.parseFinnhubMetric, insider: P.parseFinnhubInsider, earnings: P.parseFinnhubEarnings, news: P.parseFinnhubNews, peers: x => (Array.isArray(x) ? x.slice(0, 12) : []), recommendation: x => (Array.isArray(x) ? x.slice(0, 6) : []) }[kind];
    const url = `https://finnhub.io/api/v1/${path}&token=${KEY.finnhub}`;
    const ttl = kind === 'news' ? 15 * 60e3 : kind === 'metric' || kind === 'profile' ? 12 * 3600e3 : 3 * 3600e3;
    return viaCache('finnhub', 'fh:' + kind + ':' + sym, ttl, url, async () => parse(await upstream(url)));
  },

  '/api/quote': async q => {
    if (!KEY.finnhub) throw new UpstreamError('FINNHUB_API_KEY belum diisi di .env, jadi harga saham asli tidak tersedia', 503);
    const syms = need(q.get('symbols'), /^[A-Z0-9.\-]{1,12}(,[A-Z0-9.\-]{1,12}){0,30}$/, 'symbols').split(',');
    const out = {}, errors = {};
    for (const s of syms) {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${KEY.finnhub}`;
      try { out[s] = (await viaCache('finnhub', 'fh:q:' + s, 15e3, url, async () => P.parseFinnhubQuote(await upstream(url), s))).data; }
      catch (e) { errors[s] = String(e.message); }
    }
    return { ok: true, provider: 'finnhub', source: 'Finnhub', quality: 'live', fetchedAt: new Date().toISOString(), data: out, errors };
  },
  '/api/yahoo/chart': async q => {
    if (!YAHOO) throw new UpstreamError('Sumber tidak resmi Yahoo dimatikan. Aktifkan dengan ENABLE_UNOFFICIAL_YAHOO=1 di .env bila kamu menerima risikonya.', 503);
    const sym = need(q.get('symbol'), /^[A-Za-z0-9.\-^=]{1,20}$/, 'symbol');
    const range = opt(q.get('range'), /^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|max)$/, '1y');
    const interval = opt(q.get('interval'), /^(1m|5m|15m|30m|60m|1d|1wk|1mo)$/, '1d');
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
    const ttl = interval.endsWith('m') ? 60e3 : 15 * 60e3;
    return viaCache('yahoo', 'yh:' + url, ttl, url, async () => P.parseYahooChart(await upstream(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })));
  },

  '/api/wiki/summary': async q => {
    const title = need(q.get('title'), /^[^<>{}\\|#]{1,120}$/, 'title');
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    return viaCache('wikipedia', 'wk:s:' + title, 24 * 3600e3, url, async () => P.parseWikiSummary(await upstream(url)));
  },
  '/api/wiki/search': async q => {
    const s = need(q.get('q'), /^[^<>{}\\|#]{2,80}$/, 'q');
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(s)}&srlimit=8&format=json`;
    return viaCache('wikipedia', 'wk:q:' + s, 24 * 3600e3, url, async () => P.parseWikiSearch(await upstream(url)));
  },
};

/* ---------- HTTP ---------- */
const HTML_FILE = join(ROOT, 'dist', 'quant-terminal.html');
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",           // kode tertanam di satu file HTML
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.binance.com https://data-api.binance.vision https://api.coingecko.com https://api.worldbank.org https://www.imf.org https://api.gdeltproject.org https://earthquake.usgs.gov https://open.er-api.com https://api.frankfurter.app https://meri.digitraffic.fi https://services9.arcgis.com https://en.wikipedia.org",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');

function send(req, res, status, body, type = 'application/json; charset=utf-8', extraHeaders = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = {
    'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store', ...extraHeaders,
  };
  if (buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { buf = gzipSync(buf); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding, Origin'; }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(buf);
}
function cors(req) {
  const o = req.headers.origin;
  if (!o) return {};
  if (ORIGINS.has(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return { 'Access-Control-Allow-Origin': o, Vary: 'Origin' };
  return {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress || '?';
  const ch = cors(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...ch, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600' }); return res.end(); }
  if (req.method !== 'GET') return send(req, res, 405, { ok: false, error: { code: 405, message: 'Hanya GET' } }, undefined, ch);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (!existsSync(HTML_FILE)) return send(req, res, 500, 'dist/quant-terminal.html belum ada. Jalankan: npm run build', 'text/plain; charset=utf-8');
    return send(req, res, 200, readFileSync(HTML_FILE), 'text/html; charset=utf-8', { 'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY' });
  }
  const route = ROUTES[url.pathname];
  if (!route) return send(req, res, 404, { ok: false, error: { code: 404, message: 'Rute tidak ada' } }, undefined, ch);
  const loopback = /^(::1|127\.|::ffff:127\.)/.test(ip);          // pemakai lokal tidak dibatasi; batas untuk akses dari jaringan
  if (!loopback && !limiter.allow(ip)) return send(req, res, 429, { ok: false, error: { code: 429, message: 'Terlalu banyak permintaan ke server lokal. Tunggu sebentar.' } }, undefined, ch);
  try {
    const out = await route(url.searchParams);
    send(req, res, 200, out, undefined, ch);
  } catch (e) {
    const code = e.status && e.status >= 400 && e.status < 600 ? (e instanceof BadRequest ? 400 : e.status === 404 ? 404 : e.status === 503 ? 503 : e.status === 429 ? 429 : 502) : 502;
    send(req, res, code, { ok: false, error: { code, message: String(e.message || e).slice(0, 300) } }, undefined, ch);
  }
});

export function start() {
  ais.start();
  server.listen(PORT, HOST, () => {
    console.log(`QuantTerminal server jalan di http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log('Kunci terpasang:', Object.entries(KEY).map(([k, v]) => `${k}=${v ? 'ya' : 'tidak'}`).join(', '), '| Yahoo tidak resmi:', YAHOO ? 'AKTIF' : 'mati');
  });
  return server;
}
export { ROUTES, reg, cache, ais };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) start();
