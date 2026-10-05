# QuantTerminal: konteks proyek dan rencana

Terakhir diperbarui: 5 Oktober 2026
Tujuan file ini: supaya sesi AI berikutnya langsung punya konteks lengkap tanpa bertanya ulang dari nol.
Pasangan file ini: `QUANTTERMINAL_PROMPT.md` (prompt siap pakai), `quant-terminal.html` (v1 jadi), `quantterminal-source.zip` (kode sumber v1).

---

## 1. Siapa, apa, dan untuk apa

- Pemilik proyek: pelajar Indonesia, pemula dalam coding (bekerja dengan bantuan AI), memakai Windows dan VS Code (ada ekstensi Live Server). **Tidak bisa/tidak mau menjalankan Python**, jadi semua harus berjalan di browser atau lewat layanan online.
- Ide awal: "quant finance ala Bloomberg": analisis keuangan perusahaan, tahu cepat sebuah perusahaan sehat atau buruk, saran ke mana surplus kas bisa dialokasikan, data pasar real-time, pergerakan uang.
- Tujuan pemakaian: (1) lomba atau tugas, (2) dipakai sendiri, (3) portofolio untuk daftar kuliah. Waktu pengerjaan terbatas.
- Bahasa antarmuka: Indonesia (casual tapi rapi). Pemilik berbicara santai dalam bahasa Indonesia.

### Catatan untuk AI di sesi berikutnya (cara bekerja dengan pemilik)
- Jawaban pendek, sederhana, tapi detail. Jangan pernah berbohong atau mengklaim sesuatu sudah jalan kalau belum diuji.
- Tanya balik kalau konteks kurang atau kamu tidak yakin. Satu pertanyaan jelas lebih baik daripada menebak.
- Pemilik minta dikritik dengan jujur dan diajari (jadi pemandu dan guru). Pemilik tahu bahwa vibe coding bukan cara terbaik; dukung itu, tapi dorong dia memahami file inti (`03-health.js`, `07-cash.js`) supaya bisa menjelaskan proyeknya saat wawancara atau lomba.
- Selalu pisahkan "terverifikasi" dari "belum diuji". Selalu beri saran peningkatan beserta alasannya.

---

## 2. Visi (kata-kata pemilik, dirangkum)

Peta dunia seperti Bloomberg yang menampilkan **pergerakan semua negara**: politik, kondisi ekonomi, berita apa pun. Ditambah **harga real-time tiap saham**, **pergerakan smart money dan whale**, dan **data orang penting** seperti di Bloomberg. Sebagus dan secanggih mungkin. Daftar saham tampil di sisi kanan.

### Kritik jujur terhadap visi ini
1. **Itu produk bernilai miliaran dolar.** Bloomberg punya data berlisensi, ribuan jurnalis, dan tim. Satu orang tidak bisa menyamainya. Yang bisa: versi fokus yang terlihat dan terasa seperti terminal, dengan data nyata di bagian yang datanya memang tersedia gratis.
2. **"Real-time tiap saham di semua negara" tidak bisa gratis.** Data real-time resmi hampir selalu berlisensi dan berbayar (lihat bagian 5). Yang realistis: real-time untuk kripto dan saham AS, tertunda atau tidak resmi untuk bursa lain.
3. **"Smart money" untuk saham itu hampir selalu tertunda** (laporan 13F kuartalan, Form 4 insider beberapa hari). Real-time hanya realistis untuk whale kripto. Jangan pernah memalsukan "alert whale" demi tampilan.
4. **Data tokoh penting punya batas etika dan hukum.** Hanya informasi peran publik dari sumber publik, lengkap dengan sumbernya. Tidak ada data pribadi (alamat rumah, keluarga, dan sebagainya). Tidak boleh scrape Bloomberg, Reuters, atau LinkedIn.
5. **Risiko "skor risiko politik":** ini subjektif. Kalau dibuat, harus transparan (komponen, sumber, bobot) dan diberi label eksperimental, supaya tidak tampak seperti fakta.
6. **Prioritaskan kedalaman, bukan keluasan.** Satu lapisan peta dengan data nyata yang benar lebih mengesankan (dan lebih jujur) daripada lima lapisan palsu.

---

## 3. Status saat ini: v1 (selesai dan teruji sebagian)

