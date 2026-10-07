/* =====================================================================
   INTELIJEN PELAYARAN: kapal live (AIS) + transit chokepoint (IMF PortWatch)
   Aturan: TIDAK ADA posisi kapal yang dikarang. Kalau AIS tidak tersedia,
   UI menulis "Data AIS live tidak tersedia", bukan gerakan palsu.
   ===================================================================== */
/* koordinat referensi selat/kanal (fakta geografis) bila PortWatch tidak mengirim geometri */
const CHOKE_REF = [
  ['hormuz', 'Strait of Hormuz', 'Hormuz', 26.57, 56.25, 'Jalur keluar minyak Teluk Persia. EIA memperkirakan sekitar seperlima konsumsi minyak cair dunia melintas di sini (data 2023).'],
  ['bab', 'Bab el-Mandeb', 'Bab el-Mandeb', 12.6, 43.35, 'Gerbang Laut Merah menuju Terusan Suez. Serangan terhadap kapal sejak akhir 2023 membuat banyak kapal memutar lewat Tanjung Harapan.'],
  ['suez', 'Suez Canal', 'Suez', 30.6, 32.33, 'Rute tersingkat Asia–Eropa. Gangguan di Laut Merah langsung terlihat sebagai turunnya transit di sini.'],
  ['malacca', 'Malacca Strait', 'Malaka', 2.5, 101.4, 'Jalur tersibuk Samudra Hindia–Pasifik, nadi impor energi Tiongkok, Jepang, dan Korea; berbatasan dengan Indonesia.'],
  ['panama', 'Panama Canal', 'Panama', 9.12, -79.75, 'Penghubung Atlantik–Pasifik. Kekeringan pernah memaksa pembatasan transit (2023).'],
  ['bosporus', 'Bosporus Strait', 'Bosporus', 41.12, 29.06, 'Satu-satunya jalur laut Laut Hitam: gandum dan minyak dari Rusia, Ukraina, Kazakhstan.'],
  ['good', 'Cape of Good Hope', 'Tg. Harapan', -34.36, 18.47, 'Rute alternatif saat Laut Merah terganggu; jarak dan biaya lebih besar.'],
  ['gibraltar', 'Gibraltar Strait', 'Gibraltar', 35.95, -5.6, 'Pintu Mediterania–Atlantik.'],
  ['dover', 'Dover Strait', 'Dover', 51.0, 1.45, 'Salah satu selat tersibuk di dunia, jalur pelabuhan Eropa utara.'],
  ['taiwan', 'Taiwan Strait', 'Taiwan', 24.3, 119.6, 'Jalur utama kapal kontainer Asia Timur; sensitif secara geopolitik.'],
  ['lombok', 'Lombok Strait', 'Lombok', -8.47, 115.72, 'Alternatif laut dalam untuk kapal besar yang tidak bisa lewat Malaka (Indonesia).'],
  ['sunda', 'Sunda Strait', 'Sunda', -5.95, 105.85, 'Selat antara Jawa dan Sumatra (Indonesia).'],
  ['makassar', 'Makassar Strait', 'Makassar', -2.5, 118.2, 'Jalur utara–selatan di Indonesia, sering dipakai bersama Selat Lombok.'],
  ['korea', 'Korea Strait', 'Korea', 34.4, 129.4, 'Penghubung Laut Jepang dan Laut Cina Timur.'],
  ['oresund', 'Oresund Strait', 'Oresund', 55.9, 12.7, 'Pintu Laut Baltik.'],
];
const NAV_STATUS = { 0: 'Berlayar dengan mesin', 1: 'Berlabuh jangkar', 2: 'Tidak dapat dikendalikan', 3: 'Olah gerak terbatas', 4: 'Terbatas sarat', 5: 'Bersandar', 6: 'Kandas', 7: 'Menangkap ikan', 8: 'Berlayar dengan layar', 15: 'Tidak ditentukan' };
function chokeRef(name) {
  const n = String(name || '').toLowerCase();
  return CHOKE_REF.find(r => n.includes(r[0]) || n.includes(r[1].toLowerCase().split(' ')[0])) || null;
}

