/* =====================================================================
   GLOBE 3D: bola bumi interaktif (proyeksi ortografis d3-geo di <canvas>)
   Tanpa WebGL supaya tetap jalan di laptop sekolah. Seret = putar,
   roda/cubit = zoom, klik = pilih negara/kapal/peristiwa.
   Lapisan: ekonomi (warna negara), pasar, berita, bencana, kapal, chokepoint,
   malam. Setiap lapisan hanya menggambar data nyata yang diberikan kepadanya.
   ===================================================================== */

/* ---------- topojson -> GeoJSON (struktur poligon dipertahankan untuk d3) ---------- */
function topoToFeatures(topo, objName = 'countries') {
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const ring = idx => {
    const out = [];
    for (const i of idx) {
      const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
      for (let k = out.length ? 1 : 0; k < a.length; k++) out.push(a[k]);
    }
    return out;
  };
  return topo.objects[objName].geometries.map(g => ({
    type: 'Feature', id: g.id, properties: { name: (g.properties || {}).name || '' },
    geometry: g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.arcs.map(ring) }
      : g.type === 'MultiPolygon' ? { type: 'MultiPolygon', coordinates: g.arcs.map(p => p.map(ring)) } : null,
  })).filter(f => f.geometry);
}

/* ---------- metadata negara (statis: kode ISO, mata uang, ibu kota) ---------- */
const COUNTRIES = COUNTRY_META.map(([iso3, iso2, numc, en, idn, cur, lat, lon, region, sub, capital, indep]) =>
  ({ iso3, iso2, num: numc, en, name: idn || en, cur, lat, lon, region, sub, capital, indep: !!indep }));
const C3 = new Map(COUNTRIES.map(c => [c.iso3, c]));
const C2 = new Map(COUNTRIES.map(c => [c.iso2, c]));
const CNUM = new Map(COUNTRIES.filter(c => c.num).map(c => [c.num, c]));
const WORLD_FEATURES = topoToFeatures(WORLD_TOPO);
/* nama di peta 110m yang tidak punya kode numerik */
const NAME_FIX = { 'Kosovo': 'XKX', 'N. Cyprus': null, 'Somaliland': null };
for (const f of WORLD_FEATURES) {
  const c = f.id ? CNUM.get(f.id) : (NAME_FIX[f.properties.name] ? C3.get(NAME_FIX[f.properties.name]) : null);
  f.iso3 = c ? c.iso3 : null;
}
const FEAT_BY_ISO3 = new Map(WORLD_FEATURES.filter(f => f.iso3).map(f => [f.iso3, f]));
/* daratan 1:50m dipecah per pulau + titik tengah & radius, supaya yang di luar layar bisa dilewati */
let LAND50 = null;
function land50() {
  if (LAND50 || typeof LAND50_TOPO === 'undefined') return LAND50;
  const polys = [];
  for (const f of topoToFeatures(LAND50_TOPO, 'land')) {
    const list = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const coords of list) {
      const g = { type: 'Polygon', coordinates: coords };
      const c = d3.geoCentroid(g);
      let r = 0;
      const ring = coords[0], step = Math.max(1, Math.floor(ring.length / 60));
      for (let i = 0; i < ring.length; i += step) r = Math.max(r, d3.geoDistance(c, ring[i]));
      polys.push({ g, c, r: Math.min(r + 0.02, Math.PI) });
    }
  }
  return (LAND50 = polys);
}
function countryCentroid(iso3) {
  const f = FEAT_BY_ISO3.get(iso3);
  if (f) {
    /* pakai poligon terbesar supaya titik tengah tidak jatuh di laut (mis. negara kepulauan) */
    if (f.geometry.type === 'MultiPolygon') {
      let best = null, area = -1;
      for (const poly of f.geometry.coordinates) { const g = { type: 'Polygon', coordinates: poly }, a = d3.geoArea(g); if (a > area) { area = a; best = g; } }
      return d3.geoCentroid(best);
    }
    return d3.geoCentroid(f);
  }
  const c = C3.get(iso3);
  return c ? [c.lon, c.lat] : null;
}