**Bentuk:** satu file HTML mandiri (±490 KB), tanpa server, tanpa Python. Font, library grafik, dan data peta sudah tertanam. Dibuka dengan double-click atau Live Server.

### Isi v1
| Bagian | Keterangan |
|---|---|
| Peta dunia | Canvas buatan sendiri, proyeksi Natural Earth (rumusnya sudah dicocokkan dengan d3-geo, selisih 2e-16). Negara diwarnai menurut perubahan indeks hari ini. 17 bursa dengan titik dan label. Titik berdenyut kalau bursa buka. Bayangan malam dari posisi matahari. Hover memunculkan tooltip. Klik memilih indeks dan memfilter daftar kanan. |
| Jam bursa | Sumbu 24 jam dalam zona waktu pengguna, sesi tiap bursa, garis "sekarang". Memakai `Intl`, hari libur bursa tidak diperhitungkan. |
| Daftar kanan | 30 saham dan kripto, mini-grafik, kedip hijau atau merah, filter wilayah, pencarian (tombol `/`), tab Daftar, Naik, Turun, bar breadth. |
| Grafik | TradingView Lightweight Charts v4.2.3: lilin, area, garis, rentang 1D sampai 5Y, MA 20 dan 50, volume, legenda OHLC. |
| Kesehatan keuangan | Port dari versi Python: Piotroski F-score, Altman Z'', label Sehat, Waspada, Buruk. Bank ditangani terpisah (Altman tidak berlaku). Klik indeks menampilkan ringkasan bursa. |
| Kas dan alokasi | Port dari `cash.py`: arus kas bulanan (bisa diedit), surplus setelah cadangan darurat, alokasi menurut profil risiko, proyeksi 3 skenario, kandidat screening dari daftar saham. Tersimpan di `localStorage`. |
| Lainnya | Pita harga berjalan, halaman Metodologi, dialog Pengaturan, responsif sampai 390 px, mendukung `prefers-reduced-motion`. |

### Yang TERVERIFIKASI (dites di Chromium headless)
- Halaman termuat tanpa error JavaScript; muat 0,3 detik; menggambar peta 1 ms.
- Skenario QA A sampai K lolos: hover, klik negara dengan mouse asli, ganti rentang dan jenis grafik, jam bursa, halaman kas, metodologi, pengaturan, tampilan HP 390 px (tanpa overflow horizontal), tablet 1024 px, laptop 1366x768.
- Rumus skor (versi Python) cocok dengan hitungan tangan.

### Yang BELUM terverifikasi (jangan diklaim jalan)
- **Data live kripto dari Binance.** Jaringan sandbox memblokirnya; kode jatuh kembali ke simulasi dan menampilkan toast. Belum pernah dilihat jalan dengan data asli (CORS, format, batas laju belum teruji).
- Tampilan di Safari dan Firefox; layar sentuh sungguhan; pembaca layar.
- Perilaku saat mengganti zona waktu perangkat.

### PENTING: semua data saham, indeks, dan fundamental di v1 adalah SIMULASI
Kode saham asli (BBCA dan lainnya) hanya nama. Harga dibuat generator acak berbenih. Laporan keuangan juga sintetis, jadi label Sehat atau Buruk di v1 **tidak berarti apa-apa tentang perusahaan sungguhan**. UI sudah memberi label "Data simulasi", jangan dihapus sebelum data nyata terpasang.

### Peta kode v1 (di `quantterminal-source.zip`)
```
src/template.html     kerangka halaman
src/style.css         token desain + komponen (@layer reset, tokens, base, layout, components, pages)
src/js/01-core.js     util, RNG berbenih, bus event, daftar bursa/indeks/saham, State
src/js/02-sim.js      jam bursa, riwayat sintetis, tick simulasi
src/js/03-health.js   Piotroski, Altman Z'', label (fundamental sintetis)
src/js/04-map.js      peta canvas + jam bursa
src/js/05-chart.js    Lightweight Charts + data live kripto
src/js/07-cash.js     modul kas
src/js/08-app.js      penghubung semua modul
build.py              menggabungkan semuanya jadi satu HTML (butuh node_modules)
qa3.mjs               tes browser headless
```
Versi Python/Streamlit sebelumnya (`quant_terminal.zip`) sudah **digantikan** v1 HTML; jangan dilanjutkan.

