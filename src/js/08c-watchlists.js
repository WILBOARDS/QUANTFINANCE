/* =====================================================================
   WATCHLIST: banyak daftar, tambah/hapus/urutkan/ganti nama, disimpan di localStorage.
   Isi daftar hanya id entitas (referensi). Harga diambil saat ditampilkan lewat Quotes;
   yang tidak punya sumber tampil "Tidak tersedia", bukan angka karangan.
   ===================================================================== */
const Watchlists = (() => {
  const KEY = 'watchlists';
  const DEFAULT = () => ({ lists: [{ id: 'w1', name: 'Utama', items: ['stock:AAPL', 'stock:NVDA', 'crypto:BTC', 'index:IHSG', 'fx:USDIDR', 'commodity:WTI', 'rate:US10Y'] }], active: 'w1', n: 1 });
  let st = load();
  function load() {
    const s = Store.get(KEY, null);
    if (!s || !Array.isArray(s.lists) || !s.lists.length) return DEFAULT();
    /* buang item yang entitasnya tidak dikenal lagi, jaga bentuk data */
    s.lists = s.lists.filter(l => l && l.id && typeof l.name === 'string').map(l => ({ id: l.id, name: l.name.slice(0, 40), items: (l.items || []).filter(id => typeof id === 'string' && REG.get(id)) }));
    if (!s.lists.length) return DEFAULT();
    if (!s.lists.some(l => l.id === s.active)) s.active = s.lists[0].id;
    s.n = s.n || s.lists.length;
    return s;
  }
  function save() { Store.set(KEY, st); bus.emit('watchlists', st); }
  const byId = id => st.lists.find(l => l.id === id) || null;
  const cleanName = n => String(n || '').replace(/[<>]/g, '').trim().slice(0, 40);
  return {
    lists: () => st.lists.map(l => ({ ...l, items: l.items.slice() })),
    active: () => byId(st.active) || st.lists[0],
    setActive(id) { if (byId(id)) { st.active = id; save(); } },
    create(name) {
      const nm = cleanName(name) || 'Daftar ' + (st.lists.length + 1);
      const l = { id: 'w' + (++st.n), name: nm, items: [] };
      st.lists.push(l); st.active = l.id; save();
      return l;
    },
    rename(id, name) { const l = byId(id), nm = cleanName(name); if (l && nm) { l.name = nm; save(); return true; } return false; },
    remove(id) {
      if (st.lists.length <= 1) return false;          // minimal satu daftar
      st.lists = st.lists.filter(l => l.id !== id);
      if (st.active === id) st.active = st.lists[0].id;
      save(); return true;
    },
    add(listId, entityId) {
      const l = byId(listId); if (!l || !REG.get(entityId) || l.items.includes(entityId)) return false;
      if (l.items.length >= 200) return false;
      l.items.push(entityId); save(); return true;
    },
    removeItem(listId, entityId) { const l = byId(listId); if (!l) return false; const n = l.items.length; l.items = l.items.filter(x => x !== entityId); if (l.items.length !== n) { save(); return true; } return false; },
    /* pindahkan item dari indeks "from" ke "to" */
    move(listId, from, to) {
      const l = byId(listId); if (!l) return false;
      if (from < 0 || from >= l.items.length || to < 0 || to >= l.items.length || from === to) return false;
      const [x] = l.items.splice(from, 1); l.items.splice(to, 0, x); save(); return true;
    },
    has: (listId, entityId) => !!(byId(listId) && byId(listId).items.includes(entityId)),
    reset() { st = DEFAULT(); save(); },
  };
})();