/* ---------- skala warna: turun (karang) - netral - naik (hijau laut) ---------- */
function mixColor(a, b, t) {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function divergingColor(t) {          // t di -1..1; positif = baik
  t = clamp(t, -1, 1);
  return t >= 0 ? mixColor('2b4560', '34d1a4', Math.pow(t, 0.85)) : mixColor('2b4560', 'ff6f61', Math.pow(-t, 0.85));
}

const SHIP_COLORS = { tanker: '#ff9f6b', gas: '#c39bff', cargo: '#6fb1ff', passenger: '#7ee0c3', fishing: '#c8d36b', tug: '#93a8bf', military: '#e8eef6', leisure: '#93a8bf', other: '#7188a3', unknown: '#5d7690' };
const SHIP_LABELS = { tanker: 'Tanker', gas: 'Tanker gas (dari nama)', cargo: 'Kargo', passenger: 'Penumpang', fishing: 'Penangkap ikan', tug: 'Tunda/pandu', military: 'Militer', leisure: 'Layar/pesiar', other: 'Lainnya', unknown: 'Tipe belum diketahui' };
const HAZ_LABEL = { EQ: 'Gempa', TC: 'Siklon tropis', FL: 'Banjir', VO: 'Gunung api', DR: 'Kekeringan', WF: 'Kebakaran hutan', TS: 'Tsunami' };

function createGlobe(host, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'globe-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', opts.label || 'Globe 3D interaktif. Seret untuk memutar, gulir untuk zoom.');
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.hidden = true;
  host.appendChild(tip);
  const ctx = canvas.getContext('2d');

  const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(proj, ctx);
  const grat = d3.geoGraticule10();
  const sphere = { type: 'Sphere' };

  let W = 0, H = 0, dpr = 1, R = 100;
  let rot = opts.rotate ? opts.rotate.slice() : [-105, -5, 0];
  let zoom = opts.zoom || 1;
  let dirty = true, auto = opts.autoRotate !== false && !REDUCED, lastUser = 0, lastAuto = null, noAutoResume = false;
  let hover = null, selected = null, flight = null;
  const L = {                                       // data lapisan
    choropleth: null, markets: [], news: [], hazards: [], ships: [], chokepoints: [], boxes: [],
  };
  const vis = Object.assign({ choropleth: true, markets: true, news: true, hazards: true, ships: true, chokepoints: true, night: true, boxes: false }, opts.visible || {});
  const shipAnim = new Map();                      // mmsi -> {from:[lon,lat], to:[lon,lat], t0}
  let pickables = [];                              // titik yang tampil, untuk klik/hover

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(10, r.width); H = Math.max(10, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    R = Math.min(W, H) / 2 - 12;
    dirty = true;
  }
  function applyProj() { proj.scale(R * zoom).translate([W / 2, H / 2]).rotate(rot); }

  const center = () => [-rot[0], -rot[1]];
  function visible(lon, lat) { return d3.geoDistance([lon, lat], center()) < Math.PI / 2 - 0.02; }

  /* ---------------- menggambar ---------------- */
  function draw(now) {
    if (W < 20) return;
    const t0 = performance.now();
    applyProj();
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const s = proj.scale(), cx = W / 2, cy = H / 2;

    // atmosfer tipis di luar bola
    const atm = c.createRadialGradient(cx, cy, s * 0.96, cx, cy, s * 1.12);
    atm.addColorStop(0, 'rgba(111,177,255,0.22)'); atm.addColorStop(1, 'rgba(111,177,255,0)');
    c.fillStyle = atm; c.beginPath(); c.arc(cx, cy, s * 1.12, 0, 6.2832); c.fill();
    // laut dengan bayangan bola (kesan 3D)
    const sea = c.createRadialGradient(cx - s * 0.35, cy - s * 0.4, s * 0.1, cx, cy, s);
    sea.addColorStop(0, '#0f2d4d'); sea.addColorStop(0.7, '#0a2240'); sea.addColorStop(1, '#061527');
    c.beginPath(); path(sphere); c.fillStyle = sea; c.fill();
    // garis lintang/bujur
    c.beginPath(); path(grat); c.strokeStyle = 'rgba(224,177,90,0.10)'; c.lineWidth = 0.6; c.stroke();

    // zoom dekat: garis pantai 1:50m (hanya pulau yang terlihat), batas negara tipis
    const near = zoom >= 5 && land50();
    if (near) {
      const viewR = Math.asin(Math.min(1, Math.hypot(W, H) / 2 / s)) + 0.01, cen = center();
      c.beginPath();
      for (const p of LAND50) if (d3.geoDistance(p.c, cen) - p.r < viewR) path(p.g);
      c.fillStyle = '#1e4769'; c.fill('evenodd');
      c.strokeStyle = 'rgba(140,190,230,0.7)'; c.lineWidth = 0.8; c.stroke();
      c.beginPath(); for (const f of WORLD_FEATURES) path(f);
      c.strokeStyle = 'rgba(224,177,90,0.18)'; c.lineWidth = 0.6; c.setLineDash([2, 3]); c.stroke(); c.setLineDash([]);
    }
    // daratan + warna ekonomi
    const ch = vis.choropleth && L.choropleth;
    if (!near) for (const f of WORLD_FEATURES) {
      let fill = '#16395c';
      if (ch) {
        const v = f.iso3 ? ch.values.get(f.iso3) : undefined;
        fill = v === undefined || v === null || !Number.isFinite(v) ? '#1a2c40' : ch.color(v);
      }
      c.beginPath(); path(f); c.fillStyle = fill; c.fill();
    }
    if (!near) { c.beginPath(); for (const f of WORLD_FEATURES) path(f); c.strokeStyle = 'rgba(120,170,215,0.42)'; c.lineWidth = 0.5; c.stroke(); }
    // sorotan negara
    for (const [iso, col, w] of [[hover && hover.type === 'country' ? hover.iso3 : null, 'rgba(232,238,246,0.85)', 1.2], [selected && selected.type === 'country' ? selected.iso3 : null, '#e0b15a', 1.8]]) {
      const f = iso && FEAT_BY_ISO3.get(iso);
      if (f) { c.beginPath(); path(f); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
    }
    // sisi malam dari posisi matahari sungguhan
    if (vis.night) {
      const sp = sunPos(new Date());
      const night = d3.geoCircle().center([sp.lon + 180, -sp.lat]).radius(90)();
      c.beginPath(); path(night); c.fillStyle = 'rgba(2,6,14,0.38)'; c.fill();
    }
    // cahaya dari kiri atas (kesan bola)
    const hl = c.createRadialGradient(cx - s * 0.45, cy - s * 0.5, 0, cx - s * 0.2, cy - s * 0.2, s * 1.1);
    hl.addColorStop(0, 'rgba(255,255,255,0.07)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.beginPath(); path(sphere); c.fillStyle = hl; c.fill();
    c.beginPath(); path(sphere); c.strokeStyle = 'rgba(42,84,120,0.9)'; c.lineWidth = 1; c.stroke();

    pickables = [];
    const P = (lon, lat) => (visible(lon, lat) ? proj([lon, lat]) : null);

    // kotak pantau AIS
    if (vis.boxes && L.boxes.length) {
      c.setLineDash([3, 3]); c.strokeStyle = 'rgba(224,177,90,0.45)'; c.lineWidth = 1;
      for (const b of L.boxes) {
        const [[la1, lo1], [la2, lo2]] = b.box;
        const ring = { type: 'Polygon', coordinates: [[[lo1, la1], [lo1, la2], [lo2, la2], [lo2, la1], [lo1, la1]]] };
        c.beginPath(); path(ring); c.stroke();
      }
      c.setLineDash([]);
    }

    // berita (titik lokasi yang disebut berita, GDELT GEO)
    if (vis.news && L.news.length) {
      const max = Math.max(...L.news.map(n => n.count), 1);
      for (const n of L.news) {
        const p = P(n.lon, n.lat); if (!p) continue;
        const r = 2 + 9 * Math.sqrt(n.count / max);
        c.beginPath(); c.arc(p[0], p[1], r, 0, 6.2832);
        c.fillStyle = 'rgba(224,177,90,0.20)'; c.fill(); c.strokeStyle = 'rgba(224,177,90,0.75)'; c.lineWidth = 0.8; c.stroke();
        pickables.push({ type: 'news', item: n, x: p[0], y: p[1], r: Math.max(r, 5) });
      }
    }
    // bencana
    if (vis.hazards && L.hazards.length) {
      const ph = (now / 1600) % 1;
      for (const h of L.hazards) {
        const p = P(h.lon, h.lat); if (!p) continue;
        const red = h.alert === 'Red', orange = h.alert === 'Orange';
        const col = red ? '#ff6f61' : orange ? '#ff9f6b' : h.kind === 'EQ' ? '#f3d79a' : '#93a8bf';
        const r = h.kind === 'EQ' && h.mag ? 1.5 + (h.mag - 4) * 1.6 : 4;
        if ((red || orange || (h.mag && h.mag >= 6)) && !REDUCED) {
          c.beginPath(); c.arc(p[0], p[1], r + ph * 10, 0, 6.2832); c.strokeStyle = col; c.globalAlpha = 1 - ph; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
        }
        c.beginPath();
        if (h.kind === 'EQ') c.arc(p[0], p[1], Math.max(r, 2), 0, 6.2832);
        else { c.moveTo(p[0], p[1] - r - 1); c.lineTo(p[0] + r + 1, p[1] + r); c.lineTo(p[0] - r - 1, p[1] + r); c.closePath(); }
        c.fillStyle = col; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
        c.strokeStyle = '#060e1a'; c.lineWidth = 0.8; c.stroke();
        pickables.push({ type: 'hazard', item: h, x: p[0], y: p[1], r: Math.max(r, 5) });
      }
    }
    // chokepoint
    if (vis.chokepoints && L.chokepoints.length) {
      c.font = '600 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
      c.textBaseline = 'middle';
      for (const k of L.chokepoints) {
        if (k.lat === null || k.lon === null || k.lat === undefined) continue;
        const p = P(k.lon, k.lat); if (!p) continue;
        const sel = selected && selected.type === 'chokepoint' && selected.item.name === k.name;
        c.save(); c.translate(p[0], p[1]); c.rotate(Math.PI / 4);
        c.fillStyle = k.chg !== null && k.chg !== undefined ? (k.chg < -0.15 ? '#ff6f61' : k.chg > 0.1 ? '#34d1a4' : '#e0b15a') : '#e0b15a';
        c.fillRect(-4, -4, 8, 8); c.strokeStyle = sel ? '#fff' : '#060e1a'; c.lineWidth = sel ? 1.6 : 1; c.strokeRect(-4, -4, 8, 8);
        c.restore();
        if (proj.scale() > 260 || sel) {
          const txt = k.short || k.name;
          c.fillStyle = 'rgba(6,14,26,0.8)'; const w = c.measureText(txt).width + 8; c.fillRect(p[0] + 7, p[1] - 8, w, 16);
          c.fillStyle = '#e8eef6'; c.fillText(txt, p[0] + 11, p[1]);
        }
        pickables.push({ type: 'chokepoint', item: k, x: p[0], y: p[1], r: 8 });
      }
    }
    // kapal (posisi asli; animasi hanya di antara dua posisi yang benar-benar dilaporkan)
    if (vis.ships && L.ships.length) {
      const scale = proj.scale();
      const big = scale > 420;
      for (const v of L.ships) {
        let lon = v.lon, lat = v.lat;
        const an = shipAnim.get(v.mmsi);
        if (an) {
          const k = clamp((now - an.t0) / 1500, 0, 1);
          if (k >= 1) shipAnim.delete(v.mmsi);
          else { const ip = d3.geoInterpolate(an.from, an.to)(k); lon = ip[0]; lat = ip[1]; }
        }
        const p = P(lon, lat); if (!p) continue;
        const col = SHIP_COLORS[v.cls] || SHIP_COLORS.other;
        if (big && v.trail && v.trail.length > 1) {
          c.beginPath();
          let first = true;
          for (const [tl, ta] of v.trail) { const q = P(tl, ta); if (!q) { first = true; continue; } if (first) { c.moveTo(q[0], q[1]); first = false; } else c.lineTo(q[0], q[1]); }
          c.lineTo(p[0], p[1]);
          c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
        }
        const dir = v.heading ?? v.cog;
        const moving = v.sog !== null && v.sog > 0.5 && dir !== null && dir !== undefined;
        const sz = big ? 4.2 : 2.6;
        c.fillStyle = col;
        if (moving) {
          /* arah: kompas (0 = utara) diubah ke arah layar memakai dua titik proyeksi */
          const ahead = proj([lon + Math.sin(dir * RAD) * 0.05 / Math.max(Math.cos(lat * RAD), 0.2), lat + Math.cos(dir * RAD) * 0.05]);
          const ang = ahead ? Math.atan2(ahead[1] - p[1], ahead[0] - p[0]) : 0;
          c.save(); c.translate(p[0], p[1]); c.rotate(ang);
          c.beginPath(); c.moveTo(sz * 1.6, 0); c.lineTo(-sz, sz * 0.9); c.lineTo(-sz * 0.5, 0); c.lineTo(-sz, -sz * 0.9); c.closePath(); c.fill();
          c.restore();
        } else { c.beginPath(); c.arc(p[0], p[1], sz * 0.6, 0, 6.2832); c.globalAlpha = 0.75; c.fill(); c.globalAlpha = 1; }
        if (selected && selected.type === 'ship' && selected.item.mmsi === v.mmsi) {
          c.beginPath(); c.arc(p[0], p[1], 9, 0, 6.2832); c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.stroke();
        }
        pickables.push({ type: 'ship', item: v, x: p[0], y: p[1], r: big ? 7 : 5 });
      }
    }
    // pasar (bursa): mercusuar seperti peta 2D
    if (vis.markets && L.markets.length) {
      c.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif'; c.textBaseline = 'middle';
      const ph = (now / 2200) % 1;
      for (const m of L.markets) {
        const p = P(m.lon, m.lat); if (!p) continue;
        if (m.open && !REDUCED) { c.beginPath(); c.arc(p[0], p[1], 3 + ph * 11, 0, 6.2832); c.strokeStyle = `rgba(224,177,90,${(0.6 * (1 - ph)).toFixed(3)})`; c.lineWidth = 1.1; c.stroke(); }
        c.beginPath(); c.arc(p[0], p[1], 3.4, 0, 6.2832); c.fillStyle = m.open ? '#e0b15a' : '#6b829c'; c.fill(); c.strokeStyle = '#060e1a'; c.lineWidth = 1.1; c.stroke();
        if (proj.scale() > 200) {
          const chg = Number.isFinite(m.chg) ? fmtPct(m.chg, 2) : 'n/a';
          const w1 = c.measureText(m.label).width;
          c.font = '500 10.5px "IBM Plex Mono", monospace';
          const w2 = c.measureText(chg).width;
          const bw = w1 + w2 + 16;
          c.fillStyle = 'rgba(6,14,26,0.82)'; c.fillRect(p[0] + 7, p[1] - 9, bw, 18);
          c.fillStyle = Number.isFinite(m.chg) ? (m.chg >= 0 ? '#34d1a4' : '#ff6f61') : '#93a8bf';
          c.fillText(chg, p[0] + 13 + w1, p[1] + 0.5);
          c.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif'; c.fillStyle = m.open ? '#e8eef6' : '#93a8bf';
          c.fillText(m.label, p[0] + 11, p[1] + 0.5);
        }
        pickables.push({ type: 'market', item: m, x: p[0], y: p[1], r: 8 });
      }
    }
    const ms = performance.now() - t0;
    api.lastDrawMs = ms;
  }

  /* ---------------- interaksi ---------------- */
  function pick(x, y) {
    let best = null, bd = Infinity;
    for (const p of pickables) { const d = Math.hypot(p.x - x, p.y - y); if (d <= p.r + 3 && d < bd) { bd = d; best = p; } }
    if (best) return best;
    const ll = proj.invert([x, y]);
    if (!ll || Math.hypot(x - W / 2, y - H / 2) > proj.scale()) return null;
    for (const f of WORLD_FEATURES) if (f.iso3 && d3.geoContains(f, ll)) return { type: 'country', iso3: f.iso3, item: C3.get(f.iso3), lonlat: ll };
    return null;
  }
  const pointers = new Map();
  let drag = null, pinch = null, moved = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    moved = 0; auto = false; lastUser = Date.now(); flight = null;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, rot: rot.slice() };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: zoom }; drag = null; }
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoom = clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 0.8, 300); dirty = true; return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.25 / zoom;
      rot = [drag.rot[0] + dx * k, clamp(drag.rot[1] - dy * k, -85, 85), 0];
      dirty = true; tip.hidden = true; return;
    }
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    const key = h ? h.type + (h.iso3 || h.item?.mmsi || h.item?.id || h.item?.name || '') : '';
    const prev = hover ? hover.type + (hover.iso3 || hover.item?.mmsi || hover.item?.id || hover.item?.name || '') : '';
    hover = h;
    canvas.style.cursor = h ? 'pointer' : 'grab';
    if (key !== prev) dirty = true;
    renderTip(e.clientX - r.left, e.clientY - r.top);
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && moved < 6 && e.type === 'pointerup') {
      const r = canvas.getBoundingClientRect();
      const h = pick(e.clientX - r.left, e.clientY - r.top);
      if (h) { selected = h; dirty = true; opts.onPick && opts.onPick(h); }
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; dirty = true; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoom = clamp(zoom * Math.exp(-e.deltaY * 0.0015), 0.8, 300); dirty = true; auto = false; lastUser = Date.now();
  }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const step = 8 / zoom;
    const k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k) { e.preventDefault(); rot = [rot[0] + k[0], clamp(rot[1] + k[1], -85, 85), 0]; dirty = true; auto = false; lastUser = Date.now(); }
    if (e.key === '+' || e.key === '=') { zoom = clamp(zoom * 1.25, 0.8, 300); dirty = true; }
    if (e.key === '-') { zoom = clamp(zoom / 1.25, 0.8, 300); dirty = true; }
  });

  function renderTip(px, py) {
    if (!hover || (opts.noTip)) { tip.hidden = true; return; }
    const h = hover, it = h.item || {};
    let html = '';
    if (h.type === 'country') {
      const v = L.choropleth && L.choropleth.values.get(h.iso3);
      html = `<div class="t-city">${esc(it.name || h.iso3)}</div><div class="t-ex">${esc(it.en || '')} · ${esc(h.iso3)}</div>` +
        (L.choropleth && vis.choropleth ? `<div class="t-row"><span>${esc(L.choropleth.label)}</span><span class="t-px">${v === undefined || v === null ? 'n/a' : esc(L.choropleth.fmt(v))}</span></div>` : '') +
        `<div class="t-st">Klik untuk intelijen negara</div>`;
    } else if (h.type === 'ship') {
      html = `<div class="t-city">${esc(it.name || 'MMSI ' + it.mmsi)}</div><div class="t-ex">${esc(SHIP_LABELS[it.cls] || it.cls)} · MMSI ${it.mmsi}</div>` +
        `<div class="t-row"><span>${it.sog !== null && it.sog !== undefined ? fmt(it.sog, 1) + ' knot' : 'kecepatan n/a'}</span><span>${it.cog !== null && it.cog !== undefined ? fmt(it.cog, 0) + '°' : ''}</span></div>` +
        `<div class="t-st">${it.dest ? 'Tujuan ' + esc(it.dest) + ' · ' : ''}${esc(fmtAge(it.ts))}</div>`;
    } else if (h.type === 'hazard') {
      html = `<div class="t-city">${esc(HAZ_LABEL[it.kind] || it.kind)}${it.mag ? ' M' + fmt(it.mag, 1) : ''}</div><div class="t-ex">${esc(it.title)}</div>` +
        `<div class="t-st">${esc(it.source)} · ${esc(fmtAge(it.time))}${it.alert ? ' · peringatan ' + esc(it.alert) : ''}</div>`;
    } else if (h.type === 'news') {
      html = `<div class="t-city">${esc(it.name)}</div><div class="t-ex">${it.count} artikel menyebut lokasi ini</div>` +
        (it.articles[0] ? `<div class="t-st">${esc(it.articles[0].title.slice(0, 90))}</div>` : '');
    } else if (h.type === 'chokepoint') {
      html = `<div class="t-city">${esc(it.name)}</div><div class="t-ex">Transit harian (IMF PortWatch)</div>` +
        `<div class="t-row"><span>Rata-rata 7 hari</span><span class="t-px">${it.avg7 !== null && it.avg7 !== undefined ? fmt(it.avg7, 0) : 'n/a'}</span></div>` +
        (it.chg !== null && it.chg !== undefined ? `<div class="t-st">vs rata-rata setahun: <b class="${sign(it.chg)}">${fmtPct(it.chg, 1)}</b></div>` : '');
    } else if (h.type === 'market') {
      html = `<div class="t-city">${esc(it.city)}</div><div class="t-ex">${esc(it.ex)}, ${esc(it.label)}</div>` +
        `<div class="t-row"><span class="t-px">${Number.isFinite(it.price) ? fmt(it.price, 2) : 'n/a'}</span><span class="pill ${sign(it.chg)}">${Number.isFinite(it.chg) ? fmtPct(it.chg) : 'n/a'}</span></div>` +
        `<div class="t-st ${it.open ? 'open' : ''}"><i></i>${it.open ? 'Buka' : 'Tutup'} · ${esc(QUALITY[it.quality] ? QUALITY[it.quality][0] : '')}</div>`;
    }
    tip.innerHTML = html; tip.hidden = !html;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(px + 14, 4, W - tw - 4) + 'px';
    tip.style.top = clamp(py - th - 10, 4, H - th - 4) + 'px';
  }

  /* ---------------- loop gambar ---------------- */
  let lastFrame = 0, running = true;
  function needsAnim() {
    return auto || flight || (vis.ships && shipAnim.size > 0) ||
      (!REDUCED && ((vis.markets && L.markets.some(m => m.open)) || (vis.hazards && L.hazards.some(h => h.alert === 'Red' || h.alert === 'Orange' || h.mag >= 6))));
  }
  function loop(ts) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (document.hidden || (!host.offsetWidth && !host.offsetHeight)) return;   // tidak terlihat: hemat CPU
    const animating = needsAnim();
    const gap = animating ? 33 : 0;
    if (!dirty && !animating) return;
    if (ts - lastFrame < gap) return;
    const dt = Math.min(ts - lastFrame, 100);
    lastFrame = ts;
    if (auto && !REDUCED) rot = [rot[0] + dt * 0.004, rot[1], 0];
    if (!auto && opts.autoRotate !== false && !REDUCED && !noAutoResume && Date.now() - lastUser > 45000 && !selected) auto = true;
    /* tombol "Putar" mengikuti status sebenarnya (seret, roda, tombol zoom, dan terbang mematikan putaran) */
    if (auto !== lastAuto) { lastAuto = auto; if (opts.onAuto) opts.onAuto(auto); }
    if (flight) {
      const k = clamp((ts - flight.t0) / flight.ms, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = flight.ip(e);
      rot = [-p[0], -p[1], 0];
      zoom = flight.z0 + (flight.z1 - flight.z0) * e;
      if (k >= 1) flight = null;
    }
    dirty = false;
    draw(ts);
  }
  new ResizeObserver(() => { resize(); }).observe(host);
  resize();
  requestAnimationFrame(loop);

  const api = {
    lastDrawMs: 0,
    set(name, data) {
      if (name === 'ships') {
        const old = new Map(L.ships.map(v => [v.mmsi, v]));
        const now = performance.now();
        /* animasi yang sudah lewat atau milik kapal yang hilang dari data harus dibuang, kalau tidak
           needsAnim() terus true dan globe menggambar ulang 30 fps selamanya */
        const ids = new Set(data.map(v => v.mmsi));
        for (const [id, an] of shipAnim) if (now - an.t0 > 1500 || !ids.has(id)) shipAnim.delete(id);
        for (const v of data) {
          const o = old.get(v.mmsi);
          if (o && (o.lat !== v.lat || o.lon !== v.lon) && !REDUCED && data.length < 6000) shipAnim.set(v.mmsi, { from: [o.lon, o.lat], to: [v.lon, v.lat], t0: now });
        }
      }
      L[name] = data; dirty = true;
    },
    get(name) { return L[name]; },
    show(name, on) { vis[name] = on; if (name === 'ships' && !on) shipAnim.clear(); dirty = true; },
    isShown(name) { return !!vis[name]; },
    select(sel) { selected = sel; dirty = true; },
    flyTo(lon, lat, z = Math.max(zoom, 1.8), ms = 1200) {
      auto = false; lastUser = Date.now();
      if (REDUCED) { rot = [-lon, -lat, 0]; zoom = z; dirty = true; return; }
      flight = { ip: d3.geoInterpolate(center(), [lon, lat]), z0: zoom, z1: z, t0: performance.now(), ms };
    },
    zoomBy(f) { zoom = clamp(zoom * f, 0.8, 300); dirty = true; auto = false; lastUser = Date.now(); },
    reset() { flight = null; rot = opts.rotate ? opts.rotate.slice() : [-105, -5, 0]; zoom = opts.zoom || 1; selected = null; dirty = true; },
    setAuto(on) { auto = on && !REDUCED; noAutoResume = !on; lastUser = Date.now(); dirty = true; },
    get auto() { return auto; },
    redraw() { dirty = true; },
    resize,
    get state() { return { rot: rot.slice(), zoom, auto, selected }; },
    destroy() { running = false; canvas.remove(); tip.remove(); },
  };
  return api;
}
