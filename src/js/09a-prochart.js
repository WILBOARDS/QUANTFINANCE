/* =====================================================================
   PROCHART: grafik harga yang bisa dipakai ulang (halaman detail aset, bandingkan)
   - Candle / garis / area, volume, crosshair + legenda OHLC, zoom & geser (roda/seret),
     tombol reset, 9 timeframe (1D 5D 1M 3M 6M YTD 1Y 5Y MAX).
   - Riwayat dari Quotes.history(): sumber & kualitas selalu tampil di bawah grafik.
   - Data hanya-penutupan (FRED) otomatis tampil sebagai garis, tidak dipaksa jadi candle.
   - Indikator teknikal ditambahkan lewat ProChart.register (lihat 10a-studies.js). Indikator
     berskala sendiri (RSI/MACD/ATR) diberi pita di bawah grafik harga; Lightweight Charts 4.2.3
     belum punya panel terpisah, jadi pita dibuat dengan scaleMargins per priceScaleId.
   - Bandingkan: sampai 4 aset lain sebagai garis dinormalisasi (100 = bar awal bersama). Saat
     aktif, seri utama ikut dinormalisasi; sumbu = "% (awal = 100)", lencana Kalkulasi, dan
     sumber/kualitas tiap seri ditulis sendiri-sendiri.
   ===================================================================== */
