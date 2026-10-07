# Menambah fitur ke QuantTerminal tanpa saling bentrok

Setiap fitur baru sebaiknya hanya **menambah file**, bukan mengubah file inti. Titik sambungnya:

| Mau menambah | Caranya | Contoh yang sudah ada |
|---|---|---|
| Halaman | `src/pages/NN-nama.html` (berisi `<section id="page-nama" class="page" hidden>`), `src/css/NN-nama.css` (di `@layer pages`), `src/js/NN-nama.js` yang diakhiri `App.registerPage('nama', NamaPage, { group, groupLabel, label, short, icon, after })`. Modul punya `show()` dan boleh `hide()`. | `src/pages/30-watchlist.html`, `src/js/08c-watchlists.js` |
| Tab di detail aset | `SecurityTabs.register({ id, label, verb, types, order, render: async (entity, el, ctx) => {...} })`. Cek `ctx.alive()` setelah setiap `await`. | `src/js/09b-security.js` |
| Indikator grafik | `ProChart.register({ id, label, title, apply(chart, bars, ctx) => ({ series: [...], note }) })`. Rumusnya taruh di modul murni yang diuji. | `src/js/09a-prochart.js` |
| Rute server | `server/routes/nama.mjs`: `export default ctx => ({ providers: [[id, meta]], gates: { id: new ctx.Bucket(cap, perSec) }, connect: ['https://host-yang-dipanggil-langsung-dari-browser'], routes: { '/api/nama': async q => ctx.viaCache(...) } })`. Validasi semua parameter dengan `ctx.need/opt` (pola regex ketat, nilai tetap supaya kunci cache tidak meledak). | – |
| Sumber data di browser | `SOURCE_DEFS.nama = { name, kind, direct, server, auth, quality, home, limit }` di file fiturmu, lalu `getData('nama', {...})`. | `src/js/01b-data.js` |
| Logika murni (parser, rumus, skor) | `shared/nama.mjs` tanpa `import`; build membungkusnya jadi namespace `Nama`. Tes di `test/nama.test.mjs` (Node `node:test`). | `shared/commands.mjs`, `test/commands.test.mjs` |
| Entitas yang bisa dicari | Tambah ke `shared/entity-seed.mjs` (kode, nama, pemetaan sumber; **tanpa angka pasar**) atau `REG.add(...)` saat jalan. | – |
| Perintah | Verb/global baru di `shared/commands.mjs` + tes; pelaksananya di `Terminal.exec` (`src/js/08b-terminal.js`). | – |
| Tes browser | `qa/scenarios/NN-nama.mjs` dengan ID unik (mis. `F1`). Harness otomatis menggagalkan skenario bila ada error JS, promise ditolak, console.error, loading macet, atau lebih dari satu halaman tampil. | `qa/scenarios/50-flows.mjs` |

## Aturan data (tidak bisa ditawar)

- Tidak ada angka karangan. Sumber gagal → `unavailableBox(judul, hasil, saran)` atau `datum(null, { reason })`, tampil "–"/"Tidak tersedia" dengan alasannya. Bukan 0, NaN, atau kotak kosong.
- Setiap angka membawa asal-usul: pakai `datumFrom(r, nilai, meta)` + `datumHtml(d)`, atau `Lineage.wrap({...})`. Kualitas: `live, delayed, eod, historical, projection, calculated, proxy, inference, sim, stale, unofficial, unavailable`. Harian bukan live; proksi bukan "smart money"; heuristik = "Analisis otomatis".
- Salinan lama hanya boleh tampil berlabel `stale` (Basi). Waktu ambil (`fetchedAt`) asli dari sumber/server, bukan `new Date()` saat menggambar.
- Simulasi hanya bila `State.demo` aktif, selalu berlabel `sim`, dan tidak pernah masuk ke halaman detail aset, watchlist, atau alert.
- Kunci API hanya di `.env` server. Browser tidak pernah melihatnya. Jangan scrape situs yang melarang; jangan pakai API berbayar tanpa memberi tahu pemilik.
- Tidak ada data pribadi tokoh (alamat, nomor, email, keluarga).
- Empat keadaan per modul: memuat (`.loading`), berhasil, tidak tersedia, error. Loading tidak boleh tertinggal.
- Setelah setiap `await`: cek apakah tampilan masih milik permintaan ini (nomor urut atau `ctx.alive()`), dan teruskan `alive` ke `getData` untuk penyedia berantrean (GDELT).
- Elemen yang disembunyikan pakai atribut `hidden` (CSS global memaksanya `display:none`).

## Sebelum mengirim perubahan

```
npm test
npm run build
npm run e2e          # atau npm run e2e -- F   untuk skenario ID F saja
npm run secrets
```