const WatchlistPage = (() => {
  let built = false, timer = null, seq = 0;
  const quotes = new Map();          // id entitas -> hasil Quotes.get terakhir
  const typeLbl = t => REG.types[t] || t;

  function tabs() {
    const a = Watchlists.active();
    $('#wlTabs').innerHTML = Watchlists.lists().map(l => `<button type="button" role="tab" data-wl="${esc(l.id)}" aria-selected="${l.id === a.id}">${esc(l.name)} <span class="sub">${l.items.length}</span></button>`).join('');
  }
  function row(e, i, n) {
    const q = quotes.get(e.id);
    const price = q ? datumHtml(q.price, { dp: priceDp(e, q.price.value), label: e.symbol + ' harga' }) : '<span class="loading sm">…</span>';
    const chg = q && q.changePct && q.changePct.value !== null ? `<span class="${sign(q.changePct.value)}">${datumHtml(q.changePct, { dp: 2, label: e.symbol + ' perubahan %' })}%</span>` : '<span class="na">–</span>';
    const age = q ? datumAge(q.price) : '';
    return `<tr data-id="${esc(e.id)}"><td><button type="button" class="link-btn" data-open="${esc(e.id)}">${esc(e.symbol || e.name)}</button></td><td>${esc(e.name)}</td><td><span class="tpill">${esc(typeLbl(e.type))}</span></td>
      <td class="num">${price}</td><td class="num">${chg}</td><td>${age}</td><td class="src">${esc(q && q.price.value !== null ? q.price.source : (q ? q.reason || '' : ''))}</td>
      <td class="acts"><button type="button" class="mini-btn" data-mv="-1" aria-label="Naikkan ${esc(e.symbol)}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="mini-btn" data-mv="1" aria-label="Turunkan ${esc(e.symbol)}" ${i === n - 1 ? 'disabled' : ''}>↓</button><button type="button" class="mini-btn" data-rm aria-label="Hapus ${esc(e.symbol)} dari daftar">×</button></td></tr>`;
  }
  function render() {
    tabs();
    const l = Watchlists.active();
    const ents = l.items.map(id => REG.get(id)).filter(Boolean);
    $('#wlTitle').textContent = l.name;
    $('#wlBody').innerHTML = ents.length
      ? `<table class="dense wl-table"><thead><tr><th>Kode</th><th>Nama</th><th>Jenis</th><th class="num">Harga</th><th class="num">Perubahan</th><th>Kualitas · umur data</th><th>Sumber</th><th><span class="sr">Aksi</span></th></tr></thead><tbody>${ents.map((e, i) => row(e, i, ents.length)).join('')}</tbody></table>`
      : '<p class="hint" style="padding:12px 14px">Daftar ini kosong. Tambahkan aset lewat kolom di atas atau perintah <code>WATCH AAPL</code>.</p>';
    $('#wlDel').disabled = Watchlists.lists().length <= 1;
  }
  /* ambil harga semua item, paling banyak 4 sekaligus supaya tidak membanjiri penyedia */
  async function refresh() {
    const my = ++seq;
    const ents = Watchlists.active().items.map(id => REG.get(id)).filter(Boolean);
    let k = 0;
    const worker = async () => {
      while (k < ents.length) {
        const e = ents[k++];
        const q = await Quotes.get(e);
        if (my !== seq) return;
        quotes.set(e.id, q);
        const tr = $(`#wlBody tr[data-id="${CSS.escape(e.id)}"]`);
        if (tr) { const i = Watchlists.active().items.indexOf(e.id); tr.outerHTML = row(e, i, Watchlists.active().items.length); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (my === seq) $('#wlUpdated').textContent = 'Diperbarui ' + fmtTime(new Date().toISOString());
  }
  function addFromInput() {
    const v = $('#wlAdd').value.trim(); if (!v) return;
    const e = REG.resolve(v, ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate']) || (REG.search(v, { limit: 1, types: ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate'] })[0] || {}).entity;
    const out = $('#wlMsg');
    if (!e) { out.textContent = `"${v}" tidak dikenal atau tidak punya harga.`; return; }
    const ok = Watchlists.add(Watchlists.active().id, e.id);
    out.textContent = ok ? `${e.symbol} ditambahkan.` : `${e.symbol} sudah ada di daftar ini.`;
    $('#wlAdd').value = '';
    render(); refresh();
  }
  function build() {
    if (built) return; built = true;
    $('#wlTabs').addEventListener('click', ev => { const b = ev.target.closest('[data-wl]'); if (b) { Watchlists.setActive(b.dataset.wl); render(); refresh(); } });
    /* form nama (daftar baru / ganti nama) di tempat, tanpa dialog bawaan browser */
    let nameMode = null, delArmed = null;
    const form = $('#wlNameForm'), nameIn = $('#wlName');
    const openForm = (mode, val) => { nameMode = mode; form.hidden = false; nameIn.value = val; $('#wlNameLbl').textContent = mode === 'new' ? 'Nama daftar baru' : 'Nama baru'; nameIn.focus(); };
    const closeForm = () => { nameMode = null; form.hidden = true; };
    $('#wlNew').addEventListener('click', () => openForm('new', ''));
    $('#wlRename').addEventListener('click', () => openForm('rename', Watchlists.active().name));
    $('#wlNameCancel').addEventListener('click', closeForm);
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      if (nameMode === 'new') { Watchlists.create(nameIn.value); $('#wlMsg').textContent = 'Daftar dibuat.'; }
      else if (nameMode === 'rename' && !Watchlists.rename(Watchlists.active().id, nameIn.value)) { $('#wlMsg').textContent = 'Nama tidak boleh kosong.'; return; }
      closeForm(); render(); refresh();
    });
    nameIn.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); closeForm(); } });
    /* hapus daftar: klik dua kali (konfirmasi di tombol yang sama, kedaluwarsa 4 detik) */
    $('#wlDel').addEventListener('click', ev => {
      const b = ev.currentTarget, l = Watchlists.active();
      if (delArmed !== l.id) { delArmed = l.id; b.textContent = 'Yakin hapus?'; setTimeout(() => { delArmed = null; b.textContent = 'Hapus daftar'; }, 4000); return; }
      delArmed = null; b.textContent = 'Hapus daftar';
      Watchlists.remove(l.id); $('#wlMsg').textContent = `Daftar "${l.name}" dihapus.`; render(); refresh();
    });
    $('#wlAddBtn').addEventListener('click', addFromInput);
    $('#wlAdd').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); addFromInput(); } });
    $('#wlRefresh').addEventListener('click', refresh);
    $('#wlExport').addEventListener('click', () => {
      const l = Watchlists.active();
      download(`watchlist-${l.name}.csv`, toCsv([['kode', 'nama', 'jenis', 'harga', 'perubahan_pct', 'kualitas', 'waktu_data', 'diambil', 'sumber'], ...l.items.map(id => { const e = REG.get(id), q = quotes.get(id) || {}; const p = q.price || {}; return [e.symbol, e.name, e.type, p.value, q.changePct ? q.changePct.value : null, p.quality, p.asOf, p.fetchedAt, p.source]; })]), 'text/csv');
    });
    $('#wlBody').addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
      const id = tr.dataset.id, l = Watchlists.active();
      if (ev.target.closest('[data-open]')) { SecurityPage.open(REG.get(id), 'overview'); App.showPage('security'); return; }
      if (ev.target.closest('[data-rm]')) { Watchlists.removeItem(l.id, id); quotes.delete(id); render(); return; }
      const mv = ev.target.closest('[data-mv]');
      if (mv) { const i = l.items.indexOf(id); Watchlists.move(l.id, i, i + +mv.dataset.mv); render(); }
    });
    bus.on('watchlists', () => { if (!$('#page-watchlist').hidden) render(); });
  }
  return {
    show() {
      build(); render(); refresh();
      clearInterval(timer);
      timer = setInterval(() => { if (!$('#page-watchlist').hidden && !document.hidden) refresh(); }, 20000);
    },
    hide() { clearInterval(timer); timer = null; seq++; },
  };
})();
/* jumlah desimal wajar per jenis/nilai */
function priceDp(e, v) {
  if (!Number.isFinite(v)) return 2;
  if (e.type === 'fx') return v > 100 ? 0 : v > 10 ? 2 : 4;
  if (e.type === 'rate') return 2;
  if (e.currency === 'IDR' || e.currency === 'KRW') return 0;
  return v < 1 ? 4 : v < 10 ? 3 : 2;
}
App.registerPage('watchlist', WatchlistPage);
