/* =====================================================================
   PANEL RUANG KERJA
   Setiap kartu (.card yang punya .card-head) di setiap halaman bisa:
   - diperkecil (hanya judul yang tampil), - diperbesar (memenuhi area kerja, Esc untuk kembali),
   - ditutup (disembunyikan; dipulihkan lewat tombol "Panel tersembunyi" di bilah samping).
   Status disimpan per panel di localStorage. Pindah halaman (ruang kerja) tanpa memuat ulang.
   ===================================================================== */
const Panels = (() => {
  const KEY = 'panels';
  let st = Store.get(KEY, {});
  if (!st || typeof st !== 'object') st = {};
  const ICON = {
    min: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="1.6"/></svg>',
    max: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    close: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  function keyOf(card) {
    if (card.dataset.panel) return card.dataset.panel;
    const page = card.closest('.page');
    const cls = [...card.classList].find(c => c !== 'card' && !c.startsWith('is-')) || 'card';
    const same = page ? [...page.querySelectorAll('.card.' + cls)] : [card];
    const k = (page ? page.id.replace('page-', '') : 'x') + ':' + cls + (same.length > 1 ? ':' + same.indexOf(card) : '');
    card.dataset.panel = k;
    return k;
  }
  const save = () => { Store.set(KEY, st); renderHidden(); };
  function apply(card) {
    const s = st[keyOf(card)] || {};
    card.classList.toggle('is-min', !!s.min);
    card.hidden = !!s.closed;
    const b = card.querySelector('.panel-ctl [data-pc="min"]');
    if (b) { b.setAttribute('aria-pressed', String(!!s.min)); b.setAttribute('aria-label', (s.min ? 'Perluas panel ' : 'Perkecil panel ') + titleOf(card)); }
  }
  const titleOf = card => (card.querySelector('.card-head h2, .card-head h3, .card-head strong') || {}).textContent || card.getAttribute('aria-label') || 'panel';
  function setMax(card, on) {
    $$('.card.is-max').forEach(c => { if (c !== card) c.classList.remove('is-max'); });
    card.classList.toggle('is-max', on);
    document.body.classList.toggle('has-max', on);
    const b = card.querySelector('.panel-ctl [data-pc="max"]');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', (on ? 'Kembalikan ukuran ' : 'Perbesar ') + titleOf(card)); }
    window.dispatchEvent(new Event('resize'));           // grafik & globe menyesuaikan ukuran
  }
  function decorate(card) {
    if (card.querySelector(':scope > .card-head .panel-ctl')) return;
    const head = card.querySelector(':scope > .card-head'); if (!head) return;
    const t = titleOf(card);
    const ctl = document.createElement('span');
    ctl.className = 'panel-ctl';
    ctl.innerHTML = `<button type="button" class="pc" data-pc="min" aria-pressed="false" aria-label="Perkecil panel ${esc(t)}" title="Perkecil">${ICON.min}</button>` +
      `<button type="button" class="pc" data-pc="max" aria-pressed="false" aria-label="Perbesar ${esc(t)}" title="Perbesar (Esc untuk kembali)">${ICON.max}</button>` +
      `<button type="button" class="pc" data-pc="close" aria-label="Tutup panel ${esc(t)}" title="Tutup (pulihkan dari bilah samping)">${ICON.close}</button>`;
    head.appendChild(ctl);
    apply(card);
  }
  function init(root = document) { root.querySelectorAll('.page .card').forEach(decorate); renderHidden(); }
  function renderHidden() {
    const box = $('#panelHidden'); if (!box) return;
    const keys = Object.keys(st).filter(k => st[k].closed);
    box.hidden = !keys.length;
    box.innerHTML = keys.length ? `<button type="button" class="side-restore" data-restore-all>Panel tersembunyi (${keys.length}): pulihkan</button>` : '';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.panel-ctl [data-pc]');
    if (b) {
      const card = b.closest('.card'), k = keyOf(card), s = st[k] || (st[k] = {});
      if (b.dataset.pc === 'min') { s.min = !s.min; if (s.min) setMax(card, false); apply(card); save(); window.dispatchEvent(new Event('resize')); }
      else if (b.dataset.pc === 'max') setMax(card, !card.classList.contains('is-max'));
      else if (b.dataset.pc === 'close') { s.closed = true; setMax(card, false); apply(card); save(); toast(`Panel "${titleOf(card)}" ditutup. Pulihkan lewat bilah samping.`); }
      return;
    }
    if (e.target.closest('[data-restore-all]')) restoreAll();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const c = $('.card.is-max'); if (c && !document.querySelector('dialog[open]')) setMax(c, false); } });
  function restoreAll() {
    st = {}; Store.set(KEY, st);
    $$('.page .card[data-panel]').forEach(c => { c.classList.remove('is-min'); setMax(c, false); apply(c); });
    renderHidden();
  }
  return { init, restoreAll, state: () => JSON.parse(JSON.stringify(st)) };
})();

