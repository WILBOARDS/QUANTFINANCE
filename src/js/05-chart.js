/* =====================================================================
   GRAFIK HARGA (TradingView Lightweight Charts v4, ditanam di file ini)
   ===================================================================== */
const ChartView = (() => {
  const el = $('#chart');
  const C = { up: '#34d1a4', down: '#ff6f61', brass: '#e0b15a', blue: '#6fb1ff', ink2: '#93a8bf', grid: 'rgba(23,49,74,0.55)' };
  const TF_N = { '1M': 22, '3M': 64, '6M': 128, '1Y': 256, '5Y': 1300 };
  let chart, main, vol, ma20, ma50;
  let cur = null, bars = [], byTime = new Map(), req = 0, range52 = null;

  function init() {
    chart = LightweightCharts.createChart(el, {
      autoSize: true,
      localization: { locale: 'en-US' },
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: C.ink2, fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: 11 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.2 } },
      timeScale: { borderVisible: false, timeVisible: false, secondsVisible: false, rightOffset: 4, fixLeftEdge: true },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: C.brass, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#8e7138' },
        horzLine: { color: C.brass, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#8e7138' },
      },
      handleScale: { axisPressedMouseMove: true },
    });
    chart.subscribeCrosshairMove(p => {
      if (!bars.length) return;
      const b = p && p.time !== undefined ? byTime.get(p.time) : null;
      legend(b || bars[bars.length - 1]);
    });
  }

  function buildSeries() {
    for (const s of [vol, main, ma20, ma50]) if (s) chart.removeSeries(s);
    const dp = cur.dp;
    const pf = { type: 'price', precision: dp, minMove: Math.pow(10, -dp) };
    vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    if (State.type === 'candle') {
      main = chart.addCandlestickSeries({ upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down, priceFormat: pf });
    } else if (State.type === 'area') {
      main = chart.addAreaSeries({ lineColor: C.brass, topColor: 'rgba(224,177,90,0.28)', bottomColor: 'rgba(224,177,90,0)', lineWidth: 2, priceFormat: pf });
    } else {
      main = chart.addLineSeries({ color: C.brass, lineWidth: 2, priceFormat: pf });
    }
    const maOpt = color => ({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: State.ma, priceFormat: pf });
    ma20 = chart.addLineSeries(maOpt(C.brass));
    ma50 = chart.addLineSeries(maOpt(C.blue));
    if (State.type === 'line' || State.type === 'area') { ma20.applyOptions({ color: C.blue }); ma50.applyOptions({ color: '#b48cff' }); }
  }

  const toCandle = b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });
  const toPoint = b => ({ time: b.time, value: b.close });
  const toVol = b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(52,209,164,0.32)' : 'rgba(255,111,97,0.32)' });
  function sma(n) {
    const out = []; let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i].close;
      if (i >= n) sum -= bars[i - n].close;
      if (i >= n - 1) out.push({ time: bars[i].time, value: sum / n });
    }
    return out;
  }

  function setData() {
    main.setData(State.type === 'candle' ? bars.map(toCandle) : bars.map(toPoint));
    const hasVol = cur.type !== 'index' && bars.some(b => b.volume > 0);
    vol.setData(hasVol ? bars.map(toVol) : []);
    ma20.setData(sma(20)); ma50.setData(sma(50));
    byTime = new Map(bars.map(b => [b.time, b]));
    chart.timeScale().applyOptions({ timeVisible: State.tf === '1D' });
    chart.timeScale().fitContent();
    legend(bars[bars.length - 1]);
  }

  function legend(b) {
    if (!b) { $('#ohlc').innerHTML = ''; return; }
    const d = cur.dp, ch = b.close / b.open - 1;
    const cls = b.close >= b.open ? 'up' : 'down';
    $('#ohlc').innerHTML =
      `<span>O <b>${fmt(b.open, d)}</b></span><span>H <b>${fmt(b.high, d)}</b></span>` +
      `<span>L <b>${fmt(b.low, d)}</b></span><span>C <b class="${cls}">${fmt(b.close, d)}</b></span>` +
      `<span class="${cls}">${fmtPct(ch)}</span>` + (b.volume > 0 && cur.type !== 'index' ? `<span>Vol <b>${fmtCompact(b.volume)}</b></span>` : '');
  }

  async function fetchBars(inst, tf) {
    if (inst.live && inst.bn) {
      try { const b = await Live.klines(inst, tf); if (b && b.length) return b; } catch (e) { /* pakai simulasi */ }
    }
    if (tf === '1D') return ensureIntra(inst).map(b => ({ ...b }));
    return ensureDaily(inst).slice(-TF_N[tf]).map(b => ({ ...b }));
  }

  async function compute52(inst) {
    let src;
    if (inst.live && inst.bn) { try { src = await Live.klines(inst, '1Y'); } catch (e) { src = null; } }
    if (!src || !src.length) src = ensureDaily(inst).slice(-260);
    let hi = -Infinity, lo = Infinity;
    for (const b of src) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    return [lo, hi];
  }

  async function load() {
    const my = ++req;
    const inst = cur;
    const b = await fetchBars(inst, State.tf);
    if (my !== req) return;
    bars = b;
    buildSeries();
    setData();
  }

  function head() {
    const i = cur, p = pct(i);
    $('#cSym').textContent = i.sym;
    $('#cName').textContent = i.name + (i.cur ? ', ' + i.cur : '');
    $('#cPrice').textContent = fmt(i.price, i.dp);
    const pill = $('#cChg');
    pill.textContent = fmtPct(p);
    pill.className = 'pill ' + sign(p);
    const st = i.type === 'crypto' ? { open: true, label: 'Buka 24 jam', detail: '' } : statusOf(i.mkt);
    const chip = $('#cStatus');
    chip.textContent = st.label;
    chip.className = 'chip tiny ' + (st.open ? 'open' : 'closed');
    chip.title = st.detail ? (st.label + ', ' + st.detail) : st.label;
    const d = i.dp;
    const r = range52 ? `${fmt(range52[0], d)} – ${fmt(range52[1], d)}` : '–';
    $('#stats').innerHTML = [
      ['Buka', fmt(i.open, d)], ['Tertinggi', fmt(i.high, d)], ['Terendah', fmt(i.low, d)],
      ['Tutup kemarin', fmt(i.prev, d)], ['Volume', i.type === 'index' ? '–' : fmtCompact(i.volume)], ['Kisaran 52 minggu', r],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  function applyTick(inst) {
    if (!bars.length || !main) return;
    const price = inst.price;
    let bar = bars[bars.length - 1];
    if (State.tf === '1D') {
      const t = Math.floor(Date.now() / 1000 / INTRA_STEP) * INTRA_STEP;
      if (t > bar.time) { bar = { time: t, open: price, high: price, low: price, close: price, volume: 0 }; bars.push(bar); byTime.set(t, bar); }
    }
    bar.close = price;
    if (price > bar.high) bar.high = price;
    if (price < bar.low) bar.low = price;
    main.update(State.type === 'candle' ? toCandle(bar) : toPoint(bar));
    if (vol && bar.volume > 0) vol.update(toVol(bar));
    for (const [n, s] of [[20, ma20], [50, ma50]]) {
      if (bars.length >= n) {
        let sum = 0; for (let k = bars.length - n; k < bars.length; k++) sum += bars[k].close;
        s.update({ time: bar.time, value: sum / n });
      }
    }
  }

  return {
    init,
    async select(inst) {
      cur = inst; range52 = null;
      head();
      load();
      range52 = await compute52(inst);
      if (cur === inst) head();
    },
    reload() { if (cur) load(); },
    onTick(changed) {
      if (!cur || !changed.includes(cur)) return;
      applyTick(cur);
      head();
    },
    get current() { return cur; },
  };
})();

