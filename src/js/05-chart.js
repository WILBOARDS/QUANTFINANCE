/* =====================================================================
   GRAFIK HARGA (TradingView Lightweight Charts v4, ditanam di file ini)
   ===================================================================== */
const ChartView = (() => {
  const el = $('#chart');
  const C = { up: '#34d1a4', down: '#ff6f61', brass: '#e0b15a', blue: '#6fb1ff', ink2: '#93a8bf', grid: 'rgba(23,49,74,0.55)' };
  const TF_N = { '1M': 22, '3M': 64, '6M': 128, '1Y': 256, '5Y': 1300 };
  let chart, main, vol, ma20, ma50;
  let cur = null, bars = [], byTime = new Map(), req = 0, range52 = null, hist = null;

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

  /* data yang hanya punya harga penutupan (FRED) selalu digambar sebagai garis: tidak mengarang high/low */
  const effType = () => (hist && hist.closeOnly && State.type === 'candle' ? 'line' : State.type);
  function buildSeries() {
    for (const s of [vol, main, ma20, ma50]) if (s) chart.removeSeries(s);
    const dp = cur.dp;
    const pf = { type: 'price', precision: dp, minMove: Math.pow(10, -dp) };
    vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    if (effType() === 'candle') {
      main = chart.addCandlestickSeries({ upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down, priceFormat: pf });
    } else if (effType() === 'area') {
      main = chart.addAreaSeries({ lineColor: C.brass, topColor: 'rgba(224,177,90,0.28)', bottomColor: 'rgba(224,177,90,0)', lineWidth: 2, priceFormat: pf });
    } else {
      main = chart.addLineSeries({ color: C.brass, lineWidth: 2, priceFormat: pf });
    }
    const maOpt = color => ({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: State.ma, priceFormat: pf });
    ma20 = chart.addLineSeries(maOpt(C.brass));
    ma50 = chart.addLineSeries(maOpt(C.blue));
    if (effType() === 'line' || effType() === 'area') { ma20.applyOptions({ color: C.blue }); ma50.applyOptions({ color: '#b48cff' }); }
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
    main.setData(effType() === 'candle' ? bars.map(toCandle) : bars.map(toPoint));
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

  /* riwayat: sumber nyata dulu (MarketData). Simulasi HANYA di mode demo dan hanya untuk aset
     yang memang tidak punya sumber nyata, supaya harga asli tidak dicampur riwayat palsu. */
  async function fetchBars(inst, tf) {
    const h = await MarketData.history(inst, tf);
    if (h && h.bars && h.bars.length) { hist = h; return h.bars; }
    if (State.demo && !inst.real) {
      hist = { quality: 'sim', source: 'Generator simulasi (mode demo)' };
      if (tf === '1D') return ensureIntra(inst).map(b => ({ ...b }));
      return ensureDaily(inst).slice(-TF_N[tf]).map(b => ({ ...b }));
    }
    hist = h || { quality: 'unavailable', error: 'Tidak ada sumber riwayat harga untuk aset ini.' };
    return [];
  }

  async function compute52(inst) {
    const h = await MarketData.history(inst, '1Y');
    let src = h && h.bars && h.bars.length ? h.bars : null;
    if (!src && State.demo && !inst.real) src = ensureDaily(inst).slice(-260);
    if (!src || !src.length) return null;
    let hi = -Infinity, lo = Infinity;
    for (const b of src) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    return [lo, hi];
  }
  function noteHist() {
    const na = $('#chartNa');
    const q = $('#cHist');
    if (bars.length) {
      na.hidden = true;
      q.innerHTML = hist ? qBadge(hist.quality || 'unavailable', hist.source) + `<span class="meta">${esc(hist.source || '')}</span>` : '';
    } else {
      na.hidden = false;
      const why = hist && hist.error ? hist.error : 'Tidak ada sumber riwayat harga.';
      na.innerHTML = `<div><p><strong>Grafik ${esc(cur.sym)} tidak tersedia.</strong></p><p>${esc(why)}</p>` +
        `<p class="hint">${cur.type === 'crypto' ? 'Kripto memakai Binance/CoinGecko langsung dari browser; cek koneksi atau halaman Sumber data.' : 'Riwayat saham/indeks butuh server lokal: FRED (S&amp;P 500, Nikkei, tanpa kunci) atau Yahoo tidak resmi (ENABLE_UNOFFICIAL_YAHOO=1). Mode demo bisa dinyalakan di Pengaturan untuk angka simulasi berlabel.'}</p></div>`;
      q.innerHTML = qBadge('unavailable');
    }
  }

  async function load() {
    const my = ++req;
    const inst = cur;
    const b = await fetchBars(inst, State.tf);
    if (my !== req) return;
    bars = b;
    buildSeries();
    setData();
    noteHist();
  }

  function head() {
    const i = cur, p = pct(i);
    $('#cSym').textContent = i.sym;
    $('#cName').textContent = i.name + (i.cur ? ', ' + i.cur : '');
    $('#cPrice').textContent = fmt(i.price, i.dp);
    const pill = $('#cChg');
    pill.textContent = fmtPct(p);
    pill.className = 'pill ' + sign(p);
    $('#cQual').innerHTML = qBadge(i.quality || 'unavailable', i.srcName ? 'Harga dari ' + i.srcName : '') + (i.asOf ? `<span class="meta" title="Waktu data harga">${esc(fmtAge(i.asOf))}</span>` : '');
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
    if (!bars.length || !main || !Number.isFinite(inst.price)) return;
    if (hist && hist.quality === 'eod' && State.tf !== '1D') return;   // jangan menimpa bar harian resmi dengan tick
    const price = inst.price;
    let bar = bars[bars.length - 1];
    if (State.tf === '1D') {
      const t = Math.floor(Date.now() / 1000 / INTRA_STEP) * INTRA_STEP;
      if (t > bar.time) { bar = { time: t, open: price, high: price, low: price, close: price, volume: 0 }; bars.push(bar); byTime.set(t, bar); }
    }
    bar.close = price;
    if (price > bar.high) bar.high = price;
    if (price < bar.low) bar.low = price;
    main.update(effType() === 'candle' ? toCandle(bar) : toPoint(bar));
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
