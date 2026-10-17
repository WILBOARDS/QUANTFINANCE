/* =====================================================================
   LAYANAN KUOTASI & RIWAYAT untuk SEMUA entitas (saham, ETF, indeks, kripto,
   valas, komoditas, suku bunga), tidak hanya daftar di halaman Pasar.
   Setiap hasil berupa Datum (lihat 01c-datum.js) dengan sumber, waktu, kualitas.
   Urutan sumber per jenis (berhenti di yang pertama berhasil):
     kripto    : Binance (server/langsung) -> cermin binance.vision -> CoinGecko (tertunda)
     saham/ETF : Finnhub (server+kunci) -> Yahoo tidak resmi (bila diaktifkan) -> tidak tersedia
     indeks    : Yahoo tidak resmi (bila diaktifkan) -> FRED harian -> tidak tersedia
     valas     : ExchangeRate-API / Frankfurter (harian) ; indeks dolar dari FRED
     komoditas : Yahoo tidak resmi (bila diaktifkan) -> FRED (harian/bulanan) -> tidak tersedia
     suku bunga: FRED
   Tidak ada angka simulasi di sini, termasuk di Mode Demo.
   ===================================================================== */
const Quotes = (() => {
  const yahooOn = () => !!(Net.server && Net.server.health.yahoo);
  const finnhubOn = () => !!(Net.server && Net.server.health.keys && Net.server.health.keys.finnhub);
  const enc = s => encodeURIComponent(s);
  const NA = (reason, extra = {}) => ({ ok: false, price: datum(null, { reason }), reason, ...extra });

  /* hasil kuotasi standar */
  function quote(price, prev, meta, extra = {}) {
    const p = datum(price, meta);
    const pv = Number.isFinite(prev) && prev !== 0 ? prev : null;
    const calc = { ...meta, quality: p.value === null ? 'unavailable' : 'calculated', formula: 'harga terakhir − penutupan sebelumnya' };
    return {
      ok: p.value !== null, price: p,
      prev: datum(pv, { ...meta, label: 'Penutupan sebelumnya' }),
      change: datum(p.value !== null && pv !== null ? p.value - pv : null, calc),
      changePct: datum(p.value !== null && pv !== null ? (p.value / pv - 1) * 100 : null, { ...calc, unit: '%', formula: '(harga terakhir ÷ penutupan sebelumnya − 1) × 100' }),
      ...extra,
    };
  }

  /* instrumen daftar Pasar: sudah diperbarui MarketData, cukup dibaca */
  function fromInst(e) {
    const i = BY[e.symbol];
    if (!i || !i.real || !Number.isFinite(i.price)) return null;
    return quote(i.price, i.prev, {
      source: i.srcName, quality: i.quality, asOf: i.asOf, fetchedAt: i.recvAt ? new Date(i.recvAt).toISOString() : null,
      currency: e.currency || i.cur, stale: i.quality === 'stale',
    }, { high: datum(i.high), low: datum(i.low), open: datum(i.open), volume: datum(i.volume, { quality: i.quality, source: i.srcName }) });
  }

  async function binance(e) {
    const sym = e.providers.binance;
    let r = await getData('binance', { server: '/api/crypto/binance24h?symbols=' + sym, direct: 'https://api.binance.com/api/v3/ticker/24hr?symbols=' + enc(JSON.stringify([sym])), parse: Parsers.parseBinance24h, ttl: 5000, key: 'q:bn:' + sym });
    if ((!r.ok || r.stale) && !Net.server) {
      const m = await getData('binance', { direct: 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + enc(JSON.stringify([sym])), parse: Parsers.parseBinance24h, ttl: 5000, key: 'q:bnv:' + sym });
      if (m.ok) r = m;
    }
    const t = r.ok && r.data.find(x => x.symbol === sym);
    if (!t) return null;
    const meta = { source: r.source + ' (' + sym + ', dalam USDT)', provider: 'binance', quality: r.stale ? 'stale' : 'live', stale: r.stale, fetchedAt: r.fetchedAt, asOf: t.closeTime ? new Date(t.closeTime).toISOString() : r.fetchedAt, currency: 'USDT', url: r.sourceUrl, via: r.via, home: SOURCE_DEFS.binance.home };
    return quote(t.price, Number.isFinite(t.chgPct) ? t.price / (1 + t.chgPct / 100) : null, meta, {
      high: datum(t.high, meta), low: datum(t.low, meta), open: datum(t.open, meta), volume: datum(t.vol, { ...meta, unit: e.symbol }),
      note: 'Perubahan = 24 jam bergulir (Binance), bukan sejak penutupan harian.',
    });
  }
  async function coingecko(e) {
    const id = e.providers.coingecko; if (!id) return null;
    const c = await getData('coingecko', { server: '/api/crypto/markets?per=50', direct: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h', parse: Parsers.parseCoinGecko, ttl: 60e3, key: 'cgm' });
    const x = c.ok && c.data.find(d => d.id === id);
    if (!x) return null;
    const meta = { source: 'CoinGecko', provider: 'coingecko', quality: c.stale ? 'stale' : 'delayed', stale: c.stale, fetchedAt: c.fetchedAt, asOf: x.updated || c.fetchedAt, currency: 'USD', home: SOURCE_DEFS.coingecko && SOURCE_DEFS.coingecko.home };
    return quote(x.price, Number.isFinite(x.chg24) ? x.price / (1 + x.chg24 / 100) : null, meta, { high: datum(x.high24, meta), low: datum(x.low24, meta), marketCap: datum(x.mcap, { ...meta, unit: 'USD' }) });
  }
  async function finnhub(e) {
    const sym = e.providers.finnhub;
    const r = await getData('finnhub', { server: '/api/quote?symbols=' + enc(sym), ttl: 15e3, key: 'q:fh:' + sym });
    const q = r.ok && r.data && r.data[sym];
    if (!q || !Number.isFinite(q.price)) return null;
    const fresh = q.ts && Date.now() - q.ts < 15 * 60e3;
    const meta = { source: 'Finnhub /quote', provider: 'finnhub', quality: r.stale ? 'stale' : fresh ? 'live' : 'delayed', stale: r.stale, fetchedAt: r.fetchedAt, asOf: q.ts ? new Date(q.ts).toISOString() : null, currency: e.currency || 'USD', home: 'https://finnhub.io/docs/api/quote', via: 'server' };
    return quote(q.price, q.prev, meta, { high: datum(q.high, meta), low: datum(q.low, meta), open: datum(q.open, meta), note: fresh ? '' : 'Harga transaksi terakhir; bursa kemungkinan sedang tutup.' });
  }
  async function yahoo(e) {
    const ys = e.providers.yahoo; if (!ys || !yahooOn()) return null;
    const r = await getData('yahoo', { server: `/api/yahoo/chart?symbol=${enc(ys)}&range=1d&interval=5m`, ttl: 55e3, key: 'yq:' + ys });
    if (!r.ok || !r.data) return null;
    const d = r.data, k = /GBp|ZAc|ILA/.test(d.currency || '') ? 0.01 : 1;
    const n = v => (Number.isFinite(v) ? v * k : null);
    const meta = { source: 'Yahoo ' + ys + ' (tidak resmi)', provider: 'yahoo', quality: r.stale ? 'stale' : 'unofficial', stale: r.stale, fetchedAt: r.fetchedAt, asOf: d.ts ? new Date(d.ts).toISOString() : null, currency: ({ GBp: 'GBP', ZAc: 'ZAR', ILA: 'ILS' })[d.currency] || d.currency || e.currency || '', via: 'server' };   // pence/sen dikonversi ke satuan utama
    return quote(n(d.price), n(d.prev), meta);
  }
  /* seri FRED: nilai terakhir + sebelumnya. Kualitas mengikuti frekuensi seri. */
  async function fred(e, id, invert) {
    if (!Net.server) return null;
    const r = await Fred.get([id], daysAgo(400));
    const s = r.ok && r.series[id];
    if (!s || !s.data || s.data.length < 1) return null;
    const pts = s.data, L = pts[pts.length - 1], P = pts.length > 1 ? pts[pts.length - 2] : null;
    const tf = v => (invert ? 1 / v : v);
    const meta = {
      source: 'FRED · ' + id + (invert ? ' (dibalik 1/x)' : ''), provider: 'fred', quality: fredQuality(id), stale: !!s.stale, fetchedAt: s.fetchedAt || r.fetchedAt,
      asOf: L.date, period: { d: 'harian', w: 'mingguan', m: 'bulanan', q: 'kuartalan', a: 'tahunan' }[(FredMeta[id] || {}).freq] || '', home: 'https://fred.stlouisfed.org/series/' + id,
      unit: e.unit || '', currency: e.type === 'rate' ? '' : (e.currency || ''), via: 'server', formula: invert ? '1 ÷ nilai FRED (arah kutipan dibalik)' : '',
    };
    const q = quote(tf(L.value), P ? tf(P.value) : null, meta, { prevDate: P ? P.date : null });
    if (e.type === 'rate' && P) q.changeBp = datum(Math.round((L.value - P.value) * 100), { ...meta, quality: 'calculated', unit: 'bp', formula: '(nilai terakhir − sebelumnya) × 100' });
    return q;
  }
  async function fxRate(e) {
    const [base, quoteCur] = e.providers.fx;
    const r = await CountryData.fx();
    if (!r.ok || !r.data || !r.data.rates) return null;
    const R = r.data.rates;
    const b = base === 'USD' ? 1 : R[base], q = quoteCur === 'USD' ? 1 : R[quoteCur];
    if (!Number.isFinite(b) || !Number.isFinite(q) || !b) return null;
    const cross = base !== 'USD' && quoteCur !== 'USD';
    const meta = {
      source: r.source, provider: r.provider, quality: r.stale ? 'stale' : cross ? 'calculated' : 'eod', stale: r.stale, fetchedAt: r.fetchedAt, asOf: r.data.asOf,
      currency: quoteCur, home: (r.extra && r.extra.fallback) || r.provider === 'frankfurter' ? SOURCE_DEFS.frankfurter.home : SOURCE_DEFS.fx.home, via: r.via,
      formula: base === 'USD' ? `kurs ${quoteCur} per 1 USD` : quoteCur === 'USD' ? `1 ÷ kurs ${base} per USD` : `kurs ${quoteCur}/USD ÷ kurs ${base}/USD (silang)`,
      period: 'harian',
    };
    return quote(q / b, null, meta, { note: 'Kurs referensi harian; perubahan harian tidak tersedia dari sumber ini.' });
  }

  /* ---------- kuotasi ---------- */
  async function get(e) {
    if (!e) return NA('Entitas tidak dikenal');
    const P = e.providers || {};
    try {
      const fromList = fromInst(e);
      if (fromList && fromList.price.quality !== 'stale') return fromList;
      switch (e.type) {
        case 'crypto': return (await binance(e)) || (await coingecko(e)) || fromList || NA('Binance dan CoinGecko tidak bisa diakses.');
        case 'stock': case 'etf': {
          if (P.finnhub && finnhubOn()) { const q = await finnhub(e); if (q) return q; }
          const y = await yahoo(e); if (y) return y;
          if (fromList) return fromList;
          return NA(P.finnhub
            ? (Net.server ? 'Harga butuh FINNHUB_API_KEY di .env server (gratis di finnhub.io), atau Yahoo tidak resmi (ENABLE_UNOFFICIAL_YAHOO=1).' : 'Harga saham/ETF butuh server lokal (npm start) dengan kunci Finnhub.')
            : 'Belum ada sumber gratis resmi untuk harga bursa ini. Yahoo tidak resmi bisa diaktifkan di server (ENABLE_UNOFFICIAL_YAHOO=1).');
        }
        case 'index': return (await yahoo(e)) || (P.fred ? await fred(e, P.fred) : null) || fromList || NA(Net.server ? 'Indeks ini hanya tersedia lewat Yahoo tidak resmi (ENABLE_UNOFFICIAL_YAHOO=1).' : 'Indeks butuh server lokal (FRED/Yahoo).');
        case 'fx':
          if (P.fx) { const q = await fxRate(e); if (q) return q; }
          if (P.fred) { const q = await fred(e, P.fred, P.fredInvert); if (q) return q; }
          return NA('Sumber kurs tidak bisa diakses.');
        case 'commodity': return (await yahoo(e)) || (P.fred ? await fred(e, P.fred) : null) || NA(P.fred ? (Net.server ? 'FRED tidak bisa diakses.' : 'Komoditas dari FRED butuh server lokal (npm start).') : 'Tidak ada sumber gratis resmi untuk komoditas ini (FRED menghapus seri emas/perak LBMA). Yahoo tidak resmi bisa diaktifkan di server.');
        case 'rate': return (P.fred ? await fred(e, P.fred) : null) || NA(Net.server ? 'FRED tidak bisa diakses untuk seri ini.' : 'Suku bunga dari FRED butuh server lokal (npm start).');
        default: return NA('Jenis ' + e.type + ' tidak punya harga.');
      }
    } catch (err) {
      ErrorLog.report('provider', 'Kuotasi ' + (e.symbol || e.id) + ': ' + err.message, err.stack);
      return NA('Kesalahan saat mengambil harga: ' + err.message);
    }
  }

  /* ---------- riwayat untuk grafik ---------- */
  const TF_DAYS = { '5D': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 1830, MAX: 36500 };
  const ytdStart = () => Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000;
  /* potong bar sesuai timeframe; YTD = sejak 1 Januari tahun ini */
  function cut(bars, tf) {
    if (tf === 'YTD') return bars.filter(b => b.time >= ytdStart());
    if (TF_DAYS[tf] && tf !== 'MAX') { const t0 = Date.now() / 1000 - TF_DAYS[tf] * 86400; return bars.filter(b => b.time >= t0); }
    return bars;
  }
  const BASE_TF = { '1D': '1D', '5D': '1M', '1M': '1M', '3M': '3M', '6M': '6M', YTD: '1Y', '1Y': '1Y', '5Y': '5Y', MAX: '5Y' };
  const KL = { '1D': ['5m', 288], '5D': ['1h', 120], '1M': ['4h', 180], '3M': ['1d', 90], '6M': ['1d', 180], YTD: ['1d', 365], '1Y': ['1d', 365], '5Y': ['1w', 260], MAX: ['1w', 1000] };
  const YH = { '1D': ['1d', '5m'], '5D': ['5d', '30m'], '1M': ['1mo', '1d'], '3M': ['3mo', '1d'], '6M': ['6mo', '1d'], YTD: ['1y', '1d'], '1Y': ['1y', '1d'], '5Y': ['5y', '1wk'], MAX: ['max', '1mo'] };
  const NO = (error, extra = {}) => ({ bars: [], quality: 'unavailable', error, ...extra });

  async function history(e, tf) {
    if (!e) return NO('Entitas tidak dikenal');
    const P = e.providers || {};
    try {
      const inst = BY[e.symbol];
      if (inst && ['stock', 'index', 'crypto'].includes(e.type) && (inst.bn || YAHOO_SYM[inst.sym] || FRED_INDEX[inst.sym])) {
        const h = await MarketData.history(inst, BASE_TF[tf] || '1Y');
        if (h && h.bars && h.bars.length) return { ...h, bars: cut(h.bars.map(b => ({ ...b })), tf), tf };
      }
      if (e.type === 'crypto' && P.binance) {
        const [iv, lim] = KL[tf] || KL['1Y'];
        let r = await getData('binance', { server: `/api/crypto/klines?symbol=${P.binance}&interval=${iv}&limit=${lim}`, direct: `https://api.binance.com/api/v3/klines?symbol=${P.binance}&interval=${iv}&limit=${lim}`, parse: Parsers.parseBinanceKlines, ttl: iv.endsWith('m') ? 30e3 : 5 * 60e3, key: `kl:${P.binance}:${iv}:${lim}` });
        if ((!r.ok || r.stale) && !Net.server) { const m = await getData('binance', { direct: `https://data-api.binance.vision/api/v3/klines?symbol=${P.binance}&interval=${iv}&limit=${lim}`, parse: Parsers.parseBinanceKlines, ttl: 60e3, key: `klv:${P.binance}:${iv}:${lim}` }); if (m.ok) r = m; }
        if (r.ok && r.data.length) return { bars: cut(r.data.map(b => ({ ...b })), tf), quality: r.stale ? 'stale' : 'live', source: 'Binance klines ' + iv + ' (' + P.binance + ')', fetchedAt: r.fetchedAt, tf, interval: iv };
      }
      if (P.yahoo && yahooOn()) {
        const [range, interval] = YH[tf] || YH['1Y'];
        const r = await getData('yahoo', { server: `/api/yahoo/chart?symbol=${enc(P.yahoo)}&range=${range}&interval=${interval}`, ttl: interval.endsWith('m') ? 60e3 : 15 * 60e3, key: `yh:${P.yahoo}:${range}:${interval}` });
        if (r.ok && r.data && r.data.bars.length) {
          const k = /GBp|ZAc|ILA/.test(r.data.currency || '') ? 0.01 : 1;
          return { bars: cut(r.data.bars.map(b => ({ ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k })), tf), quality: r.stale ? 'stale' : 'unofficial', source: 'Yahoo ' + P.yahoo + ' (tidak resmi), interval ' + interval, fetchedAt: r.fetchedAt, tf, interval };
        }
      }
      if (P.fred && Net.server) {
        if (tf === '1D' || tf === '5D') return NO('FRED hanya punya data harian atau lebih jarang; grafik intraday tidak tersedia untuk ' + e.symbol + '.');
        const days = TF_DAYS[tf] || 400;
        const r = await Fred.get([P.fred], daysAgo(Math.min(days, 36500)), days > 2000 ? 'm' : undefined);
        const s = r.ok && r.series[P.fred];
        if (s && s.data && s.data.length) {
          const inv = !!P.fredInvert;
          const bars = s.data.map(p => { const v = inv ? 1 / p.value : p.value; const t = Date.parse(p.date) / 1000; return { time: t, open: v, high: v, low: v, close: v, volume: 0 }; });
          return { bars: cut(bars, tf), quality: s.stale ? 'stale' : fredQuality(P.fred), source: 'FRED ' + P.fred + (inv ? ' (dibalik 1/x)' : '') + ' (hanya nilai penutupan)', closeOnly: true, fetchedAt: s.fetchedAt, tf };
        }
      }
      return NO(e.type === 'fx' && !P.fred ? 'Riwayat kurs ini tidak tersedia dari sumber gratis resmi (ExchangeRate-API hanya memberi kurs terbaru).'
        : (e.type === 'stock' || e.type === 'etf') ? (yahooOn() ? 'Yahoo tidak mengembalikan riwayat untuk simbol ini.' : 'Riwayat candle Finnhub berbayar. Aktifkan Yahoo tidak resmi di server (ENABLE_UNOFFICIAL_YAHOO=1) untuk grafik riwayat.')
          : Net.server ? 'Tidak ada sumber riwayat untuk ' + (e.symbol || e.name) + '.' : 'Riwayat ini butuh server lokal (npm start).');
    } catch (err) {
      ErrorLog.report('provider', 'Riwayat ' + (e.symbol || e.id) + ' ' + tf + ': ' + err.message, err.stack);
      return NO('Kesalahan saat mengambil riwayat: ' + err.message);
    }
  }
  return { get, history, TIMEFRAMES: ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'] };
})();
