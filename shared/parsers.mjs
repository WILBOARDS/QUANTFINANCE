/* =====================================================================
   PARSER SUMBER DATA (dipakai bersama oleh browser dan server)
   Setiap fungsi mengubah respons mentah sebuah API menjadi bentuk yang rapi.
   Tidak ada angka yang dikarang di sini: kalau respons tidak berisi nilai,
   hasilnya null/kosong, bukan tebakan.
   File ini ES module untuk Node; build.mjs membuang kata "export" saat
   menanamnya ke HTML supaya bisa jalan di browser sebagai script biasa.
   ===================================================================== */

export const num = v => {
  if (v === null || v === undefined || v === '' || v === '.') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/* ---------- World Bank API v2 ----------
   Bentuk asli: [ {page, pages, per_page, total, lastupdated}, [ {indicator:{id,value}, country:{id,value},
   countryiso3code, date, value, ...}, ... ] ]  */
export function parseWorldBank(json) {
  if (!Array.isArray(json)) {
    const msg = json && json[0] && json[0].message ? json[0].message : null;
    throw new Error('Format World Bank tidak dikenal' + (msg ? ': ' + JSON.stringify(msg) : ''));
  }
  if (json[0] && json[0].message) throw new Error('World Bank: ' + (json[0].message[0]?.value || 'error'));
  const meta = json[0] || {};
  const rows = (json[1] || []).map(r => ({
    iso3: r.countryiso3code || '',
    iso2: r.country?.id || '',
    country: r.country?.value || '',
    indicator: r.indicator?.id || '',
    indicatorName: r.indicator?.value || '',
    year: num(r.date),
    value: num(r.value),
  })).filter(r => r.value !== null);
  return { meta: { pages: meta.pages ?? 1, total: meta.total ?? rows.length, lastUpdated: meta.lastupdated || null }, rows };
}
/* nilai terbaru per negara: Map iso3 -> {value, year} */
export function wbLatest(rows) {
  const out = {};
  for (const r of rows) {
    if (!r.iso3) continue;
    const cur = out[r.iso3];
    if (!cur || r.year > cur.year) out[r.iso3] = { value: r.value, year: r.year };
  }
  return out;
}
/* deret waktu satu negara, urut tahun naik */
export function wbSeries(rows, iso3) {
  return rows.filter(r => r.iso3 === iso3).sort((a, b) => a.year - b.year).map(r => ({ year: r.year, value: r.value }));
}

/* ---------- IMF DataMapper API v1 ----------
   Bentuk asli: { values: { NGDP_RPCH: { IDN: { "2024": 5.0, ... } } }, api: {...} } */
export function parseImf(json, indicator) {
  const v = json && json.values;
  if (!v) throw new Error('Format IMF tidak dikenal');
  const key = indicator || Object.keys(v)[0];
  const byC = v[key] || {};
  const out = {};
  for (const iso3 of Object.keys(byC)) {
    const series = [];
    for (const [y, val] of Object.entries(byC[iso3] || {})) {
      const n = num(val);
      if (n !== null && /^\d{4}$/.test(y)) series.push({ year: +y, value: n });
    }
    series.sort((a, b) => a.year - b.year);
    if (series.length) out[iso3] = series;
  }
  return { indicator: key, series: out };
}
/* nilai IMF untuk tahun tertentu, ditandai apakah itu proyeksi (tahun > tahun data aktual terakhir) */
export function imfAt(series, year) {
  if (!series) return null;
  const hit = series.find(p => p.year === year);
  return hit ? hit.value : null;
}

/* ---------- GDELT DOC 2.0 ----------
   artlist: { articles: [ {url, url_mobile, title, seendate:"20261005T143000Z", socialimage, domain, language, sourcecountry} ] } */
export function gdeltDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/.exec(String(s || ''));
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}
export function parseGdeltArticles(json) {
  if (!json || typeof json !== 'object') throw new Error('Format GDELT tidak dikenal');
  const arts = Array.isArray(json.articles) ? json.articles : [];
  const seen = new Set();
  const out = [];
  for (const a of arts) {
    if (!a || !a.url || !a.title) continue;
    const title = String(a.title).replace(/\s+/g, ' ').trim();
    const k = title.toLowerCase();
    if (seen.has(k)) continue;          // judul yang sama dari banyak sindikasi
    seen.add(k);
    out.push({
      url: String(a.url),
      title,
      seen: gdeltDate(a.seendate),
      domain: a.domain || '',
      lang: a.language || '',
      srcCountry: a.sourcecountry || '',
      image: a.socialimage || '',
    });
  }
  return out;
}
/* timelinetone / timelinevolraw: { timeline: [ { series, data: [ {date, value} ] } ] } */
export function parseGdeltTimeline(json) {
  const s = json && Array.isArray(json.timeline) ? json.timeline[0] : null;
  if (!s) return [];
  return (s.data || []).map(d => ({ t: gdeltDate(d.date), v: num(d.value) })).filter(d => d.t && d.v !== null);
}
/* GEO 2.0 PointData (GeoJSON). properties: {name, count, shareimage, html}. html berisi tautan artikel. */
export function parseGdeltGeo(json) {
  const feats = json && Array.isArray(json.features) ? json.features : [];
  const out = [];
  for (const f of feats) {
    const c = f && f.geometry && f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const p = f.properties || {};
    const articles = [];
    const re = /<a\s([^>]*)>([^<]*)<\/a>/gi;
    let m;
    while ((m = re.exec(p.html || '')) && articles.length < 5) {
      const href = (/href="([^"]+)"/i.exec(m[1]) || [])[1] || '';
      const title = ((/title="([^"]*)"/i.exec(m[1]) || [])[1] || m[2] || '').trim();
      if (/^https?:\/\//.test(href) && title) articles.push({ url: href, title: decodeEntities(title) });
    }
    out.push({ lon: num(c[0]), lat: num(c[1]), name: p.name || '', count: num(p.count) || 0, articles });
  }
  return out.filter(p => p.lat !== null && p.lon !== null);
}
export function decodeEntities(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/* ---------- FRED ----------
   API: { observations: [ {date:"2026-10-01", value:"4.12"} ] }   nilai "." = kosong
   CSV tanpa kunci (fredgraph.csv): header "observation_date,DGS10" (dulu "DATE,DGS10") */
export function parseFredObs(json) {
  const obs = json && Array.isArray(json.observations) ? json.observations : null;
  if (!obs) throw new Error('Format FRED tidak dikenal');
  return obs.map(o => ({ date: o.date, value: num(o.value) })).filter(o => o.value !== null);
}
export function parseFredCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2 || !/date/i.test(lines[0])) throw new Error('Format CSV FRED tidak dikenal');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, v] = lines[i].split(',');
    const n = num(v);
    if (d && n !== null) out.push({ date: d.trim(), value: n });
  }
  return out;
}