const ShipData = (() => {
  const st = { ships: null, choke: null, mode: null };
  const local = new Map();                // untuk mode Digitraffic langsung: bangun jejak dari polling berturut-turut
  let dtMetaAt = 0, dtMetaTry = 0, dtMetaBusy = false;

  async function chokepoints() {
    const base = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
    const r = await getData('portwatch', {
      server: '/api/portwatch/chokepoints?days=400',
      fetcher: async () => {                      // jalur langsung: ArcGIS publik mendukung CORS
        const rows = [];
        const cutoff = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10);
        for (let page = 0; page < 8; page++) {
          const params = new URLSearchParams({ where: '1=1', outFields: '*', orderByFields: 'date DESC', resultOffset: String(page * 2000), resultRecordCount: '2000', returnGeometry: page === 0 ? 'true' : 'false', outSR: '4326', f: 'json' });
          const part = Parsers.parsePortWatch(await Net.fetch(`${base}?${params}`, { timeout: 30000 }));
          rows.push(...part);
          if (part.length < 2000 || part.some(x => x.date < cutoff)) break;
        }
        const keep = rows.filter(x => x.date >= cutoff);
        return { rows: [], summary: Parsers.summarizeChokepoints(keep) };
      },
      ttl: 6 * 3600e3, persist: true, key: 'pw', timeout: 60000,
    });
    if (r.ok) {
      for (const k of r.data.summary) {
        const ref = chokeRef(k.name);
        if ((k.lat === null || k.lat === undefined) && ref) { k.lat = ref[3]; k.lon = ref[4]; }
        k.short = ref ? ref[2] : k.name.replace(/ Strait| Canal/, '');
        k.context = ref ? ref[5] : '';
      }
    }
    st.choke = r;
    return r;
  }

  function fromCompact(snap) {
    const F = snap.fields;
    return snap.vessels.map(a => { const o = {}; F.forEach((f, i) => { o[f] = a[i]; }); return o; });
  }
  async function ships() {
    await Net.ready();
    if (Net.server) {
      const r = await getData('ais', { server: '/api/ships', ttl: 8000, key: 'ships' });
      st.mode = 'server';
      if (r.ok) { r.vessels = fromCompact(r.data); r.sources = r.data.sources; r.boxes = r.data.boxes; }
      st.ships = r;
      return r;
    }
    /* tanpa server: hanya Digitraffic (tanpa kunci, Laut Baltik) langsung dari browser */
    st.mode = 'direct';
    const headers = { 'Digitraffic-User': 'QuantTerminal/2.0' };
    const r = await getData('digitraffic', { direct: `https://meri.digitraffic.fi/api/ais/v1/locations?from=${Date.now() - 20 * 60e3}`, headers, parse: Parsers.parseDigitrafficLocations, ttl: 30e3, key: 'dtloc' });
    if (r.ok) {
      for (const m of r.data) {
        let v = local.get(m.mmsi);
        if (!v) { v = { mmsi: m.mmsi, name: '', cls: 'unknown', dest: '', trail: [], src: 'digitraffic' }; local.set(m.mmsi, v); }
        if (v.ts && m.ts && m.ts <= v.ts) continue;
        const last = v.trail[v.trail.length - 1];
        if (!last || Math.abs(last[0] - m.lon) + Math.abs(last[1] - m.lat) > 0.0015) { v.trail.push([m.lon, m.lat, m.ts]); if (v.trail.length > 20) v.trail.shift(); }
        Object.assign(v, m);
      }
      /* metadata (nama, tipe, tujuan) diambil di LATAR BELAKANG: posisi tampil dulu, dan bila gagal
         dicoba lagi paling cepat 10 menit kemudian (bukan tiap 10 detik) */
      if (Date.now() - dtMetaAt > 15 * 60e3 && Date.now() - dtMetaTry > 10 * 60e3 && !dtMetaBusy) {
        dtMetaTry = Date.now(); dtMetaBusy = true;
        getData('digitraffic', { direct: `https://meri.digitraffic.fi/api/ais/v1/vessels?from=${Date.now() - 24 * 3600e3}`, headers, parse: Parsers.parseDigitrafficVessels, ttl: 15 * 60e3, key: 'dtmeta', timeout: 40000, retries: 0 })
          .then(meta => {
            if (!meta.ok) return;
            dtMetaAt = Date.now();
            for (const x of meta.data) { const v = local.get(x.mmsi); if (v) { v.name = x.name; v.shipType = x.shipType; v.dest = x.dest; v.imo = x.imo; v.cls = Parsers.shipClass(x.shipType, x.name); } }
          })
          .finally(() => { dtMetaBusy = false; });
      }
      const cut = Date.now() - 6 * 3600e3;
      for (const [k, v] of local) if (v.ts && v.ts < cut) local.delete(k);
      r.vessels = [...local.values()];
      r.sources = [{ id: 'aisstream', state: 'butuh server + kunci', configured: false, coverage: 'Global (kotak pantau selat)' }, { id: 'digitraffic', state: 'langsung dari browser', configured: true, coverage: 'Laut Baltik' }];
    }
    st.ships = r;
    return r;
  }
  return { st, chokepoints, ships };
})();