/* =====================================================================
   DATA LIVE: kripto dari API publik Binance (tanpa kunci API)
   Kalau gagal (offline / diblokir), otomatis kembali ke simulasi.
   ===================================================================== */
const Live = (() => {
  const API = 'https://api.binance.com/api/v3';
  const KL = { '1D': ['5m', 288], '1M': ['4h', 180], '3M': ['1d', 90], '6M': ['1d', 180], '1Y': ['1d', 365], '5Y': ['1w', 260] };
  const byBn = {};
  INSTS.filter(i => i.bn).forEach(i => { byBn[i.bn] = i; });
  const cache = new Map();
  let ok = null, timer = null, warned = false;

  async function getJson(url, ms = 7000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }
  function setMode(live) {
    const chip = $('#modeChip');
    chip.dataset.state = live ? 'live' : 'sim';
    $('#modeText').textContent = live ? 'Kripto live, saham simulasi' : 'Data simulasi';
  }
  async function poll() {
    const syms = Object.keys(byBn);
    try {
      const arr = await getJson(`${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`);
      const changed = [];
      for (const t of arr) {
        const i = byBn[t.symbol]; if (!i) continue;
        const price = +t.lastPrice, p = +t.priceChangePercent / 100;
        if (!Number.isFinite(price) || price <= 0) continue;
        if (!i.live) { i.live = true; i.spark = []; }
        i.price = price; i.prev = price / (1 + p); i.open = +t.openPrice; i.high = +t.highPrice; i.low = +t.lowPrice; i.volume = +t.volume;
        i.dp = price < 10 ? 4 : price < 1000 ? 2 : 2;
        i.spark.push(price); if (i.spark.length > 40) i.spark.shift();
        changed.push(i);
      }
      if (changed.length) {
        if (ok !== true) { ok = true; setMode(true); if (!warned) toast('Harga kripto sekarang live dari Binance.'); warned = true; ChartView.reload(); }
        bus.emit('tick', changed);
      }
    } catch (e) {
      if (ok !== false) {
        ok = false; setMode(false);
        Object.values(byBn).forEach(i => { i.live = false; });
        toast('Harga kripto live tidak bisa diakses dari jaringanmu, jadi kripto memakai simulasi.');
      }
    }
  }
  return {
    start() { if (timer) return; poll(); timer = setInterval(poll, 4000); },
    stop() {
      clearInterval(timer); timer = null; ok = null; setMode(false);
      Object.values(byBn).forEach(i => { i.live = false; });
      ChartView.reload();
    },
    async klines(inst, tf) {
      const [iv, lim] = KL[tf];
      const key = inst.bn + iv + lim;
      const c = cache.get(key);
      if (c && Date.now() - c.t < 60000) return c.v.map(b => ({ ...b }));
      const raw = await getJson(`${API}/klines?symbol=${inst.bn}&interval=${iv}&limit=${lim}`);
      const v = raw.map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
      cache.set(key, { t: Date.now(), v });
      return v.map(b => ({ ...b }));
    },
  };
})();