/* ---------- IMF PortWatch (ArcGIS FeatureServer) ----------
   { features: [ { attributes: { date (epoch ms atau teks), portid, portname, n_tanker, n_container, ... } } ] } */
export function parsePortWatch(json) {
  if (json && json.error) throw new Error('PortWatch: ' + (json.error.message || 'error'));
  const feats = json && Array.isArray(json.features) ? json.features : null;
  if (!feats) throw new Error('Format PortWatch tidak dikenal');
  const pick = (a, k) => num(a[k]);
  return feats.map(f => {
    const a = f.attributes || {};
    let date = null;
    if (typeof a.date === 'number') date = new Date(a.date).toISOString().slice(0, 10);
    else if (a.date) date = String(a.date).slice(0, 10).replace(/\//g, '-');
    else if (a.year && a.month && a.day) date = `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')}`;
    const g = f.geometry || {};
    return {
      id: a.portid || '', name: a.portname || '', date,
      lon: num(g.x ?? a.lon ?? a.longitude), lat: num(g.y ?? a.lat ?? a.latitude),
      total: pick(a, 'n_total'), tanker: pick(a, 'n_tanker'), container: pick(a, 'n_container'),
      dryBulk: pick(a, 'n_dry_bulk'), generalCargo: pick(a, 'n_general_cargo'), roro: pick(a, 'n_roro'),
      cargo: pick(a, 'n_cargo'), capacity: pick(a, 'capacity'), capTanker: pick(a, 'capacity_tanker'),
    };
  }).filter(r => r.date && r.name);
}
/* ringkasan per chokepoint: hari terakhir, rata-rata 7 hari, rata-rata 1 tahun sebelumnya */
export function summarizeChokepoints(rows) {
  const by = {};
  for (const r of rows) (by[r.name] ||= []).push(r);
  const out = [];
  for (const [name, list] of Object.entries(by)) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = list[list.length - 1];
    const avg = (arr, k) => { const v = arr.map(x => x[k]).filter(x => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const w7 = list.slice(-7), base = list.slice(-372, -7);
    const r7 = avg(w7, 'total'), rBase = avg(base, 'total');
    const geo = list.find(x => x.lat !== null && x.lat !== undefined) || {};
    out.push({
      id: last.id, name, lastDate: last.date, days: list.length, lat: geo.lat ?? null, lon: geo.lon ?? null,
      last: last.total, avg7: r7, avgYear: rBase,
      chg: (r7 !== null && rBase) ? r7 / rBase - 1 : null,
      tanker7: avg(w7, 'tanker'), container7: avg(w7, 'container'), dryBulk7: avg(w7, 'dryBulk'),
      tankerBase: avg(base, 'tanker'),
      series: list.map(x => ({ date: x.date, total: x.total, tanker: x.tanker })),
    });
  }
  return out.sort((a, b) => (b.avg7 || 0) - (a.avg7 || 0));
}

/* ---------- AIS ----------
   Kode tipe kapal AIS (ITU-R M.1371): 70-79 kargo, 80-89 tanker, 60-69 penumpang, 30 penangkap ikan,
   31/32/52 tunda, 35 militer, 36 layar, 37 pesiar. AIS TIDAK membedakan kontainer vs curah, atau LNG vs minyak. */
export function shipClass(code, name) {
  const c = num(code);
  const n = String(name || '').toUpperCase();
  if (c >= 80 && c <= 89) return /\bLNG\b|\bLPG\b|GAS/.test(n) ? 'gas' : 'tanker';
  if (c >= 70 && c <= 79) return 'cargo';
  if (c >= 60 && c <= 69) return 'passenger';
  if (c === 30) return 'fishing';
  if (c === 31 || c === 32 || c === 52) return 'tug';
  if (c === 35) return 'military';
  if (c === 36 || c === 37) return 'leisure';
  if (c === null || c === 0) return 'unknown';
  return 'other';
}
/* pesan AISStream.io (WebSocket). PositionReport / StandardClassBPositionReport / ShipStaticData */
export function parseAisStream(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const md = msg.MetaData || {};
  const mmsi = num(md.MMSI ?? md.MMSI_String);
  if (!mmsi) return null;
  const t = md.time_utc ? Date.parse(String(md.time_utc).replace(/(\.\d{3})\d*/, '$1').replace(' +0000 UTC', 'Z').replace(' ', 'T')) : NaN;
  const ts = Number.isFinite(t) ? t : null;
  const name = String(md.ShipName || '').trim();
  const m = msg.Message || {};
  const pr = m.PositionReport || m.StandardClassBPositionReport || m.ExtendedClassBPositionReport;
  if (pr) {
    const lat = num(pr.Latitude ?? md.latitude), lon = num(pr.Longitude ?? md.longitude);
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const hd = num(pr.TrueHeading);
    return {
      kind: 'pos', mmsi, name, lat, lon, ts,
      sog: num(pr.Sog), cog: num(pr.Cog), heading: hd === 511 ? null : hd, navStatus: num(pr.NavigationalStatus),
    };
  }
  const sd = m.ShipStaticData;
  if (sd) {
    return {
      kind: 'static', mmsi, ts, name: String(sd.Name || name).trim(), shipType: num(sd.Type),
      dest: String(sd.Destination || '').trim(), callSign: String(sd.CallSign || '').trim(),
      imo: num(sd.ImoNumber) || null, draught: num(sd.MaximumStaticDraught),
    };
  }
  return null;
}
/* Digitraffic (Fintraffic, Finlandia) /api/ais/v1/locations: GeoJSON FeatureCollection */
export function parseDigitrafficLocations(json) {
  const feats = json && Array.isArray(json.features) ? json.features : null;
  if (!feats) throw new Error('Format Digitraffic tidak dikenal');
  return feats.map(f => {
    const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
    const hd = num(p.heading);
    return {
      kind: 'pos', mmsi: num(f.mmsi ?? p.mmsi), lon: num(c[0]), lat: num(c[1]),
      sog: num(p.sog), cog: num(p.cog), heading: hd === 511 ? null : hd, navStatus: num(p.navStat),
      ts: num(p.timestampExternal),
    };
  }).filter(v => v.mmsi && v.lat !== null && v.lon !== null);
}
export function parseDigitrafficVessels(json) {
  if (!Array.isArray(json)) throw new Error('Format Digitraffic vessels tidak dikenal');
  return json.map(v => ({
    kind: 'static', mmsi: num(v.mmsi), name: String(v.name || '').trim(), shipType: num(v.shipType),
    dest: String(v.destination || '').trim(), callSign: String(v.callSign || '').trim(),
    imo: num(v.imo) || null, draught: num(v.draught) !== null ? num(v.draught) / 10 : null, ts: num(v.timestamp),
  })).filter(v => v.mmsi);
}

/* ---------- Bencana ----------
   USGS GeoJSON feed; GDACS EVENTS4APP GeoJSON */
export function parseUsgs(json) {
  const feats = json && Array.isArray(json.features) ? json.features : null;
  if (!feats) throw new Error('Format USGS tidak dikenal');
  return feats.map(f => {
    const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
    return {
      id: f.id, kind: 'EQ', lon: num(c[0]), lat: num(c[1]), depth: num(c[2]), mag: num(p.mag),
      title: p.title || p.place || '', place: p.place || '', time: p.time ? new Date(p.time).toISOString() : null,
      url: p.url || '', alert: p.alert || null, tsunami: !!p.tsunami, source: 'USGS',
    };
  }).filter(e => e.lat !== null && e.lon !== null);
}
export function parseGdacs(json) {
  const feats = json && Array.isArray(json.features) ? json.features : null;
  if (!feats) throw new Error('Format GDACS tidak dikenal');
  return feats.map(f => {
    const p = f.properties || {}, g = f.geometry || {};
    let c = g.coordinates || [];
    if (g.type !== 'Point') c = Array.isArray(p.coordinates) ? p.coordinates : [];
    const toIso = s => { if (!s) return null; const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
    return {
      id: `${p.eventtype || ''}${p.eventid || ''}`, kind: p.eventtype || '', lon: num(c[0]), lat: num(c[1]),
      title: p.name || p.description || '', place: p.country || '', alert: p.alertlevel || null,
      time: toIso(p.fromdate), until: toIso(p.todate), severity: (p.severitydata && p.severitydata.severitytext) || '',
      url: (p.url && (p.url.report || p.url.details)) || '', source: 'GDACS',
    };
  }).filter(e => e.lat !== null && e.lon !== null && e.kind);
}

/* ---------- Kurs (open.er-api.com, tanpa kunci) ---------- */
export function parseErApi(json) {
  if (!json || json.result !== 'success' || !json.rates) throw new Error('Kurs: ' + (json && (json['error-type'] || json.result) || 'format tidak dikenal'));
  return { base: json.base_code, asOf: json.time_last_update_unix ? new Date(json.time_last_update_unix * 1000).toISOString() : null, rates: json.rates };
}
/* Frankfurter (ECB) sebagai cadangan: { amount, base, date, rates } */
export function parseFrankfurter(json) {
  if (!json || !json.rates) throw new Error('Format Frankfurter tidak dikenal');
  return { base: json.base, asOf: json.date ? json.date + 'T16:00:00Z' : null, rates: Object.assign({ [json.base]: 1 }, json.rates) };
}

/* ---------- BIS suku bunga kebijakan (SDMX-CSV) ---------- */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] || '').trim() !== '');
}
export function parseBisCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV BIS kosong');
  const h = rows[0].map(x => x.trim().toUpperCase());
  const iA = h.indexOf('REF_AREA'), iT = h.indexOf('TIME_PERIOD'), iV = h.indexOf('OBS_VALUE');
  if (iA < 0 || iT < 0 || iV < 0) throw new Error('Kolom CSV BIS tidak dikenal');
  const out = {};
  for (const r of rows.slice(1)) {
    const v = num(r[iV]);
    if (v === null) continue;
    (out[r[iA]] ||= []).push({ period: r[iT], value: v });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.period < b.period ? -1 : 1));
  return out;
}

