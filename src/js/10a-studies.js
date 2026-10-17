/* =====================================================================
   INDIKATOR GRAFIK + TAB TEKNIKAL (perintah: BTC TECH)
   - Rumus ada di shared/indicators.mjs (murni, diuji di test/indicators.test.mjs).
     File ini hanya menggambar dan menulis catatan.
   - Overlay (SMA20, SMA50, EMA20, Bollinger, VWAP) di skala harga. RSI14, MACD, ATR14 di skala
     sendiri (priceScaleId) yang diberi pita di bawah grafik; rata-rata volume di skala volume.
   - Catatan tiap indikator: periode, sumber riwayat (hist.source), basis hitung, lencana Kalkulasi,
     dan nilai terakhir yang bisa diklik (asal-usul + rumus).
   - Data kurang, tanpa volume, atau hanya-penutupan (FRED): TIDAK digambar, alasannya ditulis.
   - Tidak ada simulasi di sini, termasuk saat Mode Demo.
   ===================================================================== */
const Studies = (() => {
  const COL = { sma20: '#6fb1ff', sma50: '#c792ea', ema20: '#ff9f6b', bb20: '#93a8bf', vwap: '#5fd4d0', rsi14: '#c792ea', macd: '#6fb1ff', signal: '#ff9f6b', atr14: '#f3d79a', vol20: '#e0b15a' };
  const KEY_LABEL = { sma: '', ema: '', mid: 'tengah', upper: 'atas', lower: 'bawah', vwap: '', rsi: '', macd: 'MACD', signal: 'sinyal', hist: 'histogram', atr: '', avg: '' };
  /* desimal mengikuti besar angka: BTC (ribuan) 2, valas (≈1) 4, MACD valas (≈0,001) 6 */
  const dpOf = v => { const a = Math.abs(v); return a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6; };
  const fmtV = v => fmt(v, dpOf(v));
  const utc = t => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const pts = (bars, arr) => { const out = []; for (let i = 0; i < bars.length; i++) if (arr[i] !== null) out.push({ time: bars[i].time, value: arr[i] }); return out; };
  const atMap = (bars, arr) => new Map(pts(bars, arr).map(p => [p.time, p.value]));
  const line = (color, extra = {}) => ({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra });
  const dashed = () => LightweightCharts.LineStyle.Dashed;
  const labelOf = (m, k) => (KEY_LABEL[k] ? KEY_LABEL[k] : m.label);
  /* basis hitung yang tampil: VWAP 1D direset per hari UTC, rentang lain sejak bar pertama */
  const basisOf = (m, tf) => (m.id === 'vwap' ? (tf === '1D' ? 'VWAP direset tiap hari UTC (grafik intraday 1D)' : 'VWAP sejak awal rentang yang dimuat') : m.basis);

  /* gambar per indikator: kembalikan { series, legend, pane } */
  const DRAW = {
    sma20: (chart, bars, r) => one(chart, bars, r.lines.sma, 'SMA20', COL.sma20),
    sma50: (chart, bars, r) => one(chart, bars, r.lines.sma, 'SMA50', COL.sma50),
    ema20: (chart, bars, r) => one(chart, bars, r.lines.ema, 'EMA20', COL.ema20),
    vwap: (chart, bars, r) => one(chart, bars, r.lines.vwap, 'VWAP', COL.vwap, { lineWidth: 2 }),
    bb20(chart, bars, r) {
      const up = chart.addLineSeries(line(COL.bb20)), mid = chart.addLineSeries(line(COL.bb20, { lineStyle: dashed() })), lo = chart.addLineSeries(line(COL.bb20));
      up.setData(pts(bars, r.lines.upper)); mid.setData(pts(bars, r.lines.mid)); lo.setData(pts(bars, r.lines.lower));
      return { series: [up, mid, lo], legend: [{ label: 'BB atas', color: COL.bb20, at: atMap(bars, r.lines.upper), fmt: fmtV }, { label: 'BB bawah', color: COL.bb20, at: atMap(bars, r.lines.lower), fmt: fmtV }] };
    },
    rsi14(chart, bars, r) {
      const s = chart.addLineSeries(line(COL.rsi14, { priceScaleId: 'rsi', autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) }));
      s.setData(pts(bars, r.lines.rsi));
      for (const lv of [70, 30]) s.createPriceLine({ price: lv, color: 'rgba(147,168,191,0.55)', lineWidth: 1, lineStyle: dashed(), axisLabelVisible: false, title: 'RSI ' + lv });
      return { series: [s], pane: 'rsi', legend: [{ label: 'RSI14', color: COL.rsi14, at: atMap(bars, r.lines.rsi), fmt: v => fmt(v, 1) }] };
    },
    macd(chart, bars, r) {
      const hs = chart.addHistogramSeries({ priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false });
      hs.setData(pts(bars, r.lines.hist).map(p => ({ ...p, color: p.value >= 0 ? 'rgba(52,209,164,0.45)' : 'rgba(255,111,97,0.45)' })));
      const m = chart.addLineSeries(line(COL.macd, { priceScaleId: 'macd' })), sg = chart.addLineSeries(line(COL.signal, { priceScaleId: 'macd' }));
      m.setData(pts(bars, r.lines.macd)); sg.setData(pts(bars, r.lines.signal));
      m.createPriceLine({ price: 0, color: 'rgba(147,168,191,0.45)', lineWidth: 1, lineStyle: dashed(), axisLabelVisible: false, title: 'MACD 0' });
      return { series: [hs, m, sg], pane: 'macd', legend: [{ label: 'MACD', color: COL.macd, at: atMap(bars, r.lines.macd), fmt: fmtV }, { label: 'sinyal', color: COL.signal, at: atMap(bars, r.lines.signal), fmt: fmtV }] };
    },
    atr14(chart, bars, r) {
      const s = chart.addLineSeries(line(COL.atr14, { priceScaleId: 'atr' }));
      s.setData(pts(bars, r.lines.atr));
      return { series: [s], pane: 'atr', legend: [{ label: 'ATR14', color: COL.atr14, at: atMap(bars, r.lines.atr), fmt: fmtV }] };
    },
    /* di skala volume yang sama dengan histogram volume */
    vol20(chart, bars, r) {
      const s = chart.addLineSeries(line(COL.vol20, { priceScaleId: 'vol', priceFormat: { type: 'volume' } }));
      s.setData(pts(bars, r.lines.avg));
      return { series: [s], legend: [{ label: 'Vol rata-rata 20', color: COL.vol20, at: atMap(bars, r.lines.avg), fmt: v => fmtCompact(v) }] };
    },
  };
  function one(chart, bars, arr, label, color, extra) {
    const s = chart.addLineSeries(line(color, extra));
    s.setData(pts(bars, arr));
    return { series: [s], legend: [{ label, color, at: atMap(bars, arr), fmt: fmtV }] };
  }

  for (const m of Indicators.META) {
    const onPrice = !m.pane && m.needs !== 'volume';
    ProChart.register({
      id: m.id, label: m.label, title: m.title + '. Rumus: ' + m.formula,
      apply(chart, bars, ctx) {
        if (onPrice && ctx.normalized) return { series: [], quality: 'unavailable', note: 'tidak digambar dalam mode bandingkan: sumbu memakai % (awal = 100), bukan harga' };
        const r = Indicators.compute(m.id, bars, { closeOnly: ctx.closeOnly, resetDaily: ctx.tf === '1D' });
        if (!r.ok) return { series: [], quality: 'unavailable', note: r.reason };
        const out = DRAW[m.id](chart, bars, r, ctx);
        /* garis di skala harga ikut menentukan batas label sumbu harga (lihat ProChart.updateAxisLo) */
        if (onPrice) (out.legend || []).forEach(x => { x.price = true; });
        const h = ctx.hist || {};
        const bl = Indicators.barLabel(Indicators.barSeconds(bars));
        const basis = basisOf(m, ctx.tf);
        const t = bars[r.lastIndex].time;
        return {
          ...out, quality: 'calculated', color: COL[m.id],
          note: `periode ${m.period} (bar ${bl}) · sumber: ${h.source || 'tidak diketahui'} · basis: ${basis}`,
          items: Object.entries(r.last).map(([k, v]) => ({ label: labelOf(m, k), value: v, dp: m.id === 'rsi14' ? 1 : dpOf(v), asOf: utc(t), period: `${m.period}; bar ${bl}; rentang ${ctx.tf}`, formula: m.formula, note: basis })),
        };
      },
    });
  }

  /* ---------- tab TECH: nilai terakhir semua indikator + bacaan berbasis aturan ---------- */
  const TFS = ['5D', '1M', '3M', '6M', '1Y'];
  function table(e, h, tf) {
    const sym = e.symbol || e.name;
    const bars = (h.bars || []).filter(b => b && Number.isFinite(b.time) && Number.isFinite(b.close)).sort((a, b) => a.time - b.time);
    if (bars.length < 2) return unavailableBox('Indikator teknikal ' + sym + ' ' + tf, { error: h.error || 'Tidak ada riwayat harga.' });
    const co = !!h.closeOnly || Indicators.isCloseOnly(bars);
    const bl = Indicators.barLabel(Indicators.barSeconds(bars));
    const inQ = (QUALITY[h.quality] || [h.quality || '–'])[0];
    const rows = Indicators.META.map(m => {
      const r = Indicators.compute(m.id, bars, { closeOnly: co, resetDaily: tf === '1D' });
      const basis = basisOf(m, tf);
      const val = r.ok
        ? Object.entries(r.last).map(([k, v]) => {
          const txt = fmt(v, m.id === 'rsi14' ? 1 : dpOf(v));
          const lbl = labelOf(m, k);
          return `<span class="tv">${lbl !== m.label ? `<small>${esc(lbl)}</small> ` : ''}${Lineage.wrap({
            label: `${m.label}${lbl !== m.label ? ' ' + lbl : ''} · ${sym}`, value: txt, quality: 'calculated', source: h.source || '–', asOf: utc(bars[r.lastIndex].time),
            fetchedAt: h.fetchedAt, period: `${m.period}; bar ${bl}; rentang ${tf}`, formula: m.formula, note: basis + '. Kualitas riwayat masukan: ' + inQ + '.',
          }, esc(txt))}</span>`;
        }).join('')
        : `<span class="na" title="${esc('Tidak tersedia: ' + r.reason)}">–</span>`;
      const reading = r.ok ? esc(Indicators.interpret(r, bars) || '–') : `<span class="na-txt">Tidak tersedia: ${esc(r.reason)}</span>`;
      return `<tr data-tech="${esc(m.id)}" data-ok="${r.ok}"><th scope="row">${esc(m.label)}</th><td class="num">${val}</td><td>${r.ok ? qBadge('calculated', 'Dihitung aplikasi dari riwayat ' + (h.source || '')) : qBadge('unavailable', r.reason)}</td><td>${esc(m.period)}</td><td class="wrap">${esc(basis)}</td><td class="wrap">${reading}</td></tr>`;
    }).join('');
    return `<div class="tech-scroll"><table class="dense tech-table"><caption class="sr">Nilai terakhir indikator teknikal ${esc(sym)}</caption>
        <thead><tr><th>Indikator</th><th class="num">Nilai terakhir</th><th>Kualitas</th><th>Periode</th><th>Basis hitung</th><th>Bacaan (Analisis otomatis, bukan rekomendasi)</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="src-line">${qBadge(h.quality || 'unavailable', h.source)} Riwayat: ${esc(h.source || '–')} · ${bars.length} bar ${esc(bl)} · bar terakhir ${esc(utc(bars[bars.length - 1].time))}${h.fetchedAt ? ' · diambil ' + esc(fmtAge(h.fetchedAt)) : ''}${co ? ' · hanya harga penutupan (tanpa high/low/volume)' : ''}</p>
      <p class="hint">${qBadge('inference', 'Bacaan berbasis aturan, bukan fakta atau sinyal')} Kolom "Bacaan" adalah Analisis otomatis, bukan rekomendasi. Ambang seperti RSI 70/30 adalah ambang umum di literatur teknikal, bukan sinyal beli/jual. Klik angka untuk melihat rumus, periode, dan sumbernya.</p>`;
  }
  SecurityTabs.register({
    id: 'tech', label: 'Teknikal', verb: 'TECH', types: PRICED_T, order: 12,
    async render(e, el, ctx) {
      let tf = Store.get('techTf', '1Y');
      if (!TFS.includes(tf)) tf = '1Y';
      let seq = 0;
      el.innerHTML = `<div class="tech-wrap"><div class="tech-bar"><div class="seg" role="group" aria-label="Rentang riwayat untuk indikator">${TFS.map(t => `<button type="button" data-ttf="${t}" aria-pressed="${t === tf}">${t}</button>`).join('')}</div>
        <span class="meta">Nilai terakhir tiap indikator, dihitung dari riwayat yang sama dengan grafik (GP).</span></div><div class="tech-body"></div></div>`;
      const body = el.querySelector('.tech-body');
      const run = async () => {
        const my = ++seq;
        body.innerHTML = '<p class="loading">Mengambil riwayat</p>';
        const h = await Quotes.history(e, tf);
        if (!ctx.alive() || my !== seq) return;
        body.innerHTML = table(e, h, tf);
      };
      el.querySelector('.tech-bar').addEventListener('click', ev => {
        const b = ev.target.closest('[data-ttf]');
        if (!b) return;
        tf = b.dataset.ttf; Store.set('techTf', tf);
        el.querySelectorAll('[data-ttf]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        run();
      });
      await run();
    },
  });
  return { COL, table };
})();
