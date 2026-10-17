/* =====================================================================
   ALERT
   Bentuk: { id, entityId, symbol, condition: {field, op, value | ref:'avg', mult}, text,
             createdAt, triggeredAt, enabled, source, lastCheckAt, lastValue, lastQuality, lastSource, lastNote }
   - Dicek tiap 30 detik memakai Quotes (data nyata). Data tidak tersedia/basi = TIDAK memicu.
   - Tidak ada alert contoh/palsu: daftar awal kosong.
   - Notifikasi browser hanya bila didukung DAN pengguna mengizinkan lewat tombol.
   ===================================================================== */
const Alerts = (() => {
  const KEY = 'alerts';
  let list = load(), timer = null, n = list.reduce((m, a) => Math.max(m, +String(a.id).slice(1) || 0), 0);
  function load() {
    const s = Store.get(KEY, []);
    return Array.isArray(s) ? s.filter(a => a && a.id && a.entityId && REG.get(a.entityId) && a.condition && ['price', 'chg', 'volume'].includes(a.condition.field)) : [];
  }
  function save() { Store.set(KEY, list); bus.emit('alerts', list); }
  const cmp = (v, op, x) => (op === '>' ? v > x : op === '<' ? v < x : op === '>=' ? v >= x : op === '<=' ? v <= x : false);

  /* rata-rata volume harian 20 bar terakhir (tanpa bar hari ini) dari riwayat nyata */
  async function avgVolume(e) {
    const h = await Quotes.history(e, '3M');
    const v = (h.bars || []).slice(-21, -1).map(b => b.volume).filter(x => Number.isFinite(x) && x > 0);
    return v.length >= 10 ? { avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length, source: h.source } : null;
  }
  async function check(a) {
    const e = REG.get(a.entityId);
    const q = await Quotes.get(e);
    a.lastCheckAt = new Date().toISOString();
    const c = a.condition;
    let v = null, note = '';
    if (c.field === 'price') v = q.price.value;
    else if (c.field === 'chg') v = q.changePct ? q.changePct.value : null;
    else if (c.field === 'volume') v = q.volume ? q.volume.value : null;
    a.lastQuality = q.price.quality; a.lastSource = q.price.source || q.reason || '';
    if (v === null || q.price.quality === 'stale' || q.price.quality === 'unavailable') { a.lastValue = null; a.lastNote = 'Data tidak tersedia atau basi: alert tidak dievaluasi. ' + (q.reason || ''); return false; }
    a.lastValue = v;
    let threshold = c.value;
    if (c.ref === 'avg') {
      const av = await avgVolume(e);
      if (!av) { a.lastNote = 'Riwayat volume tidak cukup (minimal 10 hari) untuk menghitung rata-rata.'; return false; }
      threshold = av.avg * c.mult; note = `rata-rata ${av.n} hari ${fmtCompact(av.avg)} × ${c.mult} = ${fmtCompact(threshold)} (${av.source})`;
    }
    a.lastNote = note;
    if (!cmp(v, c.op, threshold)) return false;
    a.triggeredAt = new Date().toISOString();
    a.triggeredValue = v; a.triggeredSource = a.lastSource; a.triggeredQuality = a.lastQuality;
    notify(a);
    return true;
  }
  function notify(a) {
    const msg = `Alert terpicu: ${a.text}. Nilai ${fmt(a.triggeredValue, 2)} (${a.triggeredSource}).`;
    toast(msg, 9000);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('QuantTerminal', { body: msg }); } catch { /* beberapa browser hanya izinkan lewat service worker */ }
    }
  }
  async function checkAll() {
    const active = list.filter(a => a.enabled && !a.triggeredAt);
    for (const a of active) {
      try { await check(a); } catch (err) { a.lastNote = 'Gagal dicek: ' + err.message; ErrorLog.report('provider', 'Alert ' + a.text + ': ' + err.message); }
    }
    if (active.length) save();
  }
  function start() { if (!timer) timer = setInterval(() => { if (!document.hidden) checkAll(); }, 30000); }
  return {
    list: () => list.slice(),
    create(entity, condition, text, source) {
      const a = { id: 'a' + (++n), entityId: entity.id, symbol: entity.symbol, condition: { ...condition }, text: text || (entity.symbol + ' ' + condition.field + ' ' + condition.op + ' ' + (condition.value ?? 'AVG*' + condition.mult)), createdAt: new Date().toISOString(), triggeredAt: null, enabled: true, source: source || 'ui' };
      list.unshift(a); save(); start();
      check(a).then(() => save()).catch(() => {});
      return a;
    },
    remove(id) { list = list.filter(a => a.id !== id); save(); },
    toggle(id) { const a = list.find(x => x.id === id); if (a) { a.enabled = !a.enabled; save(); } },
    rearm(id) { const a = list.find(x => x.id === id); if (a) { a.triggeredAt = null; a.enabled = true; save(); } },
    checkAll: () => checkAll().then(() => save()),
    start,
    notifySupported: () => 'Notification' in window,
    async requestPermission() { if (!('Notification' in window)) return 'unsupported'; try { return await Notification.requestPermission(); } catch { return 'denied'; } },
  };
})();

