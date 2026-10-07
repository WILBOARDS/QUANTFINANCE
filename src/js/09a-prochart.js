/* =====================================================================
   PROCHART: grafik harga yang bisa dipakai ulang (halaman detail aset, bandingkan)
   - Candle / garis / area, volume, crosshair + legenda OHLC, zoom & geser (roda/seret),
     tombol reset, 9 timeframe (1D 5D 1M 3M 6M YTD 1Y 5Y MAX).
   - Riwayat dari Quotes.history(): sumber & kualitas selalu tampil di bawah grafik.
   - Data hanya-penutupan (FRED) otomatis tampil sebagai garis, tidak dipaksa jadi candle.
   - Indikator teknikal ditambahkan lewat ProChart.studies (lihat 09c-studies.js bila ada).
   ===================================================================== */
const ProChart = (() => {
  const C = { up: '#34d1a4', down: '#ff6f61', brass: '#e0b15a', grid: 'rgba(42,74,104,0.35)', ink2: '#93a8bf' };
  const studies = [];                 // diisi modul indikator: { id, label, apply(chart, bars, ctx) -> {series, meta} }

  function create(host, opts = {}) {
    const S = { entity: null, tf: opts.tf || Store.get('pcTf', '1Y'), type: opts.type || Store.get('pcType', 'candle'), bars: [], hist: null, req: 0, series: {}, active: new Set(Store.get('pcStudies', [])) };
    host.innerHTML = `<div class="pc-bar">
        <div class="seg pc-tf" role="group" aria-label="Rentang waktu">${Quotes.TIMEFRAMES.map(t => `<button type="button" data-tf="${t}" aria-pressed="${t === S.tf}">${t}</button>`).join('')}</div>
        <div class="seg pc-type" role="group" aria-label="Jenis grafik">${[['candle', 'Candle'], ['line', 'Garis'], ['area', 'Area']].map(([k, l]) => `<button type="button" data-type="${k}" aria-pressed="${k === S.type}">${l}</button>`).join('')}</div>
        <div class="pc-studies" role="group" aria-label="Indikator"></div>
        <button type="button" class="mini-btn pc-reset" title="Tampilkan seluruh data">Reset zoom</button>
      </div>
      <div class="pc-legend num" aria-live="off"></div>
      <div class="pc-host"><div class="pc-na" hidden></div></div>
      <div class="pc-foot"></div>`;
    const el = host.querySelector('.pc-host');
    const chart = LightweightCharts.createChart(el, {
      autoSize: true, localization: { locale: 'en-US' },
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: C.ink2, fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: 11 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.22 } },
      timeScale: { borderVisible: false, rightOffset: 4 },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    });
    const fixLinks = () => el.querySelectorAll('a[target="_blank"]:not([rel~="noopener"])').forEach(a => { a.rel = 'noopener noreferrer'; });
    fixLinks();
    let byTime = new Map();
    const closeOnly = () => !!(S.hist && S.hist.closeOnly);
    const effType = () => (closeOnly() && S.type === 'candle' ? 'line' : S.type);
    const dp = () => { const v = S.bars.length ? S.bars[S.bars.length - 1].close : 1; return v >= 1000 ? 2 : v >= 1 ? 2 : 5; };

    function legend(b) {
      const L = host.querySelector('.pc-legend');
      if (!b) { L.innerHTML = ''; return; }
      const d = dp();
      const ch = b.open ? b.close / b.open - 1 : NaN;
      L.innerHTML = closeOnly()
        ? `<span>${esc(new Date(b.time * 1000).toISOString().slice(0, 10))}</span><span>Tutup <b>${fmt(b.close, d)}</b></span>`
        : `<span>${esc(new Date(b.time * 1000).toISOString().slice(0, 16).replace('T', ' '))}</span><span>O <b>${fmt(b.open, d)}</b></span><span>H <b>${fmt(b.high, d)}</b></span><span>L <b>${fmt(b.low, d)}</b></span><span>C <b class="${b.close >= b.open ? 'up' : 'down'}">${fmt(b.close, d)}</b></span><span class="${sign(ch)}">${fmtPct(ch)}</span>${b.volume > 0 ? `<span>Vol <b>${fmtCompact(b.volume)}</b></span>` : ''}`;
    }
    chart.subscribeCrosshairMove(p => { if (!S.bars.length) return; const b = p && p.time !== undefined ? byTime.get(p.time) : null; legend(b || S.bars[S.bars.length - 1]); });

    function clearSeries() { for (const k of Object.keys(S.series)) { try { chart.removeSeries(S.series[k]); } catch { /* sudah dihapus */ } } S.series = {}; }
    function draw() {
      clearSeries();
      const na = host.querySelector('.pc-na'), foot = host.querySelector('.pc-foot');
      if (!S.bars.length) {
        na.hidden = false;
        na.innerHTML = `<div><p><strong>Grafik ${esc(S.entity ? S.entity.symbol || S.entity.name : '')} ${esc(S.tf)} tidak tersedia.</strong></p><p>${esc((S.hist && S.hist.error) || 'Tidak ada riwayat harga.')}</p></div>`;
        foot.innerHTML = qBadge('unavailable');
        legend(null);
        return;
      }
      na.hidden = true;
      const pf = { type: 'price', precision: dp(), minMove: Math.pow(10, -dp()) };
      const t = effType();
      if (t === 'candle') S.series.main = chart.addCandlestickSeries({ upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down, priceFormat: pf });
      else if (t === 'area') S.series.main = chart.addAreaSeries({ lineColor: C.brass, topColor: 'rgba(224,177,90,0.28)', bottomColor: 'rgba(224,177,90,0)', lineWidth: 2, priceFormat: pf });
      else S.series.main = chart.addLineSeries({ color: C.brass, lineWidth: 2, priceFormat: pf });
      S.series.main.setData(t === 'candle' ? S.bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })) : S.bars.map(b => ({ time: b.time, value: b.close })));
      const hasVol = S.bars.some(b => b.volume > 0);
      if (hasVol) {
        S.series.vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        S.series.vol.setData(S.bars.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(52,209,164,0.35)' : 'rgba(255,111,97,0.35)' })));
      }
      const notes = [];
      for (const st of studies) {
        if (!S.active.has(st.id)) continue;
        try {
          const out = st.apply(chart, S.bars, { hist: S.hist, entity: S.entity, closeOnly: closeOnly(), C });
          if (out && out.series) out.series.forEach((s, k) => { S.series[st.id + k] = s; });
          if (out && out.note) notes.push(out.note);
        } catch (err) { ErrorLog.report('render', 'Indikator ' + st.label + ': ' + err.message, err.stack); notes.push(st.label + ': gagal dihitung'); }
      }
      byTime = new Map(S.bars.map(b => [b.time, b]));
      chart.timeScale().applyOptions({ timeVisible: ['1D', '5D'].includes(S.tf) });
      chart.timeScale().fitContent();
      legend(S.bars[S.bars.length - 1]);
      const h = S.hist || {};
      foot.innerHTML = `${qBadge(h.quality || 'unavailable', h.source)}<span class="meta">${esc(h.source || '')}${h.fetchedAt ? ' · diambil ' + esc(fmtAge(h.fetchedAt)) : ''} · ${S.bars.length} bar${closeOnly() ? ' · hanya harga penutupan' : ''}</span>${notes.map(n => `<span class="meta">${esc(n)}</span>`).join('')}`;
      requestAnimationFrame(fixLinks);
    }
    async function load() {
      const my = ++S.req, e = S.entity, tf = S.tf;
      if (!e) return;
      host.querySelector('.pc-foot').innerHTML = '<span class="loading">Memuat riwayat</span>';
      const h = await Quotes.history(e, tf);
      if (my !== S.req || e !== S.entity) return;
      S.hist = h; S.bars = (h.bars || []).filter(b => Number.isFinite(b.close));
      draw();
    }
    function renderStudyButtons() {
      host.querySelector('.pc-studies').innerHTML = studies.map(st => `<button type="button" class="mini-btn" data-study="${st.id}" aria-pressed="${S.active.has(st.id)}" title="${esc(st.title || st.label)}">${esc(st.label)}</button>`).join('');
    }
    host.addEventListener('click', ev => {
      const tb = ev.target.closest('.pc-tf [data-tf]');
      if (tb) { S.tf = tb.dataset.tf; Store.set('pcTf', S.tf); host.querySelectorAll('.pc-tf [data-tf]').forEach(b => b.setAttribute('aria-pressed', String(b === tb))); load(); return; }
      const ty = ev.target.closest('.pc-type [data-type]');
      if (ty) { S.type = ty.dataset.type; Store.set('pcType', S.type); host.querySelectorAll('.pc-type [data-type]').forEach(b => b.setAttribute('aria-pressed', String(b === ty))); draw(); return; }
      const sb = ev.target.closest('[data-study]');
      if (sb) { const id = sb.dataset.study; S.active.has(id) ? S.active.delete(id) : S.active.add(id); Store.set('pcStudies', [...S.active]); renderStudyButtons(); draw(); return; }
      if (ev.target.closest('.pc-reset')) chart.timeScale().fitContent();
    });
    renderStudyButtons();
    return {
      set(entity) { S.entity = entity; S.bars = []; S.hist = null; clearSeries(); legend(null); load(); },
      reload: load,
      get state() { return { tf: S.tf, type: S.type, bars: S.bars.length, quality: S.hist && S.hist.quality, studies: [...S.active] }; },
      get bars() { return S.bars; },
      destroy() { S.req++; chart.remove(); },
    };
  }
  return { create, studies, register(st) { if (!studies.some(x => x.id === st.id)) studies.push(st); } };
})();
