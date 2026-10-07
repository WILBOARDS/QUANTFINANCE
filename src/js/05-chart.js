/* =====================================================================
   GRAFIK HARGA (TradingView Lightweight Charts v4, ditanam di file ini)
   ===================================================================== */
const ChartView = (() => {
  const el = $('#chart');
  const C = { up: '#34d1a4', down: '#ff6f61', brass: '#e0b15a', blue: '#6fb1ff', ink2: '#93a8bf', grid: 'rgba(23,49,74,0.55)' };
  const TF_N = { '1M': 22, '3M': 64, '6M': 128, '1Y': 256, '5Y': 1300 };
  let chart, main, vol, ma20, ma50, fixLinks = () => {};
  /* barsOf/barsTf: aset & timeframe pemilik "bars" saat ini. Tick hanya boleh ditulis ke bar milik
     aset yang sama, supaya harga aset baru tidak masuk ke grafik aset lama selama riwayat dimuat. */
  let cur = null, bars = [], byTime = new Map(), req = 0, range52 = null, hist = null, barsOf = null, barsTf = null, req52 = 0;

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
    /* logo atribusi TradingView (wajib lisensi) dibuat library tanpa rel=noopener: tambahkan */
    fixLinks = () => el.querySelectorAll('a[target="_blank"]:not([rel~="noopener"])').forEach(a => { a.rel = 'noopener noreferrer'; });
    fixLinks();
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
    requestAnimationFrame(fixLinks);   // logo bisa baru dibuat setelah gambar pertama
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
  /* hasil berupa { bars, hist } dan TIDAK menyentuh state modul: pemanggil yang memutuskan
     apakah hasil ini masih relevan. Bar disalin karena MarketData menyimpannya di cache bersama
     dan applyTick mengubah bar terakhir. */
  async function fetchBars(inst, tf) {
    const h = await MarketData.history(inst, tf);
    if (h && h.bars && h.bars.length) return { bars: h.bars.map(b => ({ ...b })), hist: h };
    if (State.demo && !inst.real) {
      const sim = { quality: 'sim', source: 'Generator simulasi (mode demo)' };
      if (tf === '1D') return { bars: ensureIntra(inst).map(b => ({ ...b })), hist: sim };
      return { bars: ensureDaily(inst).slice(-TF_N[tf]).map(b => ({ ...b })), hist: sim };
    }
    return { bars: [], hist: h || { quality: 'unavailable', error: 'Tidak ada sumber riwayat harga untuk aset ini.' } };
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
    /* tombol "Lilin" ditandai tidak berlaku saat data hanya harga penutupan */
    const cb = $('#typeSeg [data-type="candle"]');
    if (cb) { const co = !!(hist && hist.closeOnly && bars.length); cb.dataset.closeOnly = String(co); cb.title = co ? 'Data ini hanya punya harga penutupan; ditampilkan sebagai garis' : ''; }
    const na = $('#chartNa');
    const q = $('#cHist');
    if (bars.length) {
      na.hidden = true;
      q.innerHTML = hist ? qBadge(hist.quality || 'unavailable', hist.source) + `<span class="meta">${esc(hist.source || '')}${hist.closeOnly && State.type === 'candle' ? ' · hanya harga penutupan, jadi candle ditampilkan sebagai garis' : ''}</span>` : '';
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
    const inst = cur, tf = State.tf;
    /* aset berganti: kosongkan grafik lama dulu supaya candle & lencana aset sebelumnya
       tidak tampil di bawah judul aset baru selama riwayat dimuat */
    if (barsOf !== inst && main) {
      bars = []; byTime = new Map(); barsOf = null;
      main.setData([]); if (vol) vol.setData([]); if (ma20) ma20.setData([]); if (ma50) ma50.setData([]);
      legend(null);
      $('#chartNa').hidden = true;
      $('#cHist').innerHTML = '<span class="loading">Memuat riwayat</span>';
    }
    const r = await fetchBars(inst, tf);
    if (my !== req || cur !== inst) return;
    bars = r.bars; hist = r.hist; barsOf = inst; barsTf = tf;
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
      [i.type === 'crypto' ? 'Harga 24 jam lalu' : 'Tutup sebelumnya', fmt(i.prev, d)], ['Volume', i.type === 'index' ? '–' : fmtCompact(i.volume)], ['Kisaran 52 minggu', r],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  function applyTick(inst) {
    if (!bars.length || !main || !Number.isFinite(inst.price)) return;
    if (barsOf !== inst || barsTf !== State.tf) return;   // riwayat aset/timeframe ini belum selesai dimuat
    if (hist && hist.quality === 'eod' && State.tf !== '1D') return;   // jangan menimpa bar harian resmi dengan tick
    /* mode demo: angka simulasi tidak boleh masuk ke grafik yang riwayatnya data nyata */
    if (inst.quality === 'sim' && (!hist || hist.quality !== 'sim')) return;
    if (inst.quality === 'stale' || inst.quality === 'unavailable') return;
    /* waktu tick = waktu data dari sumber (bukan jam komputer): saat bursa tutup harga terakhir
       tidak membuat candle 5 menit datar baru, dan bar lama tidak "ditarik" ke hari ini */
    const tsec = inst.quality === 'sim' ? Date.now() / 1000 : Date.parse(inst.asOf || '') / 1000;
    if (!Number.isFinite(tsec)) return;
    const price = inst.price;
    let bar = bars[bars.length - 1];
    if (State.tf === '1D') {
      const t = Math.floor(tsec / INTRA_STEP) * INTRA_STEP;
      if (t < bar.time) return;
      if (t > bar.time) { bar = { time: t, open: price, high: price, low: price, close: price, volume: 0 }; bars.push(bar); byTime.set(t, bar); }
    } else {
      const per = bars.length > 1 ? bars[bars.length - 1].time - bars[bars.length - 2].time : 86400;
      if (tsec < bar.time || tsec >= bar.time + per) return;      // tick di luar periode bar terakhir
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
      const my = ++req52;
      head();
      load();
      const r = await compute52(inst);
      if (my !== req52 || cur !== inst) return;   // pilihan sudah berganti: jangan timpa kisaran aset lain
      range52 = r;
      head();
    },
    reload() { if (cur) load(); },
    onTick(changed) {
      if (!cur || !changed.includes(cur)) return;
      applyTick(cur);
      head();
    },
    get current() { return cur; },
    /* true bila grafik aset terpilih sudah punya riwayat (dipakai supaya muat ulang tidak mereset zoom) */
    get hasBars() { return bars.length > 0 && barsOf === cur; },
  };
})();