/* ---------- panel detail (dipakai halaman Kapal dan Intel) ---------- */
/* kualitas posisi satu kapal: live hanya bila umpan sedang segar DAN posisinya <= 10 menit */
const SHIP_LIVE_MS = 10 * 60e3;
function shipQuality(v) {
  const snap = ShipData.st.ships;
  return snap && snap.ok && !snap.stale && v.ts && Date.now() - v.ts <= SHIP_LIVE_MS ? 'live' : 'stale';
}
/* q = kualitas data panel; bawaan dihitung dari umur posisi kapal itu sendiri */
function shipPanel(v, q) {
  q = q || shipQuality(v);
  const navs = NAV_STATUS[v.navStatus] || (v.navStatus !== null && v.navStatus !== undefined ? 'Kode ' + v.navStatus : 'tidak dilaporkan');
  const L = (label, value, unit, extra = {}) => value === null || value === undefined || value === '' ? `<div><dt>${label}</dt><dd class="na">tidak dilaporkan</dd></div>` :
    `<div><dt>${label}</dt><dd>${Lineage.wrap({ label: label + ' ' + (v.name || v.mmsi), value, unit, quality: q, source: v.src === 'digitraffic' ? 'Digitraffic AIS (Fintraffic)' : 'AISStream.io', home: v.src === 'digitraffic' ? SOURCE_DEFS.digitraffic.home : 'https://aisstream.io', asOf: v.ts ? fmtTime(new Date(v.ts).toISOString()) : '–', note: 'Dilaporkan sendiri oleh transponder AIS kapal; bisa salah atau dimatikan.', ...extra }, esc(String(value)) + (unit ? ' <small>' + esc(unit) + '</small>' : ''))}</dd></div>`;
  const staleNote = q === 'stale' ? `<p class="hint">Posisi terakhir diterima ${esc(fmtAge(v.ts))}; bukan posisi saat ini (kapal tidak melapor lagi, di luar jangkauan penerima, atau umpan AIS terputus).</p>` : '';
  return `<div>${staleNote}<div class="bigscore"><strong style="font-size:20px;font-family:var(--font-ui)">${esc(v.name || 'Tanpa nama')}</strong></div>
      <div class="item-meta"><span style="color:${SHIP_COLORS[v.cls] || '#93a8bf'}">● ${esc(SHIP_LABELS[v.cls] || v.cls)}</span><span>MMSI ${v.mmsi}</span>${v.imo ? `<span>IMO ${v.imo}</span>` : ''}${qBadge(q)}<span>${esc(fmtAge(v.ts))}</span></div></div>
    <dl class="kv">${L('Kecepatan', v.sog !== null && v.sog !== undefined ? fmt(v.sog, 1) : null, 'knot')}${L('Arah (COG)', v.cog !== null && v.cog !== undefined ? fmt(v.cog, 0) : null, '°')}${L('Haluan', v.heading !== null && v.heading !== undefined ? fmt(v.heading, 0) : null, '°')}
      ${L('Status navigasi', navs, '')}${L('Tujuan', v.dest || null, '')}${L('Posisi', fmt(v.lat, 4) + ', ' + fmt(v.lon, 4), '')}
      ${L('Kode tipe AIS', v.shipType ?? null, '', { note: '70-79 kargo, 80-89 tanker. AIS tidak membedakan kontainer/curah atau LNG/minyak.' })}${L('Titik jejak', v.trail ? v.trail.length : 0, 'posisi asli')}</dl>
    <p class="hint">Verifikasi silang: <a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${v.mmsi}" target="_blank" rel="noopener noreferrer">MarineTraffic</a> · <a href="https://www.vesselfinder.com/vessels?name=${v.mmsi}" target="_blank" rel="noopener noreferrer">VesselFinder</a></p>
    <p class="disclaimer">Posisi AIS dikirim kapal sendiri. Kapal bisa mematikan transponder ("dark") atau memalsukan posisi, dan cakupan penerima darat tidak merata. Garis jejak hanya menghubungkan posisi yang benar-benar dilaporkan.</p>`;
}
function chokePanel(k, res) {
  const s = k.series || [];
  const cq = res && res.stale ? 'stale' : 'delayed';          // salinan lama PortWatch = Basi, bukan Tertunda
  const Wd = 340, Ht = 110, ys = s.map(p => p.total).filter(Number.isFinite);
  let chart = '';
  if (ys.length > 5) {
    const lo = 0, hi = Math.max(...ys) * 1.1;
    const X = i => 2 + (Wd - 4) * i / (s.length - 1), Y = v => 4 + (Ht - 8) * (1 - (v - lo) / (hi - lo));
    const path = key => s.map((p, i) => Number.isFinite(p[key]) ? (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[key]).toFixed(1) : '').join(' ');
    chart = `<div class="svgchart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Transit harian ${esc(k.name)}"><path d="${path('total')}" fill="none" stroke="#6fb1ff" stroke-width="1.2"/><path d="${path('tanker')}" fill="none" stroke="#ff9f6b" stroke-width="1.2"/></svg>
      <div class="lg"><span><i style="background:#6fb1ff"></i>Semua kapal</span><span><i style="background:#ff9f6b"></i>Tanker</span><span>${esc(s[0].date)} – ${esc(s[s.length - 1].date)}</span></div></div>`;
  }
  const cell = (label, v, d = 0, note) => `<div><dt>${label}</dt><dd>${v === null || v === undefined || !Number.isFinite(v) ? '<span class="na">–</span>' : Lineage.wrap({ label: label + ' ' + k.name, value: fmt(v, d), quality: cq, source: 'IMF PortWatch (Daily Chokepoints Data)', home: 'https://portwatch.imf.org', url: res && res.sourceUrl, asOf: 'hingga ' + k.lastDate, fetchedAt: res && res.fetchedAt, via: res && res.via, formula: note }, fmt(v, d))}</dd></div>`;
  return `<div><div class="bigscore"><strong style="font-size:20px;font-family:var(--font-ui)">${esc(k.name)}</strong></div>
      <div class="item-meta">${k.lastDate ? `${qBadge(cq, 'Data AIS diolah IMF, jeda sekitar 4 hari')}<span>data terakhir ${esc(k.lastDate)}</span>` : `${qBadge('unavailable')}<span>Transit IMF PortWatch tidak tersedia; hanya lokasi selat yang ditampilkan.</span>`}</div></div>
    <dl class="kv">${cell('Transit hari terakhir', k.last)}${cell('Rata-rata 7 hari', k.avg7, 1, 'rata-rata n_total 7 hari terakhir')}
      <div><dt>vs rata-rata setahun</dt><dd class="${sign(k.chg)}">${Number.isFinite(k.chg) ? Lineage.wrap({ label: 'Perubahan transit ' + k.name, value: fmtPct(k.chg, 1), quality: 'calculated', source: 'IMF PortWatch', formula: 'rata-rata 7 hari ÷ rata-rata hari ke-8 s.d. 372 sebelumnya − 1', asOf: k.lastDate }, fmtPct(k.chg, 1)) : '–'}</dd></div>
      ${cell('Tanker (7 hari)', k.tanker7, 1)}${cell('Kontainer (7 hari)', k.container7, 1)}${cell('Curah kering (7 hari)', k.dryBulk7, 1)}</dl>
    ${chart}
    ${k.context ? `<p class="lead">${qBadge('historical', 'Konteks referensi statis')} ${esc(k.context)}</p>` : ''}
    <p class="hint">Transit = jumlah kapal yang tercatat melintas per hari menurut IMF PortWatch (diolah dari AIS satelit). Penurunan tajam bisa berarti gangguan keamanan, cuaca, atau kapal memutar rute.</p>`;
}

