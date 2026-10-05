/* =====================================================================
   KAS DAN ALOKASI: simulasi surplus kas bisnis (port dari cash.py)
   Ini simulasi berbasis asumsi yang bisa diubah. Bukan prediksi,
   bukan nasihat investasi.
   ===================================================================== */
const Cash = (() => {
  const BUCKETS = ['Likuid dan aman', 'Pendapatan tetap', 'Saham dan indeks'];
  const HINT = ['deposito, SBN jangka pendek, reksa dana pasar uang', 'obligasi, reksa dana pendapatan tetap', 'saham individual atau reksa dana indeks'];
  const COLORS = ['#6fb1ff', '#e0b15a', '#34d1a4'];
  const PROFILES = { Konservatif: [0.70, 0.25, 0.05], Moderat: [0.40, 0.35, 0.25], Agresif: [0.15, 0.25, 0.60] };
  const SCEN = ['Pesimis', 'Dasar', 'Optimis'];
  const SCOL = ['#ff6f61', '#e0b15a', '#34d1a4'];
  const DEF = {
    cash: 300000000, months: 6, profile: 'Moderat', years: 5, add: 0,
    flow: [['Apr', 42e6, 30e6], ['Mei', 38e6, 31e6], ['Jun', 45e6, 29e6], ['Jul', 41e6, 33e6], ['Agu', 47e6, 30e6], ['Sep', 44e6, 32e6]],
    rates: [[3, 4.5, 5.5], [4, 6.5, 8], [-5, 9, 18]],   // % per tahun: PLACEHOLDER, ganti dengan data riil
  };
  const st = Object.assign(JSON.parse(JSON.stringify(DEF)), Store.get('cash', {}));
  if (!Array.isArray(st.flow) || st.flow.length < 1) st.flow = DEF.flow;
  if (!Array.isArray(st.rates) || st.rates.length !== 3) st.rates = DEF.rates;

  const rp = n => Number.isFinite(n) ? 'Rp ' + Math.round(n).toLocaleString('id-ID') : '–';
  const rpShort = n => {
    const a = Math.abs(n), s = n < 0 ? '\u2212' : '';
    if (a >= 1e12) return s + (a / 1e12).toFixed(1).replace('.', ',') + ' T';
    if (a >= 1e9) return s + (a / 1e9).toFixed(1).replace('.', ',') + ' M';
    if (a >= 1e6) return s + (a / 1e6).toFixed(0) + ' jt';
    return s + Math.round(a).toLocaleString('id-ID');
  };
  const parseNum = s => { const n = +String(s).replace(/[^\d]/g, ''); return Number.isFinite(n) ? n : 0; };
  const dots = n => Math.round(n).toLocaleString('id-ID');

  function summarize() {
    const rows = st.flow.filter(r => Number.isFinite(r[1]) && Number.isFinite(r[2]));
    if (!rows.length) return null;
    const inc = rows.reduce((a, r) => a + r[1], 0) / rows.length;
    const exp = rows.reduce((a, r) => a + r[2], 0) / rows.length;
    const net = inc - exp;
    const reserve = exp * st.months;
    const surplus = Math.max(st.cash - reserve, 0);
    const runway = net >= 0 ? Infinity : st.cash / -net;
    const coverage = exp > 0 ? st.cash / exp : Infinity;
    let status = 'Sehat';
    if (coverage < 3 || (net < 0 && runway < 6)) status = 'Buruk';
    else if (coverage < st.months || net < 0) status = 'Waspada';
    return { rows, inc, exp, net, reserve, surplus, runway, coverage, status };
  }

  function project(amount, weights) {
    return SCEN.map((_, si) => {
      const r = weights.reduce((a, w, bi) => a + w * st.rates[bi][si] / 100, 0);
      let v = amount; const vals = [v];
      for (let y = 0; y < st.years; y++) { v = v * (1 + r) + st.add * 12; vals.push(v); }
      return vals;
    });
  }

  /* ---------- grafik SVG ---------- */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  function svgFlow(rows) {
    const Wd = 640, Ht = 250, L = 58, R = 12, T = 14, B = 28;
    const cum = []; rows.reduce((a, r) => { a += r[1] - r[2]; cum.push(a); return a; }, 0);
    const maxV = niceMax(Math.max(...rows.map(r => Math.max(r[1], r[2])), ...cum, 1));
    const minV = Math.min(0, ...cum) < 0 ? -niceMax(-Math.min(0, ...cum)) : 0;
    const y = v => T + (Ht - T - B) * (1 - (v - minV) / (maxV - minV));
    const gw = (Wd - L - R) / rows.length, bw = Math.min(gw * 0.3, 26);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = minV + (maxV - minV) * k / 4;
      g += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="#17314a" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 3.5}" text-anchor="end">${rpShort(v)}</text>`;
    }
    let bars = '', pts = [];
    rows.forEach((r, i) => {
      const cx = L + gw * (i + 0.5);
      bars += `<rect x="${cx - bw - 1.5}" y="${y(r[1])}" width="${bw}" height="${Math.max(y(0) - y(r[1]), 0)}" rx="2" fill="#34d1a4"/>`;
      bars += `<rect x="${cx + 1.5}" y="${y(r[2])}" width="${bw}" height="${Math.max(y(0) - y(r[2]), 0)}" rx="2" fill="#ff6f61"/>`;
      bars += `<text x="${cx}" y="${Ht - 9}" text-anchor="middle">${esc(r[0])}</text>`;
      pts.push([cx, y(cum[i])]);
    });
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const dotsSvg = pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#0a1727" stroke="#e0b15a" stroke-width="1.8"/>`).join('');
    return `<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Pemasukan dan pengeluaran per bulan beserta akumulasi arus kas bersih">${g}${bars}<path d="${line}" fill="none" stroke="#e0b15a" stroke-width="2.2"/>${dotsSvg}</svg>` +
      `<div class="svg-legend"><span><i style="background:#34d1a4"></i>Pemasukan</span><span><i style="background:#ff6f61"></i>Pengeluaran</span><span><i style="background:#e0b15a"></i>Akumulasi arus kas bersih</span></div>`;
  }
  function svgProj(series) {
    const Wd = 640, Ht = 270, L = 62, R = 14, T = 14, B = 28, n = st.years;
    const maxV = niceMax(Math.max(...series.flat()));
    const minV = Math.min(...series.flat()) < 0 ? -niceMax(-Math.min(...series.flat())) : 0;
    const x = i => L + (Wd - L - R) * i / n;
    const y = v => T + (Ht - T - B) * (1 - (v - minV) / (maxV - minV));
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = minV + (maxV - minV) * k / 4;
      g += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="#17314a"/><text x="${L - 8}" y="${y(v) + 3.5}" text-anchor="end">${rpShort(v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 8));
    for (let i = 0; i <= n; i += step) g += `<text x="${x(i)}" y="${Ht - 9}" text-anchor="middle">${i} th</text>`;
    const lines = series.map((s, si) => {
      const d = s.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
      return `<path d="${d}" fill="none" stroke="${SCOL[si]}" stroke-width="2.4"/><circle cx="${x(n)}" cy="${y(s[n])}" r="3.6" fill="${SCOL[si]}"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Proyeksi nilai surplus dalam tiga skenario">${g}${lines}</svg>` +
      `<div class="svg-legend">${SCEN.map((s, i) => `<span><i style="background:${SCOL[i]}"></i>${s}: <strong class="num">${rpShort(series[i][n])}</strong></span>`).join('')}</div>`;
  }
  function svgDonut(w) {
    const r = 46, c = 2 * Math.PI * r;
    let off = 0, arcs = '';
    w.forEach((v, i) => {
      arcs += `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${COLORS[i]}" stroke-width="16" stroke-dasharray="${(v * c).toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-off * c).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
      off += v;
    });
    return `<svg viewBox="0 0 120 120" style="max-width:150px;margin:auto" role="img" aria-label="Pembagian alokasi">${arcs}</svg>`;
  }

  function badge(label) {
    const cls = label === 'Sehat' ? 'up' : label === 'Waspada' ? '' : 'down';
    return `<strong class="word ${cls}" ${label === 'Waspada' ? 'style="color:var(--brass)"' : ''}>${label}</strong>`;
  }

  function render() {
    const out = $('#cashOut');
    const sm = summarize();
    if (!sm) { out.innerHTML = '<div class="card callout">Isi minimal satu bulan data pemasukan dan pengeluaran.</div>'; return; }
    const w = PROFILES[st.profile];
    const runwayTxt = sm.runway === Infinity ? 'Tak terbatas' : sm.runway.toFixed(1) + ' bulan';
    let html = `<div class="kpis">
      <div class="kpi"><small>Status kas</small>${badge(sm.status)}</div>
      <div class="kpi"><small>Arus kas bersih per bulan</small><strong class="${sm.net >= 0 ? 'up' : 'down'}">${rp(sm.net)}</strong></div>
      <div class="kpi"><small>Kas cukup untuk</small><strong>${sm.coverage === Infinity ? '–' : sm.coverage.toFixed(1)} bulan biaya</strong></div>
      <div class="kpi"><small>Runway (bila arus kas negatif)</small><strong>${runwayTxt}</strong></div></div>`;
    html += `<section class="card"><div class="card-head"><h2>Pergerakan uang bisnis</h2></div><div class="svgbox">${svgFlow(sm.rows)}</div></section>`;
    html += `<section class="card"><div class="card-head"><h2>Surplus yang bisa dialokasikan</h2></div>
      <p class="callout">Cadangan darurat <strong>${st.months} bulan</strong> setara <strong>${rp(sm.reserve)}</strong>. Kas ${rp(st.cash)} dikurangi cadangan menyisakan surplus <strong>${rp(sm.surplus)}</strong>.</p></section>`;

    if (sm.surplus <= 0) {
      html += `<section class="card"><p class="callout">Belum ada surplus: kasmu masih di bawah target cadangan darurat. Fokus menambah cadangan dulu sebelum berinvestasi.</p></section>`;
    } else {
      const proj = project(sm.surplus, w);
      html += `<div class="cols2">
        <section class="card"><div class="card-head"><h2>Alokasi profil ${esc(st.profile.toLowerCase())}</h2></div>
          <div class="svgbox">${svgDonut(w)}
          <table class="alloc"><thead><tr><th scope="col">Kantong</th><th scope="col">Bobot</th><th scope="col">Nominal</th></tr></thead><tbody>
          ${BUCKETS.map((b, i) => `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COLORS[i]};margin-right:7px"></i>${b}<small>${HINT[i]}</small></td><td class="num">${Math.round(w[i] * 100)}%</td><td>${rp(sm.surplus * w[i])}</td></tr>`).join('')}
          </tbody></table></div></section>
        <section class="card"><div class="card-head"><h2>Proyeksi ${st.years} tahun (simulasi)</h2></div><div class="svgbox">${svgProj(proj)}</div></section></div>`;
      html += `<section class="card"><details class="rates"><summary>Asumsi imbal hasil per tahun (ubah sesuai data riil)</summary>
        <p class="hint" style="margin-bottom:10px">Angka bawaan hanya placeholder, bukan data historis dan bukan prediksi. Cek suku bunga deposito dan yield SBN terbaru sebelum dipakai.</p>
        <div class="rates-grid">${BUCKETS.map((b, bi) => `<fieldset><legend>${b}</legend>${SCEN.map((s, si) => `<label>${s} %<input type="number" step="0.5" data-r="${bi}-${si}" value="${st.rates[bi][si]}"></label>`).join('')}</fieldset>`).join('')}</div></details></section>`;

      const eq = sm.surplus * w[2];
      const cand = STOCKS.filter(i => i.type === 'stock').map(i => ({ i, h: evaluate(i) })).filter(x => x.h.label === 'Sehat').sort((a, b) => b.h.score - a.h.score);
      html += `<section class="card"><div class="card-head"><h2>Kandidat screening dari daftar saham</h2><span class="spacer"></span><span class="flag">Data simulasi</span></div>
        <p class="callout">Kantong saham profil ${esc(st.profile.toLowerCase())} bernilai <strong>${rp(eq)}</strong>. Saham di daftar kanan yang lolos skor fundamental (berlabel Sehat):</p>`;
      html += cand.length ? `<table class="cand"><thead><tr><th scope="col">Kode</th><th scope="col">Nama</th><th scope="col">Sektor</th><th scope="col" class="num">Skor</th><th scope="col" class="num">Piotroski</th></tr></thead><tbody>
        ${cand.map(({ i, h }) => `<tr><td><button type="button" data-pick="${i.sym}" style="color:var(--brass);font-weight:600">${i.sym}</button></td><td>${esc(i.name)}</td><td>${esc(i.sector)}</td><td class="num">${h.score.toFixed(0)}/100</td><td class="num">${h.p.score}/${h.p.available}</td></tr>`).join('')}</tbody></table>`
        : `<p class="callout">Tidak ada saham berlabel Sehat saat ini.</p>`;
      html += `<p class="warn">Ini hasil screening otomatis dari rasio keuangan sintetis, bukan rekomendasi beli. Skor fundamental tidak memperhitungkan harga (mahal atau murah), berita, atau valuasi, dan saham berlabel Sehat tetap bisa turun. Untuk uang sungguhan, konsultasikan ke penasihat keuangan berlisensi.</p></section>`;
    }
    out.innerHTML = html;
  }

  function save() { Store.set('cash', st); }

  function buildForm() {
    $('#cCash').value = dots(st.cash);
    $('#cAdd').value = dots(st.add);
    $('#cMonths').value = st.months; $('#cMonthsOut').textContent = st.months;
    $('#cYears').value = st.years; $('#cYearsOut').textContent = st.years;
    $$('#cProfile button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === st.profile)));
    $('#flowBody').innerHTML = st.flow.map((r, i) =>
      `<tr><td><input type="text" data-f="${i}-0" value="${esc(r[0])}" aria-label="Nama bulan ${i + 1}"></td>` +
      `<td><input inputmode="numeric" data-f="${i}-1" value="${dots(r[1])}" aria-label="Pemasukan ${esc(r[0])}"></td>` +
      `<td><input inputmode="numeric" data-f="${i}-2" value="${dots(r[2])}" aria-label="Pengeluaran ${esc(r[0])}"></td></tr>`).join('');
  }

  function bind() {
    const upd = () => { save(); render(); };
    $('#cCash').addEventListener('input', e => { st.cash = parseNum(e.target.value); upd(); });
    $('#cCash').addEventListener('change', e => { e.target.value = dots(st.cash); });
    $('#cAdd').addEventListener('input', e => { st.add = parseNum(e.target.value); upd(); });
    $('#cAdd').addEventListener('change', e => { e.target.value = dots(st.add); });
    $('#cMonths').addEventListener('input', e => { st.months = +e.target.value; $('#cMonthsOut').textContent = st.months; upd(); });
    $('#cYears').addEventListener('input', e => { st.years = +e.target.value; $('#cYearsOut').textContent = st.years; upd(); });
    $('#cProfile').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      st.profile = b.dataset.p;
      $$('#cProfile button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      upd();
    });
    $('#flowBody').addEventListener('input', e => {
      const f = e.target.dataset.f; if (!f) return;
      const [i, k] = f.split('-').map(Number);
      st.flow[i][k] = k === 0 ? e.target.value : parseNum(e.target.value);
      upd();
    });
    $('#flowBody').addEventListener('change', e => {
      const f = e.target.dataset.f; if (!f) return;
      const [i, k] = f.split('-').map(Number);
      if (k > 0) e.target.value = dots(st.flow[i][k]);
    });
    $('#cashOut').addEventListener('input', e => {
      const r = e.target.dataset.r; if (!r) return;
      const [bi, si] = r.split('-').map(Number);
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) { st.rates[bi][si] = v; save(); renderKeepRates(); }
    });
    $('#cashOut').addEventListener('click', e => {
      const b = e.target.closest('[data-pick]');
      if (b) bus.emit('pickSym', { sym: b.dataset.pick, go: true });
    });
  }
  /* saat mengetik asumsi, jangan bangun ulang kotak input (fokus akan hilang) */
  function renderKeepRates() {
    const sm = summarize(); if (!sm || sm.surplus <= 0) return;
    const proj = project(sm.surplus, PROFILES[st.profile]);
    const box = $$('#cashOut .cols2 .svgbox')[1];
    if (box) box.innerHTML = svgProj(proj);
  }

  return { init() { buildForm(); bind(); render(); }, render };
})();
