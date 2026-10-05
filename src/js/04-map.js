/* =====================================================================
   PETA DUNIA: digambar manual di <canvas> (tanpa library peta)
   - proyeksi Natural Earth
   - negara diwarnai menurut perubahan indeks hari ini
   - bayangan malam dari posisi matahari sungguhan
   - mercusuar berdenyut di bursa yang sedang buka
   ===================================================================== */

function decodeWorld(topo) {
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
  const ring = idxs => {
    const out = [];
    for (const i of idxs) {
      const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
      for (let k = out.length ? 1 : 0; k < a.length; k++) out.push(a[k]);
    }
    return out;
  };
  return topo.objects.countries.geometries.map(g => {
    let rings = [];
    if (g.type === 'Polygon') rings = g.arcs.map(ring);
    else if (g.type === 'MultiPolygon') g.arcs.forEach(poly => poly.forEach(r => rings.push(ring(r))));
    return { id: g.id, name: g.properties.name, rings };
  });
}

/* posisi matahari: lintang (deklinasi) & bujur titik tepat di bawah matahari */
function sunPos(date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD);
  const e = 23.439 - 0.00000036 * d;
  const ra = Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD;
  const dec = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) / RAD;
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let lon = ra - gmst * 15;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec, lon };
}

const MapView = (() => {
  const body = $('#mapBody'), base = $('#mapBase'), top = $('#mapTop'), tip = $('#mapTip');
  const bctx = base.getContext('2d'), tctx = top.getContext('2d');
  const LAT_TOP = 83, LAT_BOT = -57;

  const countries = decodeWorld(WORLD_TOPO).filter(c => c.name !== 'Antarctica');
  const byName = new Map(countries.map(c => [c.name, c]));
  const mlist = Object.values(MARKETS);
  mlist.forEach((m, i) => { m.phase = (i * 0.137) % 1; });

  let W = 0, H = 0, dpr = 1, S = 1, OX = 0, OY = 0;
  let hover = null, selected = null, labelRects = [];

  /* ---- proyeksi Natural Earth I (hasilnya sama dengan d3-geo) ---- */
  function ne(lon, lat) {
    const l = lon * RAD, p = lat * RAD, p2 = p * p, p4 = p2 * p2;
    return [
      l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))),
    ];
  }
  const XR = ne(180, 0)[0];
  const Y1 = ne(0, LAT_TOP)[1], Y0 = ne(0, LAT_BOT)[1];
  function project(lon, lat) {
    const [x, y] = ne(lon, lat);
    return [OX + x * S, OY - y * S];
  }

  function rebuild() {
    S = Math.min((W - 14) / (2 * XR), (H - 14) / (Y1 - Y0));
    OX = W / 2;
    OY = H / 2 + (Y1 + Y0) / 2 * S;
    for (const c of countries) {
      c.px = c.rings.map(r => r.map(([lo, la]) => project(lo, la)));
      const p = new Path2D();
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const r of c.px) {
        r.forEach(([x, y], i) => {
          i ? p.lineTo(x, y) : p.moveTo(x, y);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        });
        p.closePath();
      }
      c.path = p; c.bbox = [x0, y0, x1, y1];
    }
    for (const m of mlist) m.xy = project(m.lon, m.lat);
  }

  function heat(p) {
    if (!Number.isFinite(p)) return 'rgba(0,0,0,0)';
    const t = clamp(p / 0.02, -1, 1);
    const a = 0.16 + 0.5 * Math.pow(Math.abs(t), 0.8);
    return t >= 0 ? `rgba(52,209,164,${a.toFixed(3)})` : `rgba(255,111,97,${a.toFixed(3)})`;
  }

  function outlinePath() {
    const p = new Path2D();
    let first = true;
    const add = (lo, la) => { const [x, y] = project(lo, la); if (first) { p.moveTo(x, y); first = false; } else p.lineTo(x, y); };
    for (let la = LAT_TOP; la >= LAT_BOT; la -= 2) add(-180, la);
    for (let lo = -180; lo <= 180; lo += 4) add(lo, LAT_BOT);
    for (let la = LAT_BOT; la <= LAT_TOP; la += 2) add(180, la);
    for (let lo = 180; lo >= -180; lo -= 4) add(lo, LAT_TOP);
    p.closePath();
    return p;
  }

  /* Bayangan malam = SATU poligon. Garis terminator (batas siang-malam) dihitung dari
     tan(lintang) = -cos(sudut jam) / tan(deklinasi matahari). Jauh lebih ringan dari grid sel. */
  function drawNight(c) {
    const { lat: dec, lon: lonSub } = sunPos(new Date());
    const t = Math.abs(Math.tan(dec * RAD)) < 1e-6 ? 1e-6 : Math.tan(dec * RAD);
    const pts = [];
    for (let lo = -180; lo <= 180; lo += 2) {
      const lat = Math.atan(-Math.cos((lo - lonSub) * RAD) / t) / RAD;
      pts.push(project(lo, clamp(lat, LAT_BOT, LAT_TOP)));
    }
    const edge = dec >= 0 ? LAT_BOT : LAT_TOP;        // kutub yang sedang gelap
    const night = new Path2D();
    pts.forEach(([x, y], i) => (i ? night.lineTo(x, y) : night.moveTo(x, y)));
    for (let lo = 180; lo >= -180; lo -= 6) { const [x, y] = project(lo, edge); night.lineTo(x, y); }
    night.closePath();
    c.fillStyle = 'rgba(2,8,18,0.42)'; c.fill(night);
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.setLineDash([3, 4]); c.lineWidth = 1; c.strokeStyle = 'rgba(224,177,90,0.30)'; c.stroke(); c.setLineDash([]);
    // titik tepat di bawah matahari
    const [sx, sy] = project(lonSub, clamp(dec, LAT_BOT, LAT_TOP));
    c.strokeStyle = 'rgba(243,215,154,0.55)'; c.lineWidth = 1.2;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      c.beginPath(); c.moveTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7); c.lineTo(sx + Math.cos(a) * 11, sy + Math.sin(a) * 11); c.stroke();
    }
    c.beginPath(); c.arc(sx, sy, 4, 0, 6.2832); c.fillStyle = '#f3d79a'; c.fill();
  }

  function drawBase() {
    if (W < 10 || H < 10) return;
    const c = bctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const outline = outlinePath();
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b2139'); g.addColorStop(1, '#07172a');
    c.fillStyle = g; c.fill(outline);

    c.save(); c.clip(outline);
    // garis lintang dan bujur
    c.lineWidth = 0.7;
    for (let lo = -180; lo <= 180; lo += 30) {
      c.beginPath();
      for (let la = LAT_BOT; la <= LAT_TOP; la += 3) { const [x, y] = project(lo, la); la === LAT_BOT ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.strokeStyle = 'rgba(224,177,90,0.09)'; c.stroke();
    }
    for (let la = -30; la <= 60; la += 30) {
      c.beginPath();
      for (let lo = -180; lo <= 180; lo += 5) { const [x, y] = project(lo, la); lo === -180 ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.strokeStyle = la === 0 ? 'rgba(224,177,90,0.20)' : 'rgba(224,177,90,0.09)'; c.stroke();
    }
    // daratan
    c.lineWidth = 0.6; c.strokeStyle = 'rgba(86,150,200,0.5)';
    for (const co of countries) { c.fillStyle = '#133656'; c.fill(co.path, 'evenodd'); c.stroke(co.path); }
    drawNight(c);
    c.restore();
    c.lineWidth = 1; c.strokeStyle = 'rgba(42,84,120,0.9)'; c.stroke(outline);
    drawTop(performance.now());
  }

  /* ---- lapisan atas: mercusuar, label, sorotan ---- */
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  const _mw = new Map();
  function mw(c, font, text) {
    const k = font + '|' + text;
    let w = _mw.get(k);
    if (w === undefined) { c.font = font; w = c.measureText(text).width; _mw.set(k, w); if (_mw.size > 400) _mw.clear(); }
    return w;
  }
  const F1 = '600 11px "Plus Jakarta Sans", system-ui, sans-serif', F2 = '500 11px "IBM Plex Mono", monospace';
  function drawTop(ts) {
    if (W < 10) return;
    const c = tctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const t = ts / 1000;
    labelRects = [];
    const showLabels = W >= 640;

    for (const m of mlist) {                          // warna negara menurut naik-turun indeks
      const co = m.country && byName.get(m.country);
      const pv = pct(BY[m.idx]);
      if (co && Number.isFinite(pv)) { c.fillStyle = heat(pv); c.fill(co.path, 'evenodd'); }
    }

    const hi = [];
    if (selected) hi.push([selected, true]);
    if (hover && hover.id !== selected) hi.push([hover.id, false]);
    for (const [id, sel] of hi) {
      const co = MARKETS[id].country && byName.get(MARKETS[id].country);
      if (co) { c.lineWidth = sel ? 1.8 : 1.3; c.strokeStyle = sel ? '#e0b15a' : 'rgba(232,238,246,0.85)'; c.stroke(co.path); }
    }

    for (const m of mlist) {
      const st = statusOf(m.id), inst = BY[m.idx], p = pct(inst);
      const [x, y] = m.xy;
      const isSel = m.id === selected, isHov = hover && hover.id === m.id;
      if (st.open && !REDUCED) {
        const ph = (t * 0.45 + m.phase) % 1;
        c.beginPath(); c.arc(x, y, 3 + ph * 12, 0, 6.2832);
        c.strokeStyle = `rgba(224,177,90,${(0.6 * (1 - ph)).toFixed(3)})`; c.lineWidth = 1.2; c.stroke();
      }
      c.beginPath(); c.arc(x, y, isHov || isSel ? 4.4 : 3.3, 0, 6.2832);
      c.fillStyle = st.open ? '#e0b15a' : '#6b829c'; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = '#060e1a'; c.stroke();
      if (isSel) { c.beginPath(); c.arc(x, y, 8, 0, 6.2832); c.strokeStyle = '#e0b15a'; c.lineWidth = 1.2; c.stroke(); }

      if (showLabels || isHov || isSel) {
        const code = m.idx, ptxt = fmtPct(p, 2);
        const w1 = mw(c, F1, code), w2 = mw(c, F2, ptxt);
        const bw = w1 + w2 + 18, bh = 19;
        let bx = m.lbl[2] === 'right' ? x + m.lbl[0] - bw : x + m.lbl[0];
        let by = y + m.lbl[1] - bh / 2;
        bx = clamp(bx, 2, W - bw - 2); by = clamp(by, 2, H - bh - 2);
        roundRect(c, bx, by, bw, bh, 5);
        c.fillStyle = 'rgba(6,14,26,0.84)'; c.fill();
        c.lineWidth = 1; c.strokeStyle = isSel ? '#e0b15a' : isHov ? '#93a8bf' : 'rgba(30,64,98,0.95)'; c.stroke();
        c.textBaseline = 'middle';
        c.font = F1;
        c.fillStyle = st.open ? '#e8eef6' : '#93a8bf'; c.fillText(code, bx + 7, by + bh / 2 + 0.5);
        c.font = F2;
        c.fillStyle = !Number.isFinite(p) ? '#7188a3' : p >= 0 ? '#34d1a4' : '#ff6f61'; c.fillText(Number.isFinite(p) ? ptxt : 'n/a', bx + 11 + w1, by + bh / 2 + 0.5);
        labelRects.push({ id: m.id, x: bx, y: by, w: bw, h: bh });
      }
    }
  }

  /* ---- interaksi ---- */
  function inRing(r, x, y) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inCountry(co, x, y) {
    const [x0, y0, x1, y1] = co.bbox;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    let inside = false;
    for (const r of co.px) if (inRing(r, x, y)) inside = !inside;
    return inside;
  }
  function hit(x, y) {
    for (const r of labelRects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { id: r.id };
    for (const m of mlist) if (Math.hypot(x - m.xy[0], y - m.xy[1]) <= 11) return { id: m.id };
    for (const m of mlist) {
      const co = m.country && byName.get(m.country);
      if (co && inCountry(co, x, y)) return { id: m.id };
    }
    return null;
  }
  function renderTip(px, py) {
    if (!hover) { tip.hidden = true; return; }
    const m = MARKETS[hover.id], inst = BY[m.idx], st = statusOf(m.id), p = pct(inst);
    tip.innerHTML =
      `<div class="t-city">${esc(m.city)}</div><div class="t-ex">${esc(m.ex)}, ${esc(inst.name)}</div>` +
      `<div class="t-row"><span class="t-px">${fmt(inst.price, 2)}</span><span class="pill ${sign(p)}">${fmtPct(p)}</span></div>` +
      `<div class="t-st ${st.open ? 'open' : ''}"><i></i>${st.label}${st.detail ? ', ' + st.detail : ''}</div>` +
      `<div class="t-st">${qBadge(inst.quality || 'unavailable')}${inst.srcName ? ' ' + esc(inst.srcName) : ''}</div>`;
    tip.hidden = false;
    if (px !== undefined) {
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(px + 16, W - tw - 6) + 'px';
      tip.style.top = Math.min(Math.max(py - th - 12, 6), H - th - 6) + 'px';
    }
  }
  let lastPtr = null;
  top.addEventListener('pointermove', e => {
    const r = top.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    lastPtr = [x, y];
    const h = hit(x, y);
    const changed = (h && h.id) !== (hover && hover.id);
    hover = h;
    top.style.cursor = h ? 'pointer' : 'default';
    if (changed && REDUCED) drawTop(performance.now());
    renderTip(x, y);
  });
  top.addEventListener('pointerleave', () => { hover = null; lastPtr = null; tip.hidden = true; if (REDUCED) drawTop(performance.now()); });
  top.addEventListener('click', e => {
    const r = top.getBoundingClientRect();
    const h = hit(e.clientX - r.left, e.clientY - r.top);
    if (h) bus.emit('pickMarket', h.id);
  });

  function resize() {
    W = body.clientWidth; H = body.clientHeight;
    if (W < 10 || H < 10) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [base, top]) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    rebuild();
    drawBase();
  }
  new ResizeObserver(resize).observe(body);

  function updateMeta() {
    const [o, n] = openCount();
    $('#mapMeta').textContent = `${o} dari ${n} bursa sedang buka`;
    base.setAttribute('aria-label', `Peta dunia berwarna menurut perubahan indeks saham hari ini. ${o} dari ${n} bursa sedang buka.`);
  }
  updateMeta();
  setInterval(updateMeta, 5000);
  setInterval(drawBase, 60000);                          // bayangan malam bergeser pelan, cukup tiap menit
  bus.on('tick', () => { if (REDUCED) drawTop(performance.now()); if (hover && lastPtr) renderTip(lastPtr[0], lastPtr[1]); });
  if (!REDUCED) {                                        // denyut mercusuar, maks ±15 gambar per detik
    let last = 0;
    const loop = ts => {
      if (ts - last > 66 && !document.hidden && !body.hidden) { last = ts; drawTop(ts); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  return {
    setSelected(id) { selected = id; if (REDUCED) drawTop(performance.now()); },
    redraw: drawBase,
    resize,
  };
})();

/* =====================================================================
   JAM BURSA: sesi tiap bursa dalam 24 jam waktu lokal kamu
   ===================================================================== */
const HoursView = (() => {
  const el = $('#hoursBody');
  function tzOffsetMin(tz, date) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
    const s = (f.formatToParts(date).find(p => p.type === 'timeZoneName') || {}).value || 'GMT';
    const m = /GMT([+\-\u2212])(\d{1,2})(?::?(\d{2}))?/.exec(s);
    if (!m) return 0;
    return (m[1] === '+' ? 1 : -1) * ((+m[2]) * 60 + (+(m[3] || 0)));
  }
  function render() {
    if (el.hidden) return;
    const now = new Date();
    const viewerOff = -now.getTimezoneOffset();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rows = Object.values(MARKETS).map(m => ({ m, off: tzOffsetMin(m.tz, now) })).sort((a, b) => b.off - a.off);
    let ticks = '';
    for (let h = 0; h <= 24; h += 3) ticks += `<span style="left:${h / 24 * 100}%">${String(h % 24).padStart(2, '0')}</span>`;
    let html = `<div class="h-axis"><span></span><div class="h-ticks">${ticks}</div></div>`;
    for (const { m, off } of rows) {
      const open = statusOf(m.id).open;
      let bars = '';
      for (const [s, e] of m.sess) {
        const start = (((s - off + viewerOff) % 1440) + 1440) % 1440, len = e - s;
        const seg = (a, l) => `<i class="seg-bar" style="left:${a / 14.4}%;width:${l / 14.4}%"></i>`;
        if (start + len <= 1440) bars += seg(start, len); else bars += seg(start, 1440 - start) + seg(0, start + len - 1440);
      }
      html += `<button type="button" class="hrow ${open ? 'open' : ''}" data-mkt="${m.id}" aria-label="${esc(m.city)}, ${open ? 'sedang buka' : 'tutup'}">` +
        `<span class="hn">${esc(m.city)}<small>${esc(m.ex.split(' ')[0])}</small></span>` +
        `<span class="htrack">${bars}<i class="h-now" style="left:${nowMin / 14.4}%"></i></span></button>`;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    html += `<p class="h-note">Sumbu waktu mengikuti zona waktumu (${esc(tz)}). Menampilkan sesi reguler pada hari bursa, tanpa hari libur. Garis putih adalah sekarang.</p>`;
    el.innerHTML = html;
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('.hrow');
    if (b) bus.emit('pickMarket', b.dataset.mkt);
  });
  setInterval(render, 30000);
  return { render };
})();