/* ---------- Kripto ---------- */
export function parseBinance24h(arr) {
  if (!Array.isArray(arr)) arr = arr && arr.symbol ? [arr] : null;
  if (!arr) throw new Error('Format Binance tidak dikenal');
  return arr.map(t => ({
    symbol: t.symbol, price: num(t.lastPrice), chgPct: num(t.priceChangePercent), open: num(t.openPrice),
    high: num(t.highPrice), low: num(t.lowPrice), vol: num(t.volume), quoteVol: num(t.quoteVolume),
    bid: num(t.bidPrice), ask: num(t.askPrice), closeTime: num(t.closeTime),
  })).filter(t => t.symbol && t.price);
}
export function parseCoinGecko(arr) {
  if (!Array.isArray(arr)) throw new Error('Format CoinGecko tidak dikenal' + (arr && arr.status ? ': ' + JSON.stringify(arr.status) : ''));
  return arr.map(c => ({
    id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, price: num(c.current_price),
    chg24: num(c.price_change_percentage_24h), mcap: num(c.market_cap), fdv: num(c.fully_diluted_valuation),
    vol: num(c.total_volume), high24: num(c.high_24h), low24: num(c.low_24h), rank: num(c.market_cap_rank),
    circ: num(c.circulating_supply), updated: c.last_updated || null,
  })).filter(c => c.id && c.price !== null);
}
export function parseBinanceDepth(json) {
  if (!json || !Array.isArray(json.bids) || !Array.isArray(json.asks)) throw new Error('Format order book tidak dikenal');
  const m = a => a.map(([p, q]) => [num(p), num(q)]).filter(([p, q]) => p !== null && q !== null);
  return { bids: m(json.bids), asks: m(json.asks), lastUpdateId: json.lastUpdateId };
}

