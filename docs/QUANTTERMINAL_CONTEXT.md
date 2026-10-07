# QuantTerminal: konteks proyek dan rencana

Terakhir diperbarui: 5 Oktober 2026 (setelah v2)
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

## 3a. Status terbaru: v2.1 (7 Oktober 2026)

Dikerjakan sesuai prompt "Bloomberg-like" pemilik, urut prioritas. **Fase 0 (perbaikan fondasi) selesai lebih dulu**, baru Prioritas 2.

### Fase 0: fondasi
- Build bisa diulang: font disimpan di `vendor/fonts` (OFL), versi paket dikunci persis, pencarian paket tahan perubahan `exports`, pesan error yang menyebut cara memperbaiki. `npm run doctor` memeriksa lingkungan.
- E2E andal: urutan pencarian browser jelas (CHROME_PATH → Chromium playwright-core → Chrome/Edge sistem), `npm run e2e:install`, skenario terpisah di `qa/scenarios`, gagal otomatis bila ada exception, unhandled rejection, console.error, loading macet >20 dtk, atau lebih dari satu halaman tampil bersamaan.
- Audit otomatis 8 dimensi (siklus hidup, race, DOM, error, kejujuran data, keamanan, jaringan, UI/aksesibilitas) menemukan ±100 masalah; semuanya diperbaiki lalu diverifikasi ulang (78 diverifikasi silang: 70 sudah beres, 8 sisanya diperbaiki kemudian). Contoh penting: harga tetap berlabel "Live" setelah sumber berhenti (kini otomatis "Basi"), tick masuk ke grafik aset lain, URL hash rusak menjatuhkan aplikasi, server mati karena satu permintaan rusak, CORS `null` terbuka untuk situs lain, CSP `unsafe-inline`, cache disk tanpa batas, backoff Binance memblokir cermin, salinan lama diberi label segar, FRED bulanan ditulis "Harian".
- Audit "klik semua tombol" (D1–D4) di 3 mode jaringan: tanpa error, tanpa teks NaN/undefined, tanpa lencana Simulasi saat Mode Demo mati.
- Pemindai rahasia (`npm run secrets`): file terlacak, dist, dan seluruh riwayat git.

### Prioritas 2: sistem terminal
- Registri entitas (`shared/entities.mjs`) + katalog referensi (`shared/entity-seed.mjs`, ±150 aset + semua negara + topik + bank sentral + chokepoint, tanpa angka pasar). Pencarian membedakan saham/ETF/indeks/kripto/valas/komoditas/suku bunga/negara/topik/bank sentral.
- Parser perintah (`shared/commands.mjs`) + autocomplete; semua perintah di prompt punya tes.
- Tata letak: header (bilah perintah, status bursa, status server/data, error, jam, pengaturan) + bilah samping + panel yang bisa diperkecil/diperbesar/ditutup (status tersimpan).
- Halaman detail aset terpadu dengan registri tab; Datum (`{value, asOf, fetchedAt, source, quality, stale, currency}`) dan umur data selalu tampil.
- Watchlist banyak daftar, alert (harga/perubahan/volume vs rata-rata) dengan data nyata.
- Lapisan data: coba ulang + backoff eksponensial, stale-while-revalidate, cache negatif, tidak mengakali rate limit server lewat jalur langsung, log error internal.

### Prioritas 3–7 (selesai di v2.1)
- **Grafik + teknikal** (`shared/indicators.mjs`, `10a-studies.js`): SMA20/50, EMA20, Bollinger(20,2), VWAP, RSI14, MACD(12,26,9), ATR14, rata-rata volume; pita indikator di bawah grafik; bandingkan ≤ 4 aset (awal = 100); tab TECH. Data kurang/hanya-penutupan (FRED) ditulis alasannya, tidak digambar.
- **Fundamental SEC EDGAR** (`server/routes/sec.mjs`, `shared/fundamentals.mjs`, `11a`): 12 sub-tab, Piotroski 9 kriteria dan Altman Z''/Z dengan "Lihat perhitungan"; kriteria yang inputnya tidak dilaporkan = "Data kurang", skor tidak dinormalisasi; Altman tidak berlaku untuk SIC 6000–6999. Butuh `SEC_USER_AGENT` di `.env`. Saham non-AS: dijelaskan tidak tersedia dari sumber resmi gratis.
- **Screener** (`shared/screener.mjs`, `11b`): SEC frames untuk semua pelapor bertiker; 7 preset; VALUE/MOMENTUM hanya untuk aset katalog yang punya harga (cakupan ditulis). Maksimal 200 baris tampil, sisanya di CSV (ditulis).
- **Berita + pasar** (`shared/newsrank.mjs`, `06b`, `12a`): `N <teks>` = kueri GDELT baru; Breaking/Terbaru/Paling relevan; saringan tema/negara/domain/spekulatif; judul serupa digabung (yang paling awal tampil, sumber lain didaftar). Halaman Suku bunga (kurva, BIS, OECD 10Y; perubahan dalam bp), Valas (kurs referensi harian, bukan Live), Komoditas. Makro: survei Fed regional (Philadelphia, Empire State) berlabel **bukan PMI**; breadth Belum tersedia; rezim/analog Eksperimental.
- **Kripto + heatmap** (`server/routes/crypto-x.mjs`, `shared/cryptox.mjs`, `13a`, `13b`): Transaksi (aggTrades, transaksi besar dengan ambang, sisi taker), Derivatif (funding, OI Binance USD-M), On-chain BTC (mempool.space; koin lain Belum tersedia). Heatmap squarified: ukuran = kapitalisasi nyata, aset tanpa kapitalisasi didaftar terpisah; maks 30 saham per peta (kuota Finnhub). **Tidak ada lapisan "whale" di globe**: tidak ada dasar data lokasi pemilik dompet.
- **Tokoh + negara** (`server/routes/wikidata.mjs`, `shared/wikidata.mjs`, `14a`, `14b`): fakta Wikidata dengan item + properti + kualifier; ALLOW/BLOCK data pribadi diuji. Tab Pasar di halaman Negara.
- **Portofolio** (`shared/portfolio.mjs`, `15a`): kurs nyata (USDT lewat tether CoinGecko), tidak pernah 1:1; risiko hanya bila ≥ 60 imbal hasil harian selaras; metodologi tertulis.