### Pelajaran teknis (jangan diulang)
- Bayangan malam dengan grid sel 1 derajat plus `blur` butuh **12 detik per gambar** di mesin lambat dan membuat halaman macet. Solusi: satu poligon dari garis terminator. Selalu ukur waktu gambar canvas.
- Lightweight Charts perlu `localization: { locale: 'en-US' }` supaya tidak error di lingkungan dengan locale aneh.
- Di sandbox: `pkill -f chromium` di dalam perintah bash membunuh shell sendiri. Pakai `pkill -x chromium`.
- Library peta tidak dipakai; peta 110m dari `world-atlas` (Natural Earth) sudah cukup, tapi tidak punya Singapura dan Hong Kong (hanya titik).

---

## 4. Keputusan desain (sudah diambil, pertahankan)

- **Identitas visual: "ruang peta laut"** (nautical chart room), bukan hitam dengan hijau neon. Biru laut tua, kuningan sebagai aksen, hijau laut untuk naik, karang untuk turun.
- Token warna: `--abyss #060e1a`, `--deep #0a1727`, `--line #17314a`, `--ink #e8eef6`, `--ink-2 #93a8bf`, `--brass #e0b15a`, `--up #34d1a4`, `--down #ff6f61`.
- Font: Plus Jakarta Sans (UI, desainer Indonesia) dan IBM Plex Mono (angka), keduanya tertanam. Angka pakai `tabular-nums`.
- "Satu hal yang memorable" adalah peta. Elemen lain tenang: garis tipis, radius kecil, tanpa bayangan tebal, tanpa label huruf kapital, tanpa emoji sebagai ikon.
- Kualitas dasar: kontras cukup, `:focus-visible`, target sentuh minimal 24 px, `prefers-reduced-motion`, tanpa overflow horizontal di HP.

---

## 5. Realita data: dari mana tiap kebutuhan bisa diambil

Penelitian 5 Oktober 2026. Yang bertanda **[web]** berasal dari pencarian web hari itu dan umumnya dari sumber pihak ketiga, jadi **cek ulang di situs resmi sebelum membangun**. Yang bertanda **[umum]** berasal dari pengetahuan umum saya dan **belum dites** dari sini.

| Kebutuhan | Kandidat sumber | Biaya dan batas | Status |
|---|---|---|---|
| Harga saham AS, real-time | Finnhub (REST dan WebSocket) | Gratis ±60 panggilan per menit, real-time AS, WebSocket tersedia; gratis untuk penggunaan pribadi, penggunaan komersial dibatasi | [web] |
| Alternatif harga AS | Alpaca (data AS real-time, tanpa batas harian menurut satu sumber), Twelve Data (±8 per menit, ±800 per hari), Polygon (gratis 5 per menit, tertunda 15 menit), Alpha Vantage (±25 per hari) | Bervariasi | [web], batas bisa berubah |
| Harga saham IDX (Indonesia) | Data resmi BEI adalah **langganan berbayar** (real-time, delayed, end-of-day). Jalur gratis: sumber tidak resmi (mis. endpoint Yahoo) atau dataset komunitas | Resmi: berbayar. Tidak resmi: gratis tapi bisa putus dan melanggar ketentuan layanan | [web] |
| Harga saham Asia dan Eropa | Jalur tidak resmi atau berbayar; belum ada sumber gratis real-time yang saya yakini | - | belum dicek |
| Harga kripto real-time | Binance API publik (REST dan WebSocket), tanpa kunci | Gratis, ada batas laju | [umum], belum dites dari browser nyata |
| Ekonomi makro per negara | World Bank API (PDB, inflasi, pengangguran, dll.), IMF DataMapper | Gratis, tanpa kunci | [umum]; **CORS belum dites**, rencanakan lewat proxy |
| Berita dan sinyal politik global | GDELT (volume dan tone berita, peristiwa, lokasi); RSS media (judul dan tautan saja) | Gratis | [umum]; batas laju dan CORS belum dites |
| Indeks tata kelola / stabilitas | World Bank WGI, indeks tahunan | Gratis, data tahunan (tidak real-time) | [umum] |
| Whale kripto (transaksi besar di bursa) | Binance WebSocket `aggTrade` disaring ambang nilai | Gratis | [umum], belum dites |
| Whale kripto (transfer on-chain) | Etherscan (kunci gratis; sumber berbeda menyebut 3 sampai 5 panggilan per detik, **cek**), mempool.space untuk BTC, DeFiLlama untuk stablecoin | Gratis dengan batas | [web] sebagian |
| Whale Alert | Tidak ada API gratis; paket Alerts (WebSocket) sekitar USD 29,95 per bulan, hanya penggunaan pribadi | Berbayar | [web] |
| Smart money saham AS | SEC EDGAR: Form 4 (insider, tertunda beberapa hari), 13F (kuartalan, tertunda sampai 45 hari), 13D dan 13G | Gratis; wajib header User-Agent; CORS kemungkinan tidak ada, pakai proxy | [umum] |
| Smart money saham IDX | Net buy atau sell asing harian, kepemilikan di atas 5% (data BEI, KSEI, OJK) | Tidak ada API resmi gratis yang saya ketahui | belum dicek |
| Arus opsi tidak biasa, dark pool | Hanya layanan berbayar | Berbayar | [umum] |
| Profil tokoh publik | Wikidata (SPARQL), Wikipedia API, dokumen SEC (proxy statement DEF 14A) untuk eksekutif dan dewan | Gratis; Wikipedia/Wikidata wajib atribusi | [umum] |
| Fundamental perusahaan nyata | Finnhub metrik dasar (gratis), Financial Modeling Prep, EDGAR XBRL untuk AS | Bervariasi | [umum], batas belum dicek |