/* =====================================================================
   HALAMAN KAPAL
   ===================================================================== */
const ShipsPage = (() => {
  const S = { cls: 'all', q: '', sel: null, timer: null, globe: null, vessels: [] };
  let built = false;
  const JUMPS = [['Hormuz', 56.3, 26.4, 22], ['Bab el-Mandeb', 43.3, 12.8, 30], ['Suez', 32.45, 30.4, 28], ['Malaka', 101.5, 2.8, 10], ['Singapura', 103.9, 1.25, 60], ['Sunda', 105.8, -6.0, 40], ['Lombok', 115.7, -8.5, 45], ['Panama', -79.7, 9.15, 45], ['Bosporus', 29.05, 41.1, 60], ['Dover', 1.4, 51.0, 35], ['Baltik', 22.0, 59.6, 9], ['Taiwan', 119.5, 24.2, 14], ['Tg. Harapan', 18.5, -34.4, 18]];
  const CLASSES = [['all', 'Semua'], ['tanker', 'Tanker'], ['gas', 'Gas (nama)'], ['cargo', 'Kargo'], ['passenger', 'Penumpang'], ['other', 'Lainnya']];

  function legend() {
    $('#shipLegend').innerHTML = ['tanker', 'gas', 'cargo', 'passenger', 'fishing', 'other'].map(c => `<span><i class="sw" style="background:${SHIP_COLORS[c]}"></i>${SHIP_LABELS[c]}</span>`).join('') +
      `<span><i class="sw" style="background:#e0b15a;transform:rotate(45deg)"></i>Chokepoint</span><span class="meta">Segitiga = kapal bergerak (arah haluan). Titik = diam. Garis = jejak posisi asli.</span>`;
  }
  async function loadChoke() {
    $('#chokeWrap').innerHTML = '<p class="loading">Memuat IMF PortWatch</p>';
    const r = await ShipData.chokepoints();
    if (!r.ok) { S.chokeShown = false; $('#chokeWrap').innerHTML = unavailableBox('Transit chokepoint (IMF PortWatch)', r); return; }
    S.chokeShown = true;
    const list = r.data.summary;
    S.globe.set('chokepoints', list);
    const spark = k => {
      const s = (k.series || []).slice(-90).map(p => p.total).filter(Number.isFinite);
      if (s.length < 3) return '';
      const lo = Math.min(...s), hi = Math.max(...s), sp = hi - lo || 1;
      return `<svg class="spark" viewBox="0 0 62 24" preserveAspectRatio="none" aria-hidden="true" style="color:${k.chg < -0.1 ? 'var(--down)' : 'var(--ink-2)'}"><path d="${s.map((v, i) => (i ? 'L' : 'M') + (i / (s.length - 1) * 62).toFixed(1) + ' ' + (22 - (v - lo) / sp * 20).toFixed(1)).join(' ')}"/></svg>`;
    };
    $('#chokeWrap').innerHTML = `<table class="dense"><thead><tr><th>Chokepoint</th><th class="num">Hari terakhir</th><th class="num">Rata 7h</th><th class="num">vs 1 thn</th><th class="num">Tanker 7h</th><th class="num">Kontainer 7h</th><th>90 hari</th><th>Data s.d.</th></tr></thead><tbody>` +
      list.map(k => `<tr data-choke="${esc(k.name)}" tabindex="0" aria-selected="${S.sel && S.sel.type === 'chokepoint' && S.sel.item.name === k.name}"><td>${esc(k.name)}</td><td class="num">${fmt(k.last, 0)}</td><td class="num">${fmt(k.avg7, 1)}</td>
        <td class="num ${sign(k.chg)}">${Number.isFinite(k.chg) ? fmtPct(k.chg, 1) : '–'}</td><td class="num">${fmt(k.tanker7, 1)}</td><td class="num">${fmt(k.container7, 1)}</td><td>${spark(k)}</td><td class="num">${esc(k.lastDate)}</td></tr>`).join('') +
      `</tbody></table>` + `<div class="src-foot">${srcLine(r, 'jeda ±4 hari; vs 1 thn = rata 7 hari ÷ rata setahun sebelumnya − 1')}</div>`;
  }
  async function loadShips() {
    const r = await ShipData.ships();
    const meta = $('#shipMeta');
    if (!r.ok) {
      if (S.sel && S.sel.type === 'ship') $('#shipSide').innerHTML = shipPanel(S.sel.item, 'stale');
      S.vessels = [];
      S.globe.set('ships', []);
      meta.innerHTML = qBadge('unavailable') + ' Data AIS live tidak tersedia';
      $('#vesselWrap').innerHTML = unavailableBox('Data AIS live tidak tersedia', r, Net.server
        ? 'Server tersambung tapi belum ada posisi. Isi AISSTREAM_API_KEY di .env (gratis di aisstream.io) untuk kapal global, atau pastikan DIGITRAFFIC_ENABLED=1 untuk Laut Baltik.'
        : 'Tanpa server, aplikasi hanya bisa mencoba Digitraffic (Laut Baltik) langsung dari browser, dan itu gagal. Jalankan server lokal (npm start) lalu isi AISSTREAM_API_KEY untuk kapal global. Kapal tidak akan pernah digambar dengan posisi karangan.');
      return;
    }
    S.vessels = r.vessels;
    S.globe.set('ships', r.vessels);
    if (r.boxes) S.globe.set('boxes', Object.values(r.boxes));
    const srcTxt = (r.sources || []).map(s => `${s.id}: ${s.state}${s.messages ? ' (' + s.messages + ' pesan)' : ''}`).join(' · ');
    meta.innerHTML = `${qBadge(r.stale ? 'stale' : 'live')} ${fmt(r.vessels.length, 0)} kapal · ${esc(srcTxt)}`;
    renderVessels();
    /* panel kapal terpilih ikut diperbarui; kalau kapalnya hilang dari data terbaru, labelnya jadi Basi */
    if (S.sel && S.sel.type === 'ship') {
      const fresh = r.vessels.find(x => x.mmsi === S.sel.item.mmsi);
      if (fresh) S.sel = { type: 'ship', item: fresh };
      $('#shipSide').innerHTML = shipPanel(S.sel.item, fresh && !r.stale ? undefined : 'stale');
    }
  }
  function renderVessels() {
    const q = S.q.trim().toLowerCase();
    let list = S.vessels;
    if (S.cls !== 'all') list = list.filter(v => (S.cls === 'other' ? !['tanker', 'gas', 'cargo', 'passenger'].includes(v.cls) : v.cls === S.cls));
    if (q) list = list.filter(v => (v.name + ' ' + v.mmsi + ' ' + v.dest).toLowerCase().includes(q));
    const total = list.length;
    list = [...list].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 400);
    $('#vesselWrap').innerHTML = !S.vessels.length ? '<p class="hint" style="padding:12px 14px">Belum ada posisi kapal diterima. AISStream baru mengirim data setelah ada kapal di kotak pantau; tunggu 1–2 menit.</p>' :
      `<table class="dense"><thead><tr><th>Kapal</th><th>Tipe</th><th class="num">Knot</th><th class="num">Arah</th><th>Tujuan</th><th class="num">Posisi</th><th>Update</th><th>Sumber</th></tr></thead><tbody>` +
      list.map(v => `<tr data-mmsi="${v.mmsi}" tabindex="0" aria-selected="${S.sel && S.sel.type === 'ship' && S.sel.item.mmsi === v.mmsi}"><td>${esc(v.name || '–')}<span class="sub">MMSI ${v.mmsi}</span></td><td><span style="color:${SHIP_COLORS[v.cls]}">●</span> ${esc(SHIP_LABELS[v.cls] || v.cls)}</td>
        <td class="num">${v.sog !== null && v.sog !== undefined ? fmt(v.sog, 1) : '–'}</td><td class="num">${v.cog !== null && v.cog !== undefined ? fmt(v.cog, 0) + '°' : '–'}</td><td>${esc((v.dest || '').slice(0, 20))}</td>
        <td class="num">${fmt(v.lat, 2)}, ${fmt(v.lon, 2)}</td><td>${esc(fmtAge(v.ts))}</td><td>${esc(v.src || '')}</td></tr>`).join('') +
      `</tbody></table><div class="src-foot">${total > 400 ? `Menampilkan 400 terbaru dari ${fmt(total, 0)} kapal yang cocok.` : `${fmt(total, 0)} kapal.`} Posisi asli dari transponder AIS.</div>`;
  }
  function pick(h) {
    S.sel = h;
    S.globe.select(h);
    if (h.type === 'ship') { $('#shipSideTitle').textContent = 'Kapal'; $('#shipSide').innerHTML = shipPanel(h.item); }
    else if (h.type === 'chokepoint') { $('#shipSideTitle').textContent = 'Chokepoint'; $('#shipSide').innerHTML = chokePanel(h.item, ShipData.st.choke); }
    else if (h.type === 'country') { bus.emit('openCountry', h.iso3); return; }
    $$('#vesselWrap tr[data-mmsi], #chokeWrap tr[data-choke]').forEach(tr => tr.setAttribute('aria-selected', String((h.type === 'ship' && +tr.dataset.mmsi === h.item.mmsi) || (h.type === 'chokepoint' && tr.dataset.choke === h.item.name))));
  }
  function build() {
    if (built) return;
    built = true;
    S.globe = createGlobe($('#shipGlobe'), { rotate: [-95, -5, 0], zoom: 1.6, autoRotate: false, visible: { choropleth: false, markets: false, news: false, hazards: false, boxes: true }, onPick: pick, label: 'Globe kapal: posisi AIS asli dan chokepoint' });
    legend();
    $('#shipJump').innerHTML = JUMPS.map(([n]) => `<button type="button" data-j="${n}">${n}</button>`).join('');
    $('#shipJump').addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (!b) return; const j = JUMPS.find(x => x[0] === b.dataset.j); S.globe.flyTo(j[1], j[2], j[3]); });
    $('#vesselCls').innerHTML = CLASSES.map(([k, l]) => `<button type="button" data-c="${k}" aria-pressed="${S.cls === k}">${l}</button>`).join('');
    $('#vesselCls').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; S.cls = b.dataset.c; $$('#vesselCls button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderVessels(); });
    $('#vesselQ').addEventListener('input', e => { S.q = e.target.value; renderVessels(); });
    $('#vesselWrap').addEventListener('click', e => { const tr = e.target.closest('tr[data-mmsi]'); if (!tr) return; const v = S.vessels.find(x => x.mmsi === +tr.dataset.mmsi); if (v) { pick({ type: 'ship', item: v }); S.globe.flyTo(v.lon, v.lat, 60); } });
    $('#chokeWrap').addEventListener('click', e => { const tr = e.target.closest('tr[data-choke]'); if (!tr) return; const k = (ShipData.st.choke.data.summary || []).find(x => x.name === tr.dataset.choke); if (k) { pick({ type: 'chokepoint', item: k }); if (Number.isFinite(k.lat)) S.globe.flyTo(k.lon, k.lat, 25); } });
    $('#chokeExport').addEventListener('click', () => { const r = ShipData.st.choke; if (!r || !r.ok) return; download('chokepoint.csv', toCsv([['nama', 'tanggal_terakhir', 'transit_terakhir', 'rata7', 'perubahan_vs_1thn', 'tanker7', 'kontainer7'], ...r.data.summary.map(k => [k.name, k.lastDate, k.last, k.avg7, k.chg, k.tanker7, k.container7])]), 'text/csv'); });
    $('#shipSide').innerHTML = '<p class="hint">Klik kapal atau chokepoint di globe atau tabel. Tombol di atas globe melompat ke selat penting.</p>';
  }
  return {
    show() {
      build();
      /* tabel chokepoint milik halaman ini; status bersama ShipData.st.choke bisa sudah diisi halaman Intel */
      if (!S.chokeShown) loadChoke();
      loadShips();
      clearInterval(S.timer);
      S.timer = setInterval(() => { if (!$('#page-ships').hidden && !document.hidden) loadShips(); }, 10000);
    },
    hide() { clearInterval(S.timer); },
    jump(name) {
      build();
      const n = String(name || '').toLowerCase();
      const j = JUMPS.find(x => x[0].toLowerCase().startsWith(n));
      if (j) { setTimeout(() => S.globe.flyTo(j[1], j[2], j[3]), 300); return true; }
      /* selat yang tidak punya tombol lompat: pakai koordinat referensi CHOKE_REF */
      const c = CHOKE_REF.find(r => r[0] === n || r[2].toLowerCase().startsWith(n) || r[1].toLowerCase().includes(n));
      if (c) { setTimeout(() => S.globe.flyTo(c[4], c[3], 25), 300); return true; }
      return false;
    },
  };
})();