/* ---------- Saham (butuh server + kunci) ---------- */
export function parseFinnhubQuote(json, symbol) {
  if (!json || typeof json !== 'object' || json.error) throw new Error('Finnhub: ' + (json && json.error || 'format tidak dikenal'));
  const c = num(json.c);
  if (!c) return null;             // Finnhub mengembalikan 0 untuk kode yang tidak dikenal
  return { symbol, price: c, chg: num(json.d), chgPct: num(json.dp), high: num(json.h), low: num(json.l), open: num(json.o), prev: num(json.pc), ts: num(json.t) ? num(json.t) * 1000 : null };
}
/* Yahoo chart v8 (TIDAK RESMI; hanya bila diaktifkan pemilik) */
export function parseYahooChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r) throw new Error('Yahoo: ' + (json && json.chart && json.chart.error && json.chart.error.description || 'tidak ada data'));
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const bars = [];
  (r.timestamp || []).forEach((t, i) => {
    const o = num(q.open?.[i]), h = num(q.high?.[i]), l = num(q.low?.[i]), c = num(q.close?.[i]);
    if ([o, h, l, c].every(x => x !== null)) bars.push({ time: t, open: o, high: h, low: l, close: c, volume: num(q.volume?.[i]) || 0 });
  });
  const m = r.meta || {};
  return {
    symbol: m.symbol, currency: m.currency, exchange: m.exchangeName, tz: m.exchangeTimezoneName,
    price: num(m.regularMarketPrice), prev: num(m.chartPreviousClose ?? m.previousClose), ts: num(m.regularMarketTime) ? num(m.regularMarketTime) * 1000 : null,
    bars,
  };
}