const AlertsPage = (() => {
  let built = false;
  const fieldLbl = { price: 'Harga', chg: 'Perubahan %', volume: 'Volume' };
  function render() {
    const L = Alerts.list();
    $('#alBody').innerHTML = L.length ? `<table class="dense"><thead><tr><th>Kondisi</th><th>Status</th><th class="num">Nilai terakhir</th><th>Kualitas · sumber</th><th>Dibuat</th><th>Terpicu</th><th>Asal</th><th><span class="sr">Aksi</span></th></tr></thead><tbody>${L.map(a => `
      <tr data-id="${esc(a.id)}"><td><b>${esc(a.text)}</b>${a.lastNote ? `<span class="sub">${esc(a.lastNote)}</span>` : ''}</td>
      <td>${a.triggeredAt ? '<span class="tpill hot">terpicu</span>' : a.enabled ? '<span class="tpill">aktif</span>' : '<span class="tpill">dijeda</span>'}</td>
      <td class="num">${a.lastValue === null || a.lastValue === undefined ? '<span class="na">–</span>' : esc(fmt(a.lastValue, 2))}</td>
      <td>${a.lastQuality ? qBadge(a.lastQuality) : ''} <span class="sub">${esc(a.lastSource || '')}${a.lastCheckAt ? ' · dicek ' + esc(fmtAge(a.lastCheckAt)) : ''}</span></td>
      <td>${esc(fmtTime(a.createdAt))}</td><td>${a.triggeredAt ? esc(fmtTime(a.triggeredAt)) + ` <span class="sub">nilai ${esc(fmt(a.triggeredValue, 2))}</span>` : '–'}</td><td>${esc(a.source)}</td>
      <td class="acts">${a.triggeredAt ? '<button type="button" class="mini-btn" data-rearm>Aktifkan lagi</button>' : `<button type="button" class="mini-btn" data-toggle>${a.enabled ? 'Jeda' : 'Lanjutkan'}</button>`}<button type="button" class="mini-btn" data-del aria-label="Hapus alert ${esc(a.text)}">×</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="hint" style="padding:12px 14px">Belum ada alert. Buat lewat form di atas atau perintah <code>ALERT AAPL &gt; 300</code>, <code>ALERT BTC CHG &lt; -5</code>, <code>ALERT AAPL VOLUME &gt; AVG*2</code>.</p>';
    const ns = $('#alNotif');
    if (!Alerts.notifySupported()) { ns.textContent = 'Browser ini tidak mendukung notifikasi; alert tampil sebagai pesan di layar.'; $('#alNotifBtn').hidden = true; }
    else { ns.textContent = 'Notifikasi browser: ' + ({ granted: 'diizinkan', denied: 'ditolak (ubah di pengaturan browser)', default: 'belum diizinkan' }[Notification.permission] || Notification.permission); $('#alNotifBtn').hidden = Notification.permission !== 'default'; }
  }
  function build() {
    if (built) return; built = true;
    $('#alForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const sym = $('#alSym').value.trim(), field = $('#alField').value, op = $('#alOp').value, val = $('#alVal').value.trim();
      const text = `ALERT ${sym} ${field.toUpperCase()} ${op} ${val}`;
      const r = Commands.parse(text, REG);
      const out = $('#alMsg');
      if (!r.ok) { out.textContent = r.error; return; }
      const a = Alerts.create(r.entity, r.condition, r.canonical, 'form');
      out.textContent = 'Alert dibuat: ' + a.text;
      $('#alVal').value = '';
      render();
    });
    $('#alBody').addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
      const id = tr.dataset.id;
      if (ev.target.closest('[data-del]')) Alerts.remove(id);
      else if (ev.target.closest('[data-toggle]')) Alerts.toggle(id);
      else if (ev.target.closest('[data-rearm]')) Alerts.rearm(id);
      render();
    });
    $('#alCheck').addEventListener('click', async () => { $('#alMsg').textContent = 'Mengecek…'; await Alerts.checkAll(); $('#alMsg').textContent = 'Selesai dicek ' + fmtTime(new Date().toISOString()); render(); });
    $('#alNotifBtn').addEventListener('click', async () => { await Alerts.requestPermission(); render(); });
    bus.on('alerts', () => { if (!$('#page-alerts').hidden) render(); });
  }
  return { show() { build(); render(); } };
})();
App.registerPage('alerts', AlertsPage);