const ProChart = (() => {
  const C = { up: '#34d1a4', down: '#ff6f61', brass: '#e0b15a', grid: 'rgba(42,74,104,0.35)', ink2: '#93a8bf' };
  const CMP_COLORS = ['#6fb1ff', '#34d1a4', '#ff9f6b', '#c792ea'];
  const MAX_CMP = 4;
  const PRICED = ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate'];
  /* diisi modul indikator: { id, label, title, apply(chart, bars, ctx) -> { series, note, quality, pane, legend, items, color } }
     ctx = { hist, entity, closeOnly, C, tf, normalized, dp }.
     pane: priceScaleId bila indikator punya skala sendiri (diberi pita di bawah grafik harga).
     legend: [{ label, color, at: Map(time -> nilai), fmt }] untuk legenda crosshair.
     items: [{ label, value, dp, asOf, period, formula, note }] nilai terakhir (bisa diklik: asal-usul). */
  const studies = [];
  let uid = 0;

  /* bar urut waktu dan tanpa waktu ganda (Lightweight Charts menolak data yang tidak urut) */
  function clean(bars) {
    const m = new Map();
    for (const b of bars || []) if (b && Number.isFinite(b.time) && Number.isFinite(b.close)) m.set(b.time, b);
    return [...m.values()].sort((a, b) => a.time - b.time);
  }
  const isoMin = t => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');

  function create(host, opts = {}) {
    const S = { entity: null, tf: opts.tf || Store.get('pcTf', '1Y'), type: opts.type || Store.get('pcType', 'candle'), bars: [], hist: null, histReq: 0, req: 0, series: {}, active: new Set(Store.get('pcStudies', [])),
      cmp: [], norm: null, legends: [], drawn: [], notes: {} };
    const n = ++uid;
    host.innerHTML = `<div class="pc-bar">
        <div class="seg pc-tf" role="group" aria-label="Rentang waktu">${Quotes.TIMEFRAMES.map(t => `<button type="button" data-tf="${t}" aria-pressed="${t === S.tf}">${t}</button>`).join('')}</div>
        <div class="seg pc-type" role="group" aria-label="Jenis grafik">${[['candle', 'Candle'], ['line', 'Garis'], ['area', 'Area']].map(([k, l]) => `<button type="button" data-type="${k}" aria-pressed="${k === S.type}">${l}</button>`).join('')}</div>
        <div class="pc-studies" role="group" aria-label="Indikator"></div>
        <form class="pc-cmp" aria-label="Bandingkan dengan aset lain (maksimal ${MAX_CMP})">
          <input type="text" class="mini-input pc-cmp-in" list="pcCmpList${n}" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Bandingkan: ETH, AAPL…" aria-label="Kode atau nama aset untuk dibandingkan">
          <datalist id="pcCmpList${n}"></datalist>
          <button type="submit" class="mini-btn">Bandingkan</button>
        </form>
        <button type="button" class="mini-btn pc-reset" title="Tampilkan seluruh data">Reset zoom</button>
      </div>
      <div class="pc-cmp-row" hidden><div class="pc-chips"></div><span class="pc-cmp-msg meta" role="status"></span></div>
      <div class="pc-legend num" aria-live="off"></div>
      <div class="pc-host"><div class="pc-panes" aria-hidden="true"></div><div class="pc-na" hidden></div></div>
      <div class="pc-foot"></div>
      <div class="pc-notes" hidden></div>`;
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
    const symOf = e => (e ? e.symbol || e.name : '');

    function legend(t) {
      const L = host.querySelector('.pc-legend');
      if (t === null || t === undefined || !S.bars.length) { L.innerHTML = ''; return; }
      const b = byTime.get(t);
      const d = dp();
      const when = `<span>${esc(closeOnly() ? isoMin(t).slice(0, 10) : isoMin(t))}</span>`;
      let html;
      if (S.norm) html = when + S.norm.lines.map(l => { const v = l.at.get(t); return `<span class="pc-sv"><i class="sw" style="background:${esc(l.color)}"></i>${esc(l.sym)} <b>${Number.isFinite(v) ? fmt(v, 2) : '–'}</b></span>`; }).join('');
      else if (!b) html = when;
      else {
        const ch = b.open ? b.close / b.open - 1 : NaN;
        html = closeOnly()
          ? `${when}<span>Tutup <b>${fmt(b.close, d)}</b></span>`
          : `${when}<span>O <b>${fmt(b.open, d)}</b></span><span>H <b>${fmt(b.high, d)}</b></span><span>L <b>${fmt(b.low, d)}</b></span><span>C <b class="${b.close >= b.open ? 'up' : 'down'}">${fmt(b.close, d)}</b></span><span class="${sign(ch)}">${fmtPct(ch)}</span>${b.volume > 0 ? `<span>Vol <b>${fmtCompact(b.volume)}</b></span>` : ''}`;
      }
      html += S.legends.map(x => { const v = x.at.get(t); return Number.isFinite(v) ? `<span class="pc-sv"><i class="sw" style="background:${esc(x.color)}"></i>${esc(x.label)} <b>${esc(x.fmt ? x.fmt(v) : fmt(v, d))}</b></span>` : ''; }).join('');
      L.innerHTML = html;
    }
    chart.subscribeCrosshairMove(p => { if (!S.bars.length) return; legend(p && p.time !== undefined ? p.time : S.bars[S.bars.length - 1].time); });

    /* normalisasi: 100 = bar pertama pada/sesudah waktu mulai bersama (bar pertama paling akhir di antara semua seri) */
    function normalize() {
      const sets = [{ key: 'main', e: S.entity, bars: S.bars, hist: S.hist, color: C.brass }];
      for (const c of S.cmp) if (c.hist && c.bars.length >= 2) sets.push({ key: c.e.id, e: c.e, bars: c.bars, hist: c.hist, color: c.color });
      if (sets.length < 2 || S.bars.length < 2) return null;
      const start = Math.max(...sets.map(s => s.bars[0].time));
      const lines = [], skipped = [];
      for (const s of sets) {
        const i0 = s.bars.findIndex(b => b.time >= start);
        const base = i0 >= 0 ? s.bars[i0].close : NaN;
        if (i0 < 0 || s.bars.length - i0 < 2 || !(base > 0)) { skipped.push({ s, why: i0 < 0 || s.bars.length - i0 < 2 ? 'periode riwayat tidak beririsan dengan seri lain' : 'nilai awal ≤ 0, tidak bisa dinormalisasi' }); continue; }
        const pts = s.bars.slice(i0).map(b => ({ time: b.time, value: b.close / base * 100 }));
        lines.push({ ...s, sym: symOf(s.e), base, baseTime: s.bars[i0].time, pts, at: new Map(pts.map(p => [p.time, p.value])), lastBar: s.bars[s.bars.length - 1] });
      }
      if (lines.length < 2 || lines[0].key !== 'main') return { lines: [], skipped, start, failed: true };
      return { lines, skipped, start };
    }

    /* pita: harga di atas, volume tepat di bawahnya, lalu satu pita per skala indikator.
       Hasil: posisi atas tiap pita (pecahan tinggi area grafik) untuk label dan garis pemisah. */
    function layout(panes, hasVol) {
      const k = panes.length;
      if (!k) {
        chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.22 } });
        if (hasVol) chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        return [];
      }
      const ph = k === 1 ? 0.24 : k === 2 ? 0.2 : 0.16, sub = k * ph, vb = 0.1;
      chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.06, bottom: sub + (hasVol ? vb + 0.02 : 0.04) } });
      if (hasVol) chart.priceScale('vol').applyOptions({ scaleMargins: { top: 1 - sub - vb, bottom: sub + 0.01 } });
      panes.forEach((p, i) => chart.priceScale(p.id).applyOptions({ scaleMargins: { top: 1 - sub + i * ph + 0.03, bottom: Math.max(0, sub - (i + 1) * ph) }, borderVisible: false }));
      return panes.map((p, i) => ({ label: p.label, top: 1 - sub + i * ph }));
    }
    /* Satu skala harga untuk semua pita (Lightweight Charts 4.2.3 belum punya panel): label sumbu kanan
       diteruskan ke seluruh tinggi grafik. Label di bawah data harga yang terlihat (wilayah volume/indikator)
       dikosongkan supaya tidak terbaca sebagai harga, mis. "0.00" di samping RSI. */
    let axisLo = -Infinity;
    const axisFmt = d => v => (v < axisLo ? '' : fmt(v, d));
    function updateAxisLo() {
      const r = S.bars.length ? chart.timeScale().getVisibleRange() : null;
      if (!r) { axisLo = -Infinity; return; }
      let lo = Infinity, hi = -Infinity;
      const take = v => { if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
      const inR = t => t >= r.from && t <= r.to;
      if (S.norm) { for (const l of S.norm.lines) for (const p of l.pts) if (inR(p.time)) take(p.value); }
      else { const cdl = effType() === 'candle'; for (const b of S.bars) if (inR(b.time)) { take(cdl ? b.low : b.close); take(cdl ? b.high : b.close); } }
      for (const x of S.legends) if (x.price) for (const [t, v] of x.at) if (inR(t)) take(v);
      axisLo = lo < Infinity ? lo - Math.max(hi - lo, Math.abs(lo) * 1e-6) * 0.04 : -Infinity;
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(updateAxisLo);

    function clearSeries() { for (const k of Object.keys(S.series)) { try { chart.removeSeries(S.series[k]); } catch { /* sudah dihapus */ } } S.series = {}; }
    function draw() {
      clearSeries();
      S.norm = null; S.legends = []; S.drawn = []; S.notes = {};
      const na = host.querySelector('.pc-na'), foot = host.querySelector('.pc-foot'), notesEl = host.querySelector('.pc-notes');
      if (!S.bars.length) {
        na.hidden = false;
        na.innerHTML = `<div><p><strong>Grafik ${esc(symOf(S.entity))} ${esc(S.tf)} tidak tersedia.</strong></p><p>${esc((S.hist && S.hist.error) || 'Tidak ada riwayat harga.')}</p></div>`;
        foot.innerHTML = qBadge('unavailable');
        notesEl.hidden = true; notesEl.innerHTML = ''; host.dataset.panes = '0'; host.querySelector('.pc-panes').innerHTML = '';
        legend(null);
        return;
      }
      na.hidden = true;
      const nz = normalize();
      if (nz && !nz.failed) S.norm = nz;
      const pf = { type: 'custom', formatter: axisFmt(dp()), minMove: Math.pow(10, -dp()) };
      if (S.norm) {
        const npf = { type: 'custom', formatter: axisFmt(2), minMove: 0.01 };
        S.norm.lines.forEach((l, k) => {
          const s = chart.addLineSeries({ color: l.color, lineWidth: 2, priceFormat: npf, title: l.sym, priceLineVisible: false });
          s.setData(l.pts);
          S.series[k ? 'cmp' + k : 'main'] = s;
        });
        S.series.main.createPriceLine({ price: 100, color: '#2a4a68', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true, title: 'awal = 100' });
      } else {
        const t = effType();
        if (t === 'candle') S.series.main = chart.addCandlestickSeries({ upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down, priceFormat: pf });
        else if (t === 'area') S.series.main = chart.addAreaSeries({ lineColor: C.brass, topColor: 'rgba(224,177,90,0.28)', bottomColor: 'rgba(224,177,90,0)', lineWidth: 2, priceFormat: pf });
        else S.series.main = chart.addLineSeries({ color: C.brass, lineWidth: 2, priceFormat: pf });
        S.series.main.setData(t === 'candle' ? S.bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })) : S.bars.map(b => ({ time: b.time, value: b.close })));
      }
      const hasVol = S.bars.some(b => b.volume > 0);
      if (hasVol) {
        S.series.vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
        /* bar tanpa volume = titik kosong (whitespace), bukan batang 0 */
        S.series.vol.setData(S.bars.map(b => (b.volume > 0 ? { time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(52,209,164,0.35)' : 'rgba(255,111,97,0.35)' } : { time: b.time })));
      }
      const notes = [], panes = [];
      const ctx = { hist: S.hist, entity: S.entity, closeOnly: closeOnly(), C, tf: S.tf, normalized: !!S.norm, dp: dp() };
      for (const st of studies) {
        if (!S.active.has(st.id)) continue;
        let out;
        try { out = st.apply(chart, S.bars, ctx) || {}; }
        catch (err) { ErrorLog.report('render', 'Indikator ' + st.label + ': ' + err.message, err.stack); out = { series: [], quality: 'unavailable', note: 'gagal dihitung: ' + err.message }; }
        const ser = out.series || [];
        ser.forEach((s, k) => { S.series[st.id + k] = s; });
        if (ser.length) S.drawn.push(st.id);
        if (out.pane && ser.length && !panes.some(x => x.id === out.pane)) panes.push({ id: out.pane, label: st.label });
        (out.legend || []).forEach(x => S.legends.push(x));
        S.notes[st.id] = out.note || '';
        notes.push({ st, out });
      }
      const bands = layout(panes, hasVol);
      host.dataset.panes = String(panes.length);
      /* label + garis pemisah tiap pita; 28 px = tinggi sumbu waktu */
      host.querySelector('.pc-panes').innerHTML = bands.map(b => `<span class="pc-band" style="top:calc((100% - 28px) * ${b.top.toFixed(4)})">${esc(b.label)}</span>`).join('');
      byTime = new Map(S.bars.map(b => [b.time, b]));
      chart.timeScale().applyOptions({ timeVisible: ['1D', '5D'].includes(S.tf) });
      chart.timeScale().fitContent();
      updateAxisLo();
      legend(S.bars[S.bars.length - 1].time);
      const h = S.hist || {};
      foot.innerHTML = `${qBadge(h.quality || 'unavailable', h.source)}<span class="meta">${esc(h.source || '')}${h.fetchedAt ? ' · diambil ' + esc(fmtAge(h.fetchedAt)) : ''} · ${S.bars.length} bar${closeOnly() ? ' · hanya harga penutupan' : ''}</span>` +
        (S.norm ? `<span class="pc-axis">Sumbu: % (awal = 100) ${qBadge('calculated', 'harga ÷ harga pada bar awal bersama × 100')}</span><span class="meta">awal bersama ${esc(isoMin(S.norm.start))} UTC</span>` : '') +
        (nz && nz.failed ? `<span class="meta">Mode bandingkan tidak aktif: ${esc((nz.skipped.find(x => x.s.key === 'main') || nz.skipped[0] || { why: 'tidak ada seri pembanding yang bisa dinormalisasi' }).why)}</span>` : '');
      notesEl.innerHTML = cmpNotes(nz) + notes.map(noteHtml).join('');
      notesEl.hidden = !notesEl.innerHTML;
      requestAnimationFrame(fixLinks);
    }
    /* catatan tiap seri bandingkan: kinerja sejak awal (bisa diklik), sumber dan kualitas masing-masing */
    function cmpNotes(nz) {
      if (!S.cmp.length) return '';
      const rows = [];
      if (S.norm) for (const l of S.norm.lines) {
        const v = l.pts[l.pts.length - 1].value - 100, hh = l.hist || {};
        const lin = Lineage.wrap({
          label: l.sym + ' · kinerja sejak awal bersama', value: (v >= 0 ? '+' : '') + fmt(v, 2), unit: '%', quality: 'calculated', source: hh.source || '–',
          asOf: isoMin(l.lastBar.time) + ' UTC', fetchedAt: hh.fetchedAt, period: 'rentang ' + S.tf, raw: { awal: l.base, akhir: l.lastBar.close },
          formula: 'harga terakhir ÷ harga pada bar awal bersama × 100 − 100', note: 'awal bersama ' + isoMin(l.baseTime) + ' UTC; kualitas masukan: ' + ((QUALITY[hh.quality] || [hh.quality || '–'])[0]),
        }, `<span class="${sign(v)}">${esc((v >= 0 ? '+' : '') + fmt(v, 2))}%</span>`);
        rows.push(`<div class="pc-note" data-cmp-series="${esc(l.key)}"><i class="sw" style="background:${esc(l.color)}"></i><b>${esc(l.sym)}</b>${lin}${qBadge(hh.quality || 'unavailable', hh.source)}<span>${esc(hh.source || '')}</span></div>`);
      }
      const shown = new Set(S.norm ? S.norm.lines.map(l => l.key) : ['main']);
      for (const c of S.cmp) {
        if (shown.has(c.e.id) || !c.hist) continue;
        const why = c.bars.length < 2 ? (c.hist.error || 'tidak ada riwayat') : ((nz && nz.skipped.find(x => x.s.key === c.e.id)) || { why: 'tidak bisa dinormalisasi' }).why;
        rows.push(`<div class="pc-note" data-cmp-series="${esc(c.e.id)}"><i class="sw" style="background:${esc(c.color)}"></i><b>${esc(symOf(c.e))}</b>${qBadge('unavailable', why)}<span>${esc(why)}</span></div>`);
      }
      return rows.join('');
    }
    function noteHtml({ st, out }) {
      const h = S.hist || {};
      const ok = (out.series || []).length > 0;
      const q = out.quality || (ok ? 'calculated' : 'unavailable');
      const items = ok ? (out.items || []).filter(it => Number.isFinite(it.value)).map(it => {
        const txt = fmt(it.value, it.dp ?? dp());
        return `${esc(it.label)} ${Lineage.wrap({ label: `${it.label} · ${symOf(S.entity)}`, value: txt, quality: 'calculated', source: h.source || '–', asOf: it.asOf, fetchedAt: h.fetchedAt, period: it.period, formula: it.formula, note: it.note }, esc(txt))}`;
      }).join(' · ') : '';
      return `<div class="pc-note" data-study-note="${esc(st.id)}">${out.color ? `<i class="sw" style="background:${esc(out.color)}"></i>` : ''}<b>${esc(st.label)}</b>${qBadge(q, q === 'calculated' ? 'Dihitung aplikasi dari riwayat ' + (h.source || '') : out.note)}<span>${esc(out.note || '')}</span>${items ? `<span class="pc-last">terakhir: ${items}</span>` : ''}</div>`;
    }

    /* ---------- bandingkan ---------- */
    function renderChips(msg) {
      host.querySelector('.pc-chips').innerHTML = S.cmp.map(c => `<span class="pc-chip"><i class="sw" style="background:${esc(c.color)}"></i><b>${esc(symOf(c.e))}</b>${!c.hist ? '<span class="loading sm">memuat</span>' : c.bars.length >= 2 ? qBadge(c.hist.quality || 'unavailable', c.hist.source) : qBadge('unavailable', c.hist.error || 'tidak ada riwayat')}<button type="button" class="pc-x" data-cmp-del="${esc(c.e.id)}" aria-label="Hapus ${esc(symOf(c.e))} dari perbandingan" title="Hapus dari perbandingan">×</button></span>`).join('');
      const m = host.querySelector('.pc-cmp-msg');
      if (msg !== undefined) m.textContent = msg;
      host.querySelector('.pc-cmp-row').hidden = !S.cmp.length && !m.textContent;
    }
    async function loadCmp(c) {
      const my = S.req, e = S.entity, tf = S.tf;
      c.hist = null; c.bars = [];
      renderChips();
      const h = await Quotes.history(c.e, tf);
      if (my !== S.req || e !== S.entity || !S.cmp.includes(c)) return;
      c.hist = h; c.bars = clean(h.bars);
      renderChips();
      if (S.histReq === S.req) draw();
    }
    function addCompare(text) {
      const t = String(text || '').trim().slice(0, 40);
      if (!t) return renderChips('Ketik kode atau nama aset, mis. ETH.');
      if (!S.entity) return renderChips('Grafik utama belum dimuat.');
      const exact = REG.resolve(t, PRICED);
      const e = exact || ((REG.search(t, { types: PRICED, limit: 1 })[0] || {}).entity);
      if (!e) return renderChips('Tidak dikenal atau tidak punya harga: ' + t);
      if (e.id === S.entity.id) return renderChips(symOf(e) + ' sudah jadi grafik utama.');
      if (S.cmp.some(c => c.e.id === e.id)) return renderChips(symOf(e) + ' sudah dibandingkan.');
      if (S.cmp.length >= MAX_CMP) return renderChips(`Maksimal ${MAX_CMP} pembanding.`);
      const used = new Set(S.cmp.map(c => c.color));
      const c = { e, hist: null, bars: [], color: CMP_COLORS.find(x => !used.has(x)) || CMP_COLORS[0] };
      S.cmp.push(c);
      renderChips(exact ? '' : `Memakai ${symOf(e)} (${e.name}) untuk "${t}".`);
      loadCmp(c);
    }
    function removeCompare(id) {
      S.cmp = S.cmp.filter(c => c.e.id !== id);
      renderChips('');
      if (S.histReq === S.req) draw();
    }

    async function load() {
      const my = ++S.req, e = S.entity, tf = S.tf;
      if (!e) return;
      host.querySelector('.pc-foot').innerHTML = '<span class="loading">Memuat riwayat</span>';
      S.cmp.forEach(c => { loadCmp(c); });
      const h = await Quotes.history(e, tf);
      if (my !== S.req || e !== S.entity) return;
      S.hist = h; S.histReq = my; S.bars = clean(h.bars);
      draw();
    }
    function renderStudyButtons() {
      host.querySelector('.pc-studies').innerHTML = studies.map(st => `<button type="button" class="mini-btn" data-study="${esc(st.id)}" aria-pressed="${S.active.has(st.id)}" title="${esc(st.title || st.label)}">${esc(st.label)}</button>`).join('');
    }
    host.addEventListener('click', ev => {
      const tb = ev.target.closest('.pc-tf [data-tf]');
      if (tb) { S.tf = tb.dataset.tf; Store.set('pcTf', S.tf); host.querySelectorAll('.pc-tf [data-tf]').forEach(b => b.setAttribute('aria-pressed', String(b === tb))); load(); return; }
      const ty = ev.target.closest('.pc-type [data-type]');
      if (ty) { S.type = ty.dataset.type; Store.set('pcType', S.type); host.querySelectorAll('.pc-type [data-type]').forEach(b => b.setAttribute('aria-pressed', String(b === ty))); draw(); return; }
      const sb = ev.target.closest('[data-study]');
      if (sb) { const id = sb.dataset.study; S.active.has(id) ? S.active.delete(id) : S.active.add(id); Store.set('pcStudies', [...S.active]); renderStudyButtons(); draw(); return; }
      const del = ev.target.closest('[data-cmp-del]');
      if (del) { removeCompare(del.dataset.cmpDel); return; }
      if (ev.target.closest('.pc-reset')) chart.timeScale().fitContent();
    });
    const form = host.querySelector('.pc-cmp'), input = host.querySelector('.pc-cmp-in'), dl = host.querySelector('datalist');
    form.addEventListener('submit', ev => { ev.preventDefault(); addCompare(input.value); input.value = ''; });
    /* saran dari registri entitas (hanya aset yang punya harga) */
    input.addEventListener('input', () => {
      const q = input.value.trim();
      const list = q ? REG.search(q, { types: PRICED, limit: 8 }) : [];
      dl.innerHTML = list.map(r => `<option value="${esc(r.entity.symbol || r.entity.name)}">${esc(r.entity.name + ' · ' + (REG.types[r.entity.type] || r.entity.type))}</option>`).join('');
    });
    renderStudyButtons();
    return {
      set(entity) {
        S.entity = entity; S.bars = []; S.hist = null; S.histReq = 0;
        S.cmp = S.cmp.filter(c => !entity || c.e.id !== entity.id);
        clearSeries(); legend(null); renderChips(); load();
      },
      reload: load,
      get state() {
        return { tf: S.tf, type: S.type, bars: S.bars.length, quality: S.hist && S.hist.quality, loading: S.histReq !== S.req, studies: [...S.active], drawn: S.drawn.slice(), notes: { ...S.notes },
          normalized: !!S.norm, compare: S.cmp.map(c => ({ id: c.e.id, bars: c.bars.length, quality: c.hist ? c.hist.quality : null, loaded: !!c.hist })) };
      },
      get bars() { return S.bars; },
      destroy() { S.req++; chart.remove(); },
    };
  }
  return { create, studies, register(st) { if (!studies.some(x => x.id === st.id)) studies.push(st); } };
})();