/* ---------- HELP: daftar perintah dari parser (sumber kebenaran yang sama dengan tes) ---------- */
const Help = (() => {
  function open(topic) {
    let dlg = $('#helpDlg');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'helpDlg'; dlg.className = 'help-dlg'; dlg.setAttribute('aria-label', 'Bantuan perintah');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => {
        if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
        const ex = e.target.closest('[data-ex]');
        if (ex) { dlg.close(); CommandBar.fill(ex.dataset.ex); }
      });
    }
    const h = Commands.helpRows();
    const T = topic && (Commands.VERBS[topic] || Commands.GLOBALS[topic]);
    dlg.innerHTML = `<div class="dlg">
      <div class="lp-head"><h2>Perintah terminal</h2><button type="button" class="icon-btn sm" data-close aria-label="Tutup">×</button></div>
      ${T ? `<p class="lead"><b>${esc(topic)}</b>: ${esc(T.label)}${T.types ? ' · berlaku untuk: ' + esc(T.types.map(t => REG.types[t] || t).join(', ')) : ''}${T.args ? ' · argumen: ' + esc(T.args) : ''}</p>` : ''}
      <p class="hint">Bentuk: <code>&lt;KODE&gt; &lt;VERB&gt;</code> (contoh <code>AAPL GP</code>) atau perintah global (<code>WATCH AAPL</code>). Huruf besar/kecil sama saja. Ctrl+K atau / untuk fokus ke bilah perintah; panah atas untuk riwayat.</p>
      <div class="help-cols">
        <div><h3>Verb setelah aset</h3><table class="dense static"><tbody>${h.verbs.map(v => `<tr><td><code>${esc(v.cmd)}</code></td><td>${esc(v.label)}</td></tr>`).join('')}</tbody></table></div>
        <div><h3>Perintah global</h3><table class="dense static"><tbody>${h.globals.map(g => `<tr><td><code>${esc(g.cmd)}</code></td><td>${esc(g.label)}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <h3>Contoh (klik untuk mencoba)</h3><div class="pillset">${h.examples.map(x => `<button type="button" class="mini-btn" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="dlg-foot"><button type="button" class="btn" data-close>Tutup</button></div></div>`;
    if (!dlg.open) dlg.showModal();
  }
  return { open };
})();

/* ---------- aksesibilitas keyboard ----------
   1. Baris tabel yang bisa diklik (berita, negara, kapal, chokepoint) bisa dipakai dengan Enter/Spasi.
   2. Banyak kontrol digambar ulang lewat innerHTML (chip wilayah, tab, header urut, panel stress).
      Kalau elemen yang sedang difokus ikut terhapus, fokus dikembalikan ke elemen penggantinya
      (dicocokkan lewat id / atribut data-* / teks), supaya pengguna keyboard tidak "terlempar" ke <body>. */
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element && e.target.matches('tr[tabindex]')) { e.preventDefault(); e.target.click(); }
});
const FocusKeeper = (() => {
  let last = null;
  function sig(el) {
    if (!el || el === document.body || !(el instanceof Element)) return null;
    const box = el.parentElement && el.parentElement.closest('[id]');
    const data = [...el.attributes].filter(a => a.name.startsWith('data-') && a.name !== 'data-qa-key' && a.value.length < 80).map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
    return { id: el.id || '', box: box ? box.id : '', sel: el.tagName.toLowerCase() + data, text: data ? '' : (el.textContent || '').trim().slice(0, 40) };
  }
  function find(s) {
    if (s.id) return document.getElementById(s.id);
    const root = s.box ? document.getElementById(s.box) : document;
    if (!root) return null;
    const cands = [...root.querySelectorAll(s.sel)].filter(x => x.getClientRects().length);
    return s.text ? cands.find(x => (x.textContent || '').trim().slice(0, 40) === s.text) || null : cands[0] || null;
  }
  document.addEventListener('focusin', e => { last = { el: e.target, s: sig(e.target) }; });
  let pending = false;
  new MutationObserver(() => {
    if (pending || !last || !last.s) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (!last || last.el.isConnected || (document.activeElement && document.activeElement !== document.body)) return;
      if (document.querySelector('dialog[open]')) return;
      const el = find(last.s);
      if (el && el.focus) el.focus({ preventScroll: true });
    });
  }).observe(document.body, { childList: true, subtree: true });
  return { get last() { return last; } };
})();
