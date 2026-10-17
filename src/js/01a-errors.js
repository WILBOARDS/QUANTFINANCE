/* =====================================================================
   LOG ERROR INTERNAL
   Satu tempat untuk semua kegagalan: jaringan, penyedia data, parser, tampilan (render),
   perintah, dan error yang tidak tertangkap. Tidak ada yang "gagal diam-diam": setiap
   kegagalan tercatat dan bisa dilihat di halaman Sumber data. Log hanya di memori
   browser ini (tidak dikirim ke mana pun).
   ===================================================================== */
const ErrorLog = (() => {
  const KINDS = { network: 'Jaringan', provider: 'Penyedia data', parser: 'Parser', render: 'Tampilan', command: 'Perintah', uncaught: 'Tak tertangkap' };
  const MAX = 200;
  const items = [];
  let n = 0;
  function report(kind, message, detail) {
    const k = KINDS[kind] ? kind : 'uncaught';
    const msg = String(message || 'tanpa pesan').slice(0, 300);
    const last = items[0];
    /* kegagalan yang sama berulang (mis. polling tiap 5 detik) digabung, bukan memenuhi log */
    if (last && last.kind === k && last.message === msg && Date.now() - Date.parse(last.lastAt) < 60e3) {
      last.count++; last.lastAt = new Date().toISOString();
      bus.emit('errorlog', last);
      return last;
    }
    const e = { id: ++n, kind: k, message: msg, detail: detail ? String(detail).slice(0, 600) : '', at: new Date().toISOString(), lastAt: new Date().toISOString(), count: 1 };
    items.unshift(e);
    if (items.length > MAX) items.pop();
    bus.emit('errorlog', e);
    return e;
  }
  /* jalankan fn; bila melempar error, catat dan kembalikan fallback (tidak menjatuhkan halaman) */
  function guard(kind, label, fn, fallback) {
    try { return fn(); } catch (e) { report(kind, label + ': ' + (e && e.message || e), e && e.stack); return fallback; }
  }
  async function guardAsync(kind, label, fn, fallback) {
    try { return await fn(); } catch (e) { report(kind, label + ': ' + (e && e.message || e), e && e.stack); return fallback; }
  }
  addEventListener('error', ev => report('uncaught', ev.message || 'error', ev.filename ? ev.filename.split('/').pop() + ':' + ev.lineno : ''));
  addEventListener('unhandledrejection', ev => { const r = ev.reason; report('uncaught', 'Promise ditolak: ' + (r && r.message || r), r && r.stack); });
  return {
    KINDS, report, guard, guardAsync,
    list: () => items.slice(),
    count: () => items.reduce((a, e) => a + e.count, 0),
    clear() { items.length = 0; bus.emit('errorlog', null); },
  };
})();
