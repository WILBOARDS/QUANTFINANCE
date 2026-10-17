/* =====================================================================
   HARGA NYATA untuk daftar kanan, pita, peta, dan grafik.
   Urutan sumber:
   - Kripto : Binance (langsung/server) -> CoinGecko -> tidak tersedia
   - Saham AS: Finnhub (server + kunci) -> Yahoo tidak resmi (bila diaktifkan) -> tidak tersedia
   - Saham non-AS dan indeks: Yahoo tidak resmi (bila diaktifkan); S&P 500 dan Nikkei juga
     dari FRED (harian, tanpa kunci lewat server) -> tidak tersedia
   Simulasi v1 hanya dipakai di MODE DEMO, dan hanya untuk aset tanpa sumber nyata.
   ===================================================================== */
const YAHOO_SYM = {
  SPX: '^GSPC', TSX: '^GSPTSE', IBOV: '^BVSP', FTSE: '^FTSE', DAX: '^GDAXI', CAC: '^FCHI', NKY: '^N225', HSI: '^HSI',
  SSEC: '000001.SS', KOSPI: '^KS11', TAIEX: '^TWII', SENSEX: '^BSESN', IHSG: '^JKSE', STI: '^STI', ASX: '^AXJO', JSE: '^J200.JO', TASI: '^TASI.SR',
  BBCA: 'BBCA.JK', BBRI: 'BBRI.JK', BMRI: 'BMRI.JK', TLKM: 'TLKM.JK', ASII: 'ASII.JK', UNVR: 'UNVR.JK', GOTO: 'GOTO.JK',
  '7203': '7203.T', '0700': '0700.HK', '005930': '005930.KS', '2330': '2330.TW', BHP: 'BHP.AX', ASML: 'ASML.AS', SAP: 'SAP.DE',
  MC: 'MC.PA', SHEL: 'SHEL.L', AZN: 'AZN.L', VALE: 'VALE', AAPL: 'AAPL', MSFT: 'MSFT', NVDA: 'NVDA', AMZN: 'AMZN', GOOGL: 'GOOGL', META: 'META', TSLA: 'TSLA', JPM: 'JPM',
};
const FRED_INDEX = { SPX: 'SP500', NKY: 'NIKKEI225' };
const COINGECKO_ID = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin' };
const US_STOCKS = STOCKS.filter(i => i.type === 'stock' && i.mkt === 'US').map(i => i.sym).concat(['VALE']);

/* tanpa mode demo: kosongkan harga buatan v1 supaya tidak ada angka palsu yang tampil */
for (const i of INSTS) {
  i.real = false; i.quality = State.demo ? 'sim' : 'unavailable'; i.srcName = State.demo ? 'Simulasi (mode demo)' : ''; i.asOf = null;
  if (!State.demo) {
    i.price = i.prev = i.open = i.high = i.low = NaN; i.volume = NaN;
    i.spark = []; i.intra = []; i.daily = [];
  }
}

/* dasar perubahan harga yang JUJUR: "hari ini" hanya untuk data sesi berjalan.
   Harga penutupan FRED = perubahan penutupan terakhir; kripto = 24 jam bergulir. */