### Batas yang sengaja tidak dikerjakan (tidak ada sumber gratis/legal yang andal)
ISM/S&P Global PMI, breadth pasar, konsensus ekonom, kepemilikan 13F per perusahaan, likuidasi kripto, aliran dana on-chain/label dompet, fundamental resmi non-AS (IDX dsb.), kapitalisasi pasar saham non-AS (Finnhub gratis hanya AS), peringkat kredit negara.

### Tetap belum terverifikasi
Sama seperti v2: tidak ada API sungguhan yang bisa diakses dari sandbox; semua tes memakai sumber palsu berformat asli. Lihat bagian 3 di bawah.

## 3. Status v2 (5 Oktober 2026)

**Bentuk:** tetap satu file HTML (`dist/quant-terminal.html`, ±1,4 MB, bisa double-click) **ditambah** server Node opsional tanpa library (`npm start`) untuk sumber yang butuh kunci atau menolak akses langsung dari browser. Build sekarang pakai Node (`build.mjs`), **tidak perlu Python lagi**.

### Yang ditambahkan di v2
| Bagian | Keterangan |
|---|---|
| Lapisan data | Registri penyedia (status, latensi, permintaan, cache, error, cadangan). Setiap hasil membawa sumber, waktu, kualitas (`live, delayed, eod, historical, projection, calculated, proxy, inference, sim, stale, unofficial, unavailable`). Data lama dipakai hanya dengan label "Basi". Klik angka = asal-usul (lineage). |
| Server lokal | `server/server.mjs`: proxy + cache memori/disk + rate limit per penyedia (GDELT 1/6 dtk, Finnhub ember token) + CORS allowlist + CSP + validasi input + kunci di `.env`. |
| Globe 3D | d3-geo ortografis di canvas (tanpa WebGL). Seret, zoom sampai level selat (garis pantai 1:50m saat dekat), malam dari posisi matahari, lapisan ekonomi/pasar/berita/bencana/kapal/chokepoint. Juga tersedia di halaman Pasar (tombol "Globe 3D"). |
| Kapal | AISStream (global, kunci gratis, lewat server) + Digitraffic (Baltik, tanpa kunci). Posisi asli + jejak asli; animasi hanya di antara dua posisi yang dilaporkan. Transit 12+ chokepoint dari IMF PortWatch. Tanpa data: "Data AIS live tidak tersedia". |
| Negara | Semua ±195 negara: IMF WEO (pertumbuhan, inflasi, pengangguran, utang, fiskal, transaksi berjalan, PDB) dengan fallback World Bank; WDI (cadangan, perdagangan, energi, struktur ekonomi), WGI (stabilitas politik), kurs, suku bunga BIS, obligasi 10 tahun OECD/FRED. Skor negara eksperimental yang transparan. Perbandingan sampai 4 negara. |
| Berita | Terminal GDELT (12 kategori), tema, sentimen leksikon, skor dampak 0–100 dengan komponen, judul spekulatif, rantai dampak (inferensi). Per negara: isu utama, spekulasi media, tren nada 30 hari, media lokal. |
| Makro | FRED: kurva yield + durasi/konveksitas, CPI/PPI/NFP/dll, komoditas, korelasi lintas aset (1M–5Y), rezim risk on/off dengan bukti, analog historis sejak 1971; BIS bank sentral; uji tekanan portofolio (asumsi tertulis). |
| Aset | "Kenapa bergerak?" (bukti harga, volume, pasar, berita, rezim), proksi smart money, fundamental/insider/earnings Finnhub (saham AS), order book Binance (kripto). |
| Lainnya | Palet perintah Ctrl+K, profil tokoh publik (Wikipedia), pusat Sumber data + kesehatan data, ekspor CSV/JSON, mode demo eksplisit. |