/* ---------- Wikipedia (profil tokoh publik) ---------- */
export function parseWikiSummary(json) {
  if (!json || !json.title) throw new Error('Wikipedia: tidak ditemukan');
  return {
    title: json.title, description: json.description || '', extract: json.extract || '',
    url: (json.content_urls && json.content_urls.desktop && json.content_urls.desktop.page) || '',
    thumb: (json.thumbnail && json.thumbnail.source) || '', type: json.type || '',
    updated: json.timestamp || null,
  };
}
export function parseWikiSearch(json) {
  const arr = json && json.query && Array.isArray(json.query.search) ? json.query.search : [];
  return arr.map(r => ({ title: r.title, snippet: String(r.snippet || '').replace(/<[^>]+>/g, ''), pageid: r.pageid }));
}

/* Binance klines: [[openTime, open, high, low, close, volume, closeTime, ...], ...] */
export function parseBinanceKlines(arr) {
  if (!Array.isArray(arr)) throw new Error('Format klines tidak dikenal');
  return arr.map(k => ({ time: Math.floor(k[0] / 1000), open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]), volume: num(k[5]) || 0 }))
    .filter(b => [b.open, b.high, b.low, b.close].every(x => x !== null));
}
/* CoinGecko /coins/{id}/ohlc: [[ms, open, high, low, close], ...] (tanpa volume) */
export function parseCoinGeckoOhlc(arr) {
  if (!Array.isArray(arr)) throw new Error('Format OHLC CoinGecko tidak dikenal');
  const seen = new Set();
  return arr.map(k => ({ time: Math.floor(k[0] / 1000), open: num(k[1]), high: num(k[2]), low: num(k[3]), close: num(k[4]), volume: 0 }))
    .filter(b => [b.open, b.high, b.low, b.close].every(x => x !== null) && !seen.has(b.time) && seen.add(b.time));
}
/* Finnhub metrik dasar: { metric: {...}, series: {...} } -> rasio pilihan */
export function parseFinnhubMetric(json) {
  const m = json && json.metric;
  if (!m) throw new Error('Finnhub: metrik tidak ada');
  const pick = k => num(m[k]);
  return {
    pe: pick('peTTM') ?? pick('peBasicExclExtraTTM'), pb: pick('pbQuarterly') ?? pick('pbAnnual'), ps: pick('psTTM'),
    eps: pick('epsTTM') ?? pick('epsBasicExclExtraItemsTTM'), roe: pick('roeTTM'), roa: pick('roaTTM'),
    netMargin: pick('netProfitMarginTTM'), grossMargin: pick('grossMarginTTM'), opMargin: pick('operatingMarginTTM'),
    debtEquity: pick('totalDebt/totalEquityQuarterly') ?? pick('totalDebt/totalEquityAnnual'), currentRatio: pick('currentRatioQuarterly') ?? pick('currentRatioAnnual'),
    revGrowth: pick('revenueGrowthTTMYoy'), epsGrowth: pick('epsGrowthTTMYoy'), beta: pick('beta'),
    divYield: pick('dividendYieldIndicatedAnnual') ?? pick('currentDividendYieldTTM'), mcap: pick('marketCapitalization'),
    hi52: pick('52WeekHigh'), lo52: pick('52WeekLow'), fcfShare: pick('freeCashFlowPerShareTTM') ?? pick('cashFlowPerShareTTM'),
  };
}
/* Finnhub insider: { data: [ {name, share, change, filingDate, transactionDate, transactionCode, transactionPrice} ] } */
export function parseFinnhubInsider(json) {
  const d = json && Array.isArray(json.data) ? json.data : null;
  if (!d) throw new Error('Finnhub: data insider tidak ada');
  return d.map(x => ({
    name: x.name || '', shares: num(x.share), change: num(x.change), filed: x.filingDate || null, date: x.transactionDate || null,
    code: x.transactionCode || '', price: num(x.transactionPrice),
  }));
}
/* ringkasan aktivitas insider (Form 4): P = beli di pasar, S = jual di pasar. Kode lain (opsi, hibah) tidak dihitung sebagai sinyal. */
export function insiderSignal(rows, days = 180, now = Date.now()) {
  const cut = now - days * 86400e3;
  let buy = 0, sell = 0, nb = 0, ns = 0;
  for (const r of rows) {
    const t = Date.parse(r.date || r.filed || '');
    if (!Number.isFinite(t) || t < cut) continue;
    const val = Math.abs((r.change || 0) * (r.price || 0));
    if (r.code === 'P') { buy += val; nb++; } else if (r.code === 'S') { sell += val; ns++; }
  }
  let label = 'Netral';
  if (nb + ns === 0) label = 'Tidak ada transaksi pasar';
  else if (buy > sell * 2 && nb >= 2) label = 'Membeli';
  else if (sell > buy * 2) label = 'Menjual';
  else label = 'Campuran';
  return { label, buyValue: buy, sellValue: sell, buys: nb, sells: ns, days };
}
/* Finnhub earnings: [ {actual, estimate, period, surprise, surprisePercent, symbol} ] */
export function parseFinnhubEarnings(arr) {
  if (!Array.isArray(arr)) throw new Error('Finnhub: format earnings tidak dikenal');
  return arr.map(e => ({ period: e.period, actual: num(e.actual), estimate: num(e.estimate), surprise: num(e.surprise), surprisePct: num(e.surprisePercent) }));
}
export function parseFinnhubProfile(json) {
  if (!json || !json.name) throw new Error('Finnhub: profil tidak ditemukan');
  return { name: json.name, country: json.country, currency: json.currency, exchange: json.exchange, industry: json.finnhubIndustry, ipo: json.ipo, mcap: num(json.marketCapitalization), shares: num(json.shareOutstanding), web: json.weburl, ticker: json.ticker };
}
export function parseFinnhubNews(arr) {
  if (!Array.isArray(arr)) throw new Error('Finnhub: format berita tidak dikenal');
  return arr.slice(0, 60).map(n => ({ url: n.url, title: String(n.headline || '').trim(), seen: n.datetime ? new Date(n.datetime * 1000).toISOString() : null, domain: n.source || '', srcCountry: '', summary: n.summary || '' })).filter(n => n.url && n.title);
}