function chgBasis(i) {
  if (!i || !i.real) return i && i.quality === 'sim' ? 'simulasi, mode demo' : 'tanpa data nyata';
  if (i.type === 'crypto') return '24 jam';
  if (i.quality === 'eod') return 'penutupan ' + (i.asOf ? fmtDate(i.asOf) : 'terakhir');
  if (i.quality === 'stale') return 'data basi';
  return 'hari ini';
}
/* dua harga bisa dibandingkan perubahannya hanya bila sama-sama data sesi berjalan dan waktunya dekat */
function comparableMove(a, b) {
  const ok = i => i && i.real && !['eod', 'stale', 'sim', 'unavailable'].includes(i.quality) && i.asOf;
  return ok(a) && ok(b) && Math.abs(Date.parse(a.asOf) - Date.parse(b.asOf)) < 18 * 3600e3;
}
const MarketData = (() => {
  const st = { crypto: 'idle', cryptoSrc: null, us: 'idle', yahoo: 'idle', fred: 'idle', errors: {} };
  let cryptoTimer = null, usTimer = null, yhTimer = null, cryptoGen = 0;
  const histCache = new Map();

  const RANK = { Binance: 4, Finnhub: 4, CoinGecko: 3, 'Yahoo (tidak resmi)': 2 };
  const rankOf = name => RANK[name] ?? (/^FRED/.test(name || '') ? 1 : 0);
  function apply(inst, q) {
    if (!Number.isFinite(q.price) || q.price <= 0) return false;
    /* sumber berprioritas lebih rendah tidak menimpa data segar dari sumber lebih tinggi */
    if (inst.real && inst.quality !== 'stale' && rankOf(inst.srcName) > rankOf(q.srcName) && inst.asOf && Date.now() - Date.parse(inst.asOf) < 10 * 60e3) return false;
    /* data nyata pertama: buang semua angka simulasi (mode demo) supaya buka/tertinggi/terendah
       buatan tidak tercampur dengan harga asli */
    if (!inst.real) { inst.spark = []; inst.open = inst.high = inst.low = inst.prev = inst.volume = NaN; inst.intra = []; inst.daily = []; }
    inst.real = true; inst.live = q.quality === 'live';
    inst.price = q.price;
    inst.prev = Number.isFinite(q.prev) ? q.prev : inst.prev;
    inst.open = Number.isFinite(q.open) ? q.open : inst.open;
    inst.high = Number.isFinite(q.high) ? q.high : Math.max(Number.isFinite(inst.high) ? inst.high : q.price, q.price);
    inst.low = Number.isFinite(q.low) ? q.low : Math.min(Number.isFinite(inst.low) ? inst.low : q.price, q.price);
    if (Number.isFinite(q.volume)) inst.volume = q.volume;
    inst.quality = q.quality; inst.srcName = q.srcName; inst.asOf = q.asOf || new Date().toISOString(); inst.recvAt = Date.now();
    if (q.dp !== undefined) inst.dp = q.dp;
    if (!inst.spark.length || inst.spark[inst.spark.length - 1] !== q.price) { inst.spark.push(q.price); if (inst.spark.length > 40) inst.spark.shift(); }
    return true;
  }
  function unset(inst, why) {
    if (inst.real) return;                  // jangan hapus data nyata terakhir karena satu kegagalan
    inst.quality = State.demo ? 'sim' : 'unavailable';
    inst.srcName = State.demo ? 'Simulasi (mode demo)' : why || '';
  }

  /* ---------------- kesegaran ----------------
     Label "Live" hanya benar selama data terus datang. Bila sumber berhenti (gagal, polling
     dimatikan, tab disembunyikan), harga terakhir tetap tampil tetapi diberi label "Basi". */
  const STALE_AFTER = { Binance: 30e3, CoinGecko: 180e3, Finnhub: 90e3, 'Yahoo (tidak resmi)': 360e3 };
  function sweep() {
    const changed = [];
    for (const i of INSTS) {
      if (!i.real || i.quality === 'stale') continue;
      const lim = STALE_AFTER[i.srcName];
      if (lim && Date.now() - (i.recvAt || 0) > lim) { i.quality = 'stale'; i.live = false; changed.push(i); }
    }
    if (changed.length) { bus.emit('tick', changed); updateMode(); }
  }
  setInterval(sweep, 5000);

  /* ---------------- kripto ---------------- */
  const CR = STOCKS.filter(i => i.bn);
  async function pollCrypto() {
    const gen = cryptoGen;
    const syms = CR.map(i => i.bn);
    const enc = encodeURIComponent(JSON.stringify(syms));
    let r = await getData('binance', {
      server: '/api/crypto/binance24h?symbols=' + syms.join(','), direct: `https://api.binance.com/api/v3/ticker/24hr?symbols=${enc}`,
      parse: Parsers.parseBinance24h, ttl: 3000, key: 'bn24',
    });
    /* api.binance.com gagal (atau hanya ada salinan basi) tanpa server: coba cermin resmi data-api.binance.vision */
    if ((!r.ok || r.stale) && !Net.server) r = await getData('binance', { direct: `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${enc}`, parse: Parsers.parseBinance24h, ttl: 3000, key: 'bn24v' });
    if (gen !== cryptoGen) return st.crypto;          // polling sudah dihentikan/dimulai ulang selama menunggu
    const changed = [];
    if (r.ok && !r.stale) {
      for (const t of r.data) {
        const i = CR.find(x => x.bn === t.symbol); if (!i) continue;
        const dp = t.price < 10 ? 4 : 2;
        if (apply(i, { price: t.price, prev: t.price / (1 + (t.chgPct || 0) / 100), open: t.open, high: t.high, low: t.low, volume: t.vol, quality: 'live', srcName: 'Binance', asOf: t.closeTime ? new Date(t.closeTime).toISOString() : r.fetchedAt, dp })) changed.push(i);
      }
      st.crypto = 'ok'; st.cryptoSrc = 'Binance';
    } else {
      const c = await getData('coingecko', {
        server: '/api/crypto/markets?per=50', direct: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h',
        parse: Parsers.parseCoinGecko, ttl: 60e3, key: 'cgm',
      });
      if (gen !== cryptoGen) return st.crypto;
      if (c.ok) {
        for (const i of CR) {
          const x = c.data.find(d => d.id === COINGECKO_ID[i.sym]); if (!x) continue;
          if (apply(i, { price: x.price, prev: Number.isFinite(x.chg24) ? x.price / (1 + x.chg24 / 100) : NaN, high: x.high24, low: x.low24, volume: x.vol / x.price, quality: c.stale ? 'stale' : 'delayed', srcName: 'CoinGecko', asOf: x.updated || c.fetchedAt })) changed.push(i);
        }
        st.crypto = c.stale ? 'stale' : 'fallback'; st.cryptoSrc = 'CoinGecko (cadangan, tertunda)';
      } else {
        st.crypto = 'fail'; st.errors.crypto = (r.error || '') + ' | ' + (c.error || '');
        CR.forEach(i => unset(i, 'Binance dan CoinGecko tidak bisa diakses'));
      }
    }
    if (changed.length) bus.emit('tick', changed);
    updateMode();
    return st.crypto;
  }

  /* ---------------- saham AS: Finnhub lewat server ---------------- */
  async function pollUS() {
    if (!Net.server || !Net.server.health.keys.finnhub) { st.us = 'no-key'; return; }
    const r = await getData('finnhub', { server: '/api/quote?symbols=' + US_STOCKS.join(','), ttl: 10e3, key: 'fhq' });
    const changed = [];
    let got = 0;
    if (r.ok) {
      for (const [sym, q] of Object.entries(r.data || {})) {
        const i = BY[sym]; if (!i || !q) continue;
        /* Finnhub memberi harga transaksi terakhir. Di luar jam bursa itu harga lama: label "Tertunda", bukan "Live". */
        const asOf = q.ts ? new Date(q.ts).toISOString() : r.fetchedAt;
        const fresh = q.ts && Date.now() - q.ts < 15 * 60e3;
        const quality = r.stale || q.stale ? 'stale' : fresh ? 'live' : 'delayed';
        if (Number.isFinite(q.price) && q.price > 0) got++;
        if (apply(i, { price: q.price, prev: q.prev, open: q.open, high: q.high, low: q.low, quality, srcName: 'Finnhub', asOf })) changed.push(i);
      }
      /* server menjawab ok tapi tanpa satu pun harga (kunci salah/dicabut, Finnhub mati) = gagal */
      if (!got) { st.us = 'fail'; st.errors.us = Object.values((r.extra && r.extra.errors) || {})[0] || 'Finnhub tidak mengembalikan harga'; }
      else st.us = r.stale ? 'stale' : 'ok';
    } else { st.us = 'fail'; st.errors.us = r.error; }
    if (changed.length) bus.emit('tick', changed);
    updateMode();
  }

  /* ---------------- indeks harian dari FRED (lewat server, tanpa kunci) ---------------- */
  async function loadFredIndices() {
    if (!Net.server) return;
    const ids = Object.values(FRED_INDEX).join(',');
    const start = new Date(Date.now() - 6 * 365 * 86400e3).toISOString().slice(0, 10);
    const r = await getData('fred', { server: `/api/fred?series=${ids}&start=${start}`, ttl: 3 * 3600e3, key: 'fredidx', persist: false });
    if (!r.ok) { st.fred = 'fail'; st.errors.fred = r.error; return; }
    const changed = [];
    for (const [sym, sid] of Object.entries(FRED_INDEX)) {
      const s = r.data[sid];
      if (!s || !s.data || s.data.length < 2) continue;
      const pts = s.data, last = pts[pts.length - 1], prev = pts[pts.length - 2];
      const i = BY[sym];
      histCache.set('fred:' + sym, pts); histCache.set('fredStale:' + sym, !!(r.stale || s.stale));
      if (i.real && i.srcName && !/FRED/.test(i.srcName)) continue;   // sudah ada sumber lebih segar
      if (apply(i, { price: last.value, prev: prev.value, open: NaN, high: NaN, low: NaN, quality: r.stale || s.stale ? 'stale' : 'eod', srcName: 'FRED ' + sid + ' (penutupan ' + last.date + ')', asOf: last.date + 'T21:00:00Z' })) {
        i.spark = pts.slice(-40).map(p => p.value);
        changed.push(i);
      }
    }
    st.fred = 'ok';
    if (changed.length) bus.emit('tick', changed);
    updateMode();
  }

  /* ---------------- Yahoo tidak resmi (hanya bila pemilik mengaktifkan di server) ---------------- */
  async function pollYahoo() {
    if (!Net.server || !Net.server.health.yahoo) { st.yahoo = 'off'; return; }
    st.yahoo = 'loading';
    /* lewati saham AS hanya bila saham ITU punya harga Finnhub yang masih segar */
    const hasFinnhub = inst => inst.srcName === 'Finnhub' && inst.quality !== 'stale';
    const changed = [];
    const order = [BY[State.sel], ...INSTS.filter(i => i.type === 'index'), ...INSTS].filter((x, k, a) => x && a.indexOf(x) === k);
    for (const inst of order) {
      if (inst.type === 'crypto') continue;
      if (US_STOCKS.includes(inst.sym) && hasFinnhub(inst)) continue;
      const ys = YAHOO_SYM[inst.sym]; if (!ys) continue;
      const r = await getData('yahoo', { server: `/api/yahoo/chart?symbol=${encodeURIComponent(ys)}&range=1d&interval=5m`, ttl: 55e3, key: 'yq:' + ys });
      if (!r.ok || !r.data) continue;
      const d = r.data, k = /GBp|ZAc|ILA/.test(d.currency || '') ? 0.01 : 1;
      const bars = d.bars.map(b => ({ ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k }));
      const hi = bars.length ? Math.max(...bars.map(b => b.high)) : NaN, lo = bars.length ? Math.min(...bars.map(b => b.low)) : NaN;
      const num = v => (Number.isFinite(v) ? v * k : NaN);       // null * k = 0 palsu; harus NaN
      if (apply(inst, { price: num(d.price), prev: num(d.prev), open: bars[0] ? bars[0].open : NaN, high: hi, low: lo, volume: bars.reduce((a, b) => a + (b.volume || 0), 0), quality: r.stale ? 'stale' : 'unofficial', srcName: 'Yahoo (tidak resmi)', asOf: d.ts ? new Date(d.ts).toISOString() : r.fetchedAt })) {
        if (bars.length > 2) inst.spark = bars.slice(-40).map(b => b.close);
        bus.emit('tick', [inst]);                 // tampilkan segera, jangan tunggu semua simbol
        changed.push(inst);
      }
    }
    st.yahoo = 'ok';
    updateMode();
  }

  /* ---------------- riwayat untuk grafik ---------------- */
  const KL = { '1D': ['5m', 288], '1M': ['4h', 180], '3M': ['1d', 90], '6M': ['1d', 180], '1Y': ['1d', 365], '5Y': ['1w', 260] };
  const CG_DAYS = { '1D': 1, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 365 };
  const YH_RANGE = { '1D': ['1d', '5m'], '1M': ['1mo', '1d'], '3M': ['3mo', '1d'], '6M': ['6mo', '1d'], '1Y': ['1y', '1d'], '5Y': ['5y', '1wk'] };
  const TF_DAYS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 1830 };
  async function history(inst, tf) {
    await Net.ready();
    if (inst.type === 'crypto' && inst.bn) {
      const [iv, lim] = KL[tf];
      const r = await getData('binance', {
        server: `/api/crypto/klines?symbol=${inst.bn}&interval=${iv}&limit=${lim}`, direct: `https://api.binance.com/api/v3/klines?symbol=${inst.bn}&interval=${iv}&limit=${lim}`,
        parse: Parsers.parseBinanceKlines, ttl: iv.endsWith('m') ? 30e3 : 5 * 60e3, key: `kl:${inst.bn}:${iv}:${lim}`,
      });
      if (r.ok && r.data.length && !r.stale) return { bars: r.data, quality: 'live', source: 'Binance klines ' + iv };
      if (!Net.server) {
        const m = await getData('binance', { direct: `https://data-api.binance.vision/api/v3/klines?symbol=${inst.bn}&interval=${iv}&limit=${lim}`, parse: Parsers.parseBinanceKlines, ttl: iv.endsWith('m') ? 30e3 : 5 * 60e3, key: `klv:${inst.bn}:${iv}:${lim}` });
        if (m.ok && m.data.length && !m.stale) return { bars: m.data, quality: 'live', source: 'Binance klines ' + iv + ' (data-api.binance.vision)' };
      }
      if (r.ok && r.data.length) return { bars: r.data, quality: 'stale', source: 'Binance klines ' + iv + ' (salinan lama)' };
      const id = COINGECKO_ID[inst.sym];
      const c = await getData('coingecko', { server: `/api/crypto/ohlc?id=${id}&days=${CG_DAYS[tf]}`, direct: `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${CG_DAYS[tf]}`, parse: Parsers.parseCoinGeckoOhlc, ttl: 10 * 60e3, key: `cgo:${id}:${CG_DAYS[tf]}` });
      if (c.ok && c.data.length) return { bars: c.data, quality: c.stale ? 'stale' : 'delayed', source: 'CoinGecko OHLC (tanpa volume)' + (tf === '5Y' ? ', maksimal 1 tahun' : '') };
      return { bars: [], quality: 'unavailable', error: 'Binance: ' + (r.error || '-') + ' | CoinGecko: ' + (c.error || '-') };
    }
    if (Net.server && Net.server.health.yahoo && YAHOO_SYM[inst.sym]) {
      const [range, interval] = YH_RANGE[tf];
      const ys = YAHOO_SYM[inst.sym];
      const r = await getData('yahoo', { server: `/api/yahoo/chart?symbol=${encodeURIComponent(ys)}&range=${range}&interval=${interval}`, ttl: interval.endsWith('m') ? 60e3 : 15 * 60e3, key: `yh:${ys}:${range}:${interval}` });
      if (r.ok && r.data.bars.length) {
        const k = /GBp|ZAc|ILA/.test(r.data.currency || '') ? 0.01 : 1;
        return { bars: r.data.bars.map(b => ({ ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k })), quality: r.stale ? 'stale' : 'unofficial', source: 'Yahoo ' + ys + ' (tidak resmi)' };
      }
    }
    if (FRED_INDEX[inst.sym] && Net.server) {
      if (!histCache.has('fred:' + inst.sym)) await loadFredIndices();
      const pts = histCache.get('fred:' + inst.sym);
      if (pts && pts.length && tf !== '1D') {
        const cut = Date.now() - TF_DAYS[tf] * 86400e3;
        const bars = pts.filter(p => Date.parse(p.date) >= cut).map(p => { const t = Date.parse(p.date) / 1000; return { time: t, open: p.value, high: p.value, low: p.value, close: p.value, volume: 0 }; });
        return { bars, quality: histCache.get('fredStale:' + inst.sym) ? 'stale' : 'eod', source: 'FRED ' + FRED_INDEX[inst.sym] + ' (hanya harga penutupan)', closeOnly: true };
      }
      if (tf === '1D') return { bars: [], quality: 'unavailable', error: 'FRED hanya punya data penutupan harian; grafik intraday butuh Yahoo (tidak resmi).' };
    }
    if (inst.type === 'stock' && US_STOCKS.includes(inst.sym) && Net.server && Net.server.health.keys.finnhub)
      return { bars: [], quality: 'unavailable', error: 'Harga terkini dari Finnhub tersedia, tapi riwayat candle Finnhub berbayar. Aktifkan Yahoo tidak resmi untuk grafik riwayat.' };
    return null;
  }

  /* ---------------- lencana mode di pojok kanan atas ---------------- */
  function updateMode() {
    const chip = $('#modeChip'), txt = $('#modeText');
    const parts = [];
    const crStale = CR.some(i => i.real && i.quality === 'stale');
    parts.push(st.crypto === 'ok' && !crStale ? 'kripto live' : st.crypto === 'fallback' ? 'kripto tertunda' : st.crypto === 'off' ? 'kripto dijeda' : st.crypto === 'fail' ? 'kripto n/a' : st.crypto === 'stale' || crStale ? 'kripto basi' : 'kripto …');
    const stocksReal = STOCKS.filter(i => i.type === 'stock' && i.real).length, nStocks = STOCKS.filter(i => i.type === 'stock').length;
    parts.push(stocksReal ? `saham ${stocksReal}/${nStocks} nyata` : State.demo ? 'saham simulasi' : 'saham n/a');
    txt.textContent = parts.join(', ');
    const crOk = st.crypto === 'ok' && !crStale;
    chip.dataset.state = crOk && stocksReal ? 'live' : crOk || st.crypto === 'fallback' ? 'mixed' : 'sim';
    chip.title = 'Kripto: ' + (st.cryptoSrc || 'belum') + '. Saham AS: ' + st.us + '. Yahoo: ' + st.yahoo + '. FRED: ' + st.fred + (State.demo ? '. MODE DEMO aktif.' : '');
  }

  return {
    st, history, updateMode,
    startCrypto() { if (cryptoTimer) return; cryptoGen++; cryptoTimer = setInterval(() => { if (!document.hidden) pollCrypto(); }, 5000); pollCrypto(); },
    stopCrypto() {
      clearInterval(cryptoTimer); cryptoTimer = null; cryptoGen++; st.crypto = 'off';
      /* harga terakhir tetap tampil, tetapi bukan lagi "Live" */
      const changed = CR.filter(i => i.real && i.quality !== 'stale');
      changed.forEach(i => { i.quality = 'stale'; i.live = false; });
      if (changed.length) bus.emit('tick', changed);
      updateMode();
    },
    async startServerSources() {
      if (!Net.server) return;
      /* Yahoo menunggu Finnhub selesai: kalau Finnhub berhasil, saham AS tidak diambil dari Yahoo */
      const usThenYahoo = pollUS().then(() => (Net.server && Net.server.health.yahoo ? pollYahoo() : null));
      const jobs = [usThenYahoo, loadFredIndices()];
      if (!usTimer) usTimer = setInterval(() => { if (!document.hidden) pollUS(); }, 20000);
      if (Net.server.health.yahoo && !yhTimer) yhTimer = setInterval(() => { if (!document.hidden && st.yahoo !== 'loading') pollYahoo(); }, 90000);
      await Promise.allSettled(jobs);
    },
  };
})();
/* nama lama dari v1 dipertahankan supaya pengaturan "Harga kripto live" tetap jalan */
const Live = { start: () => MarketData.startCrypto(), stop: () => MarketData.stopCrypto() };