**Konsekuensi arsitektur:** karena kunci API tidak boleh ada di kode browser, dan banyak sumber tanpa CORS, v2 **butuh backend kecil** (proxy dan cache).

---

## 6. Arsitektur target v2

```
Browser (Vite + TypeScript, desain v1)            Cloudflare Worker (Hono) = proxy + cache
┌──────────────────────────────┐                  ┌─────────────────────────────────────┐
│ Peta berlapis | Grafik | Daftar│  fetch/WS  ───▶ │ /api/quotes   /api/macro/:iso3       │
│ Command bar | Berita | Whale   │                  │ /api/news     /api/whales            │
│ Profil tokoh | Kas | Kesehatan │ ◀─── JSON ────   │ /api/people   /api/filings           │
└──────────────┬───────────────┘                  │ KV cache (TTL) | Cron prefetch       │
               │ langsung (tanpa kunci)           │ rahasia di env (wrangler secret)     │
               ▼                                   └──────────┬──────────────────────────┘
        Binance WebSocket                                      ▼
                                                     Finnhub | World Bank | GDELT | SEC | Etherscan | RSS
```
- **Provider abstraction:** setiap sumber data mengimplementasikan antarmuka yang sama dan setiap angka membawa `{ value, asOf, source, quality }` dengan `quality` salah satu dari `live | delayed | eod | stale | sim`. UI selalu menampilkan kualitas ini.
- **Rantai fallback:** sumber utama gagal, coba cadangan, lalu tampilkan "tidak tersedia". Jangan pernah diam-diam jatuh ke data palsu.
- **Hosting:** Cloudflare Pages dan Workers (gratis untuk skala ini). Supabase hanya jika butuh akun pengguna atau database.
- **Rahasia:** tidak ada kunci API di repo atau di kode frontend.

---

## 7. Roadmap bertahap

Perkiraan waktu adalah tebakan kasar saya untuk pemula yang mengerjakan dengan AI dan sering mengetes; bisa meleset jauh.