### Keputusan penting di v2
- **Mode demo bawaan MATI.** Tanpa sumber nyata, saham/indeks tampil "n/a". Ini sesuai aturan "jangan memalsukan data". Simulasi v1 masih ada (Pengaturan → Mode demo), selalu berlabel "sim".
- **Skor kesehatan v1 (Piotroski/Altman sintetis) hanya tampil di mode demo**, begitu juga screening kandidat di halaman Kas.
- **Server Node, bukan Cloudflare Worker (dulu direncanakan).** Alasan: pemilik bisa menjalankan di laptop dengan satu perintah, tanpa akun cloud. Kode proxy sengaja tanpa library supaya mudah dipindah ke Worker nanti.
- **Yahoo tidak resmi tetap MATI bawaan** (`ENABLE_UNOFFICIAL_YAHOO=0`), sesuai catatan v1 bahwa pemilik harus memutuskan sendiri.

### Yang TERVERIFIKASI (di sandbox, 5 Oktober 2026)
- `npm test`: 25 unit test lolos (parser semua API terhadap fixture berformat asli + kalkulasi analitik yang dihitung tangan).
- `npm run e2e`: 18 skenario Chromium lolos tanpa error JavaScript: tanpa server, offline total (semua panel menulis "tidak tersedia"), dan dengan server; HP 390 px tanpa scroll horizontal, laptop 1366×768, tablet 1024.
- Server: validasi input (400), rute tidak ada (404), kunci kosong (503 dengan pesan jelas), error sumber diteruskan jujur (contoh: "Host not in allowlist").
- Performa (Chromium headless tanpa GPU): halaman termuat ±0,35 detik; globe ±16 ms per gambar (median), ±25 ms saat zoom dekat. Animasi dibatasi 30 fps.

### Yang BELUM terverifikasi (jangan diklaim jalan)
- **Tidak ada satu pun API sungguhan yang bisa diakses dari sandbox** (jaringan memblokir semua host data). Semua tes memakai sumber palsu berformat asli (`qa/fake-upstream.mjs`, judul berlabel "[UJI]"). Format diambil dari dokumentasi dan pengetahuan umum, **belum dicocokkan dengan respons asli hari ini**.
- CORS langsung dari browser untuk World Bank, IMF, GDELT, Digitraffic, PortWatch, CoinGecko: belum dites. Kalau ditolak, jalankan server.
- Kode BIS (`WS_CBPOL`, format CSV), indikator WGI `GOV_WGI_PV.EST`, permintaan multi-indikator World Bank (`source=2`), GDELT GEO 2.0, dan seri OECD `IRLTLT01xxM156N` per negara: format/ketersediaan belum dicek langsung.
- AISStream: kebijakan "tidak boleh dari browser" dari dokumentasi (via pencarian web); koneksi server dengan kunci asli belum dites. Cakupan di Hormuz/Laut Merah bergantung stasiun penerima sukarela, bisa sepi.
- Safari/Firefox, layar sentuh asli, pembaca layar.

### Cara memverifikasi sendiri (5 menit)
1. `npm start`, buka http://localhost:8787, lalu halaman **Sumber data**. Semua penyedia yang dipakai harus "Tersambung".
2. Bandingkan 3 angka dengan situs resminya: inflasi Indonesia (imf.org/external/datamapper), harga BTC (binance.com), US 10Y (fred.stlouisfed.org/series/DGS10). Klik angkanya di aplikasi untuk melihat endpoint dan waktunya.
3. Halaman Kapal: setelah 1–2 menit dengan kunci AISStream, kapal muncul di kotak pantau. Cocokkan satu MMSI di MarineTraffic (tautan ada di panel kapal).

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
| v2 | Fase 1–4a sebagian besar + globe 3D, kapal, negara, berita, makro, palet perintah (lihat bagian 3) | **Selesai, menunggu verifikasi dengan internet asli** | 5 Okt 2026 |
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

Pertanyaan v2 yang perlu dijawab:
- Aktifkan Yahoo tidak resmi untuk saham IDX dan indeks dunia? (risiko ketentuan layanan; bawaan mati)
- Butuh data kapal lebih lengkap dari AISStream gratis? (pilihan berbayar: Spire, MarineTraffic)
- Mau dipublikasikan? Kalau ya, server perlu dipindah ke Cloudflare Worker/Railway dan ketentuan tiap API dibaca ulang.

Pertanyaan v1 (masih berlaku):

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