| Fase | Isi | Hasil yang bisa dibuktikan | Perkiraan |
|---|---|---|---|
| 0 | v1 HTML dengan data simulasi | **Selesai** | selesai |
| 1 | Fondasi data nyata: Worker proxy, provider abstraction, lencana kualitas data, harga AS (Finnhub), kripto (Binance) | Harga AAPL dan BTC di app sama dengan sumber lain dalam batas wajar; saat sumber diputus, UI jujur | 1 sampai 2 minggu |
| 2 | Peta berlapis (Pasar, Ekonomi, Risiko, Berita, Whale) + makro World Bank + command bar | Klik negara membuka panel dengan PDB, inflasi, pengangguran asli dan sumbernya | 1 sampai 2 minggu |
| 3 | Berita dan politik: umpan berita per negara dan per saham, sinyal GDELT, kalender peristiwa, skor risiko eksperimental yang transparan | Judul berita muncul dengan sumber, waktu, tautan; metodologi skor terbuka | 1 sampai 2 minggu |
| 4 | Whale dan smart money: (4a) kripto real-time, (4b) SEC Form 4 dan 13F dengan lencana "tertunda" | Transaksi besar muncul di peta dan daftar, cocok dengan penjelajah blockchain | 1 sampai 2 minggu |
| 5 | Profil tokoh dan entitas, graf relasi (perusahaan, eksekutif, pemegang saham) dengan kutipan sumber | Profil satu CEO lengkap dengan sumber tiap fakta | 1 sampai 2 minggu |
| 6 | Fundamental nyata menggantikan sintetis, screening, alert, simpan watchlist, uji end-to-end, deploy | Skor Piotroski satu perusahaan AS cocok dengan hitungan manual dari laporannya | 1 sampai 2 minggu |

### Urutan paling berdampak kalau waktu sangat terbatas
**Fase 1, lalu 4a (whale kripto), lalu 2 (peta makro).** Ketiganya paling mungkin berjalan dengan data gratis yang nyata, dan paling terlihat mengesankan. Fase 3 dan 5 paling berisiko (hukum, kualitas data, subjektivitas).

### Kriteria selesai umum untuk setiap fase
1. Berjalan di Chrome dan Edge terbaru tanpa error di konsol.
2. Setiap data yang tampil punya sumber, waktu, dan label kualitas.
3. Ada tes otomatis untuk logika berisiko (skor, konversi, parsing).
4. Dokumen "terverifikasi vs belum diuji" diperbarui.
5. Pemilik bisa menjelaskan cara kerja bagian itu dengan kata-katanya sendiri.

---

## 8. Risiko dan hal hukum

- **Ketentuan layanan penyedia data:** banyak paket gratis hanya untuk penggunaan pribadi dan melarang redistribusi atau penggunaan komersial. Kalau proyek ini dipublikasikan untuk umum atau dijadikan produk, baca ulang syaratnya.
- **Endpoint tidak resmi (mis. Yahoo):** bisa berhenti kapan saja dan abu-abu secara ketentuan layanan. Label sebagai tidak resmi; jangan jadi satu-satunya sumber.
- **Hak cipta berita:** tampilkan judul, sumber, waktu, dan tautan saja, bukan isi artikel.
- **Data tokoh:** hanya peran publik dari sumber publik, dengan sitasi. Tidak ada data pribadi. Atribusi untuk Wikipedia dan Wikidata.
- **Bukan nasihat investasi:** setiap halaman yang menyebut "kandidat", "sehat", atau "smart money" harus memuat penafian yang jelas. Skor fundamental bukan prediksi harga.
- **Klaim:** jangan menyebut proyek ini "seperti Bloomberg" di wawancara atau lomba. Bilang apa yang sungguh dibuat dan jelaskan sumber datanya.

---

## 9. Pertanyaan terbuka untuk pemilik

1. Bursa mana yang paling penting punya data nyata: AS, Indonesia, atau kripto? (Menentukan sumber di Fase 1.)
2. Boleh memakai endpoint tidak resmi untuk saham IDX dengan label "tidak resmi", atau harus data resmi saja?
3. Mau dipublikasikan (tautan publik) atau hanya dipakai sendiri dan untuk portofolio? (Menentukan soal ketentuan layanan dan hosting.)
4. Sanggup membuat akun gratis di Cloudflare dan Finnhub? (Dibutuhkan mulai Fase 1.)
5. Berapa jam per minggu bisa dialokasikan sampai tenggat? (Menentukan fase mana yang realistis.)

---

## 10. Cara memakai file-file ini

1. Mulai sesi AI baru, lampirkan `QUANTTERMINAL_CONTEXT.md` dan `quantterminal-source.zip`.
2. Tempel **MASTER PROMPT** dari `QUANTTERMINAL_PROMPT.md`, lalu tempel **prompt fase** yang mau dikerjakan.
3. Kerjakan satu fase sampai tes lolos sebelum lanjut. Jangan meminta semuanya sekaligus.
4. Setelah tiap fase, perbarui bagian 3 (status) dan bagian 7 (roadmap) file ini.
