# QuantTerminal v2.1

Terminal intelijen pasar global: **globe 3D**, **kondisi ekonomi semua negara**, **berita dan spekulasi per negara**, **pergerakan kapal (AIS)**, makro AS, kripto, dan pasar saham. Semua dari sumber data **gratis**, dengan label kualitas di setiap angka. Bukan nasihat investasi.

> Aturan utama proyek ini: **tidak ada data karangan**. Kalau sumber tidak bisa diakses, aplikasi menulis "Tidak tersedia" dan alasannya. Harga simulasi v1 hanya muncul di **mode demo** (bawaan mati) dan selalu berlabel "sim".

## Cara menjalankan (Windows, pemula)

Ada dua cara. Cara A paling mudah, cara B membuka semua fitur.

### A. Tanpa server (double-click)
1. Buka `dist/quant-terminal.html` di Chrome atau Edge (double-click, atau Live Server di VS Code).
2. Yang jalan: harga kripto (Binance/CoinGecko), ekonomi semua negara (World Bank, IMF bila browser diizinkan), gempa (USGS), kurs, kapal Laut Baltik (Digitraffic), berita GDELT (bila tidak diblokir browser).
3. Yang **tidak** jalan tanpa server: saham, indeks, FRED (makro AS), bank sentral (BIS), kapal global (AISStream).
4. Kalau server lokal sedang jalan, **jangan** double-click file-nya: buka http://localhost:8787. Demi keamanan, server tidak melayani halaman `file://` (asal "null" bisa dipalsukan situs lain lewat iframe). Bisa diubah dengan `ALLOW_FILE_ORIGIN=1` di `.env` kalau kamu paham risikonya.

### B. Dengan server lokal (semua fitur)
1. Pasang **Node.js 22 atau lebih baru** dari https://nodejs.org (pilih LTS). Tidak perlu Python.
2. Buka folder proyek di VS Code, lalu buka Terminal (`Ctrl + ` `).
3. Jalankan:
   ```
   npm ci
   npm run build
   ```
   `npm ci` memasang versi persis dari `package-lock.json` (build jadi bisa diulang). Kalau ragu lingkunganmu sudah benar, jalankan `npm run doctor`.
4. Salin file `.env.example` menjadi `.env`. Isi kunci yang kamu punya (boleh dikosongkan dulu):
   - `AISSTREAM_API_KEY` : kapal live global, gratis di https://aisstream.io (login pakai GitHub)
   - `FINNHUB_API_KEY` : harga saham AS, fundamental, insider, earnings, gratis di https://finnhub.io/register
   - `FRED_API_KEY` : opsional. Tanpa kunci pun FRED tetap jalan lewat CSV publik.
5. Jalankan `npm start`, lalu buka **http://localhost:8787**.
6. Cek halaman **Sumber data**: setiap penyedia harus "Tersambung". Kalau "Gagal", pesan errornya ada di kolom terakhir.

File `.env` tidak boleh di-commit (sudah di `.gitignore`). Kunci hanya dibaca server dan tidak pernah dikirim ke browser.

## Fitur dan sumber datanya

| Halaman | Isi | Sumber | Kualitas |
|---|---|---|---|
| Pasar | Daftar 30 aset, grafik, peta 2D, **globe 3D**, jam bursa, panel intelijen aset | Binance, CoinGecko, Finnhub, FRED, Yahoo (tidak resmi, opsional) | Live / Harian / Tidak resmi |
| Intel 3D | Globe dengan lapisan ekonomi, pasar, berita, bencana, kapal, chokepoint, malam | IMF, World Bank, GDELT GEO, USGS, GDACS, AISStream, Digitraffic, PortWatch | campuran, tertulis di legenda |
| Negara | **Semua ±195 negara**: PDB, pertumbuhan, inflasi, pengangguran, utang, fiskal, transaksi berjalan, cadangan, perdagangan, energi, kurs, suku bunga, obligasi 10 tahun, skor negara, **berita dan spekulasi**, perbandingan | IMF WEO, World Bank WDI/WGI, ExchangeRate-API, BIS, FRED/OECD, GDELT | Historis / Proyeksi / Kalkulasi |
| Berita | Terminal berita global dengan kategori, tema, sentimen, skor dampak 0–100, rantai dampak | GDELT DOC 2.0 | Tertunda; analisis = heuristik |
| Kapal | Globe kapal live (posisi asli + jejak), tabel kapal, transit 12+ chokepoint dunia | AISStream, Digitraffic, IMF PortWatch | Live / Tertunda ±4 hari |
| Makro | Kurva yield AS, spread, durasi, CPI/NFP/dll, komoditas, bank sentral, korelasi, **rezim risk on/off**, **analog historis**, uji tekanan | FRED, BIS | Harian / Kalkulasi |
| Kas | Modul kas dan alokasi v1 (tetap) | input kamu | Simulasi berasumsi |
| Sumber data | Status, latensi, jumlah permintaan, cache, error, batas setiap penyedia; kesehatan data; **log error internal** | – | – |
| Detail aset | Satu halaman untuk saham, ETF, indeks, kripto, valas, komoditas, suku bunga: harga + metadata data (sumber, waktu data, waktu ambil, kualitas, basi), tab Ringkasan/Grafik/Profil/Fundamental/Earnings/Insider/Order book/Berita, mode bandingkan (kinerja dinormalisasi) | Finnhub, Binance, CoinGecko, FRED, ExchangeRate-API/Frankfurter, Wikipedia, GDELT, Yahoo (opsional) | sesuai sumber, selalu tertulis |
| Watchlist | Banyak daftar: buat, ganti nama, hapus, tambah, urutkan; disimpan di browser; harga + umur data per baris; ekspor CSV | sama dengan detail aset | sesuai sumber |
| Alert | Harga, perubahan %, volume vs rata-rata (`ALERT AAPL VOLUME > AVG*2`); dicek tiap 30 detik dengan data nyata; notifikasi browser bila diizinkan | sama dengan detail aset | tidak memicu bila data tidak tersedia/basi |

**Bilah perintah** ada di header (tekan **Ctrl+K** atau **/**). Bentuknya `<KODE> <VERB>` atau perintah global, dengan saran otomatis dan riwayat (panah atas):

| Contoh | Hasil |
|---|---|
| `AAPL GP` · `AAPL FA` · `AAPL DES` · `AAPL NEWS` · `AAPL EST` · `AAPL INSIDER` · `AAPL DIV` · `AAPL TECH` | detail aset di tab yang sesuai |
| `AAPL COMPARE MSFT NVDA` · `COMPARE ID US CN` | bandingkan aset (kinerja dinormalisasi) atau negara |
| `ID ECON` · `US ECON` · `MA ECON` (Maroko, bukan Mastercard) | intelijen negara |
| `US10Y` · `EURUSD` · `GOLD` · `BTC GP` · `BTC DEPTH` | kuotasi/grafik/order book |
| `NVIDIA PEOPLE` · `PEOPLE Jensen Huang` | tokoh publik (Wikipedia) |
| `WATCH AAPL BTC` · `ALERT AAPL > 300` · `ALERT BTC CHG < -5` | watchlist dan alert |
| `HELP` · `HOME` · `CLEAR` · `RATES` · `CMDTY` · `SHIP HORMUZ` · `N RUPIAH` | bantuan, navigasi, berita teks bebas |

Parser perintahnya murni (`shared/commands.mjs`) dan setiap perintah punya tes di `test/commands.test.mjs`.

Klik angka bergaris bawah titik untuk melihat **asal-usul data**: sumber, endpoint, periode, waktu diambil, rumus.

## Struktur kode

```
src/template.html        kerangka halaman, header, bilah samping
src/pages/*.html         halaman tambahan (detail aset, watchlist, alert) yang digabung saat build
src/style.css            desain "ruang peta laut" v1 + komponen terminal v2
src/css/*.css            gaya tambahan (bilah samping, bilah perintah, panel, halaman baru)
src/js/01-core.js        util, daftar bursa/saham, State (v1)
src/js/01a-errors.js     log error internal (jaringan, penyedia, parser, tampilan, perintah, tak tertangkap)
src/js/01b-data.js       LAPISAN DATA: registri penyedia, server/langsung, cache, TTL, coba ulang + backoff, stale-while-revalidate, cache negatif, label kualitas, asal-usul
src/js/01c-datum.js      Datum: satu angka + {asOf, fetchedAt, sumber, kualitas, basi, mata uang}
src/js/02-sim.js         jam bursa + simulasi (simulasi hanya di mode demo)
src/js/03-health.js      Piotroski + Altman (v1, fundamental sintetis, hanya mode demo)
src/js/04-map.js         peta 2D canvas (v1)
src/js/04b-globe.js      GLOBE 3D (d3-geo ortografis di canvas) + semua lapisan
src/js/05-chart.js       grafik TradingView Lightweight Charts (v1, kini dari riwayat nyata)
src/js/05b-prices.js     harga nyata: Binance -> CoinGecko, Finnhub, FRED, Yahoo opsional; label "Basi" otomatis bila sumber berhenti
src/js/05c-quotes.js     kuotasi & riwayat untuk SEMUA jenis entitas (saham, ETF, valas, komoditas, suku bunga, kripto)
src/js/06a-country.js    intelijen negara + berita & spekulasi + perbandingan
src/js/06b-news.js       terminal berita + rantai dampak
src/js/06c-ships.js      kapal AIS + chokepoint
src/js/06d-intel.js      halaman Intel 3D
src/js/06e-macro.js      makro, obligasi, komoditas, bank sentral, korelasi, rezim, analog, uji tekanan
src/js/06f-sources.js    pusat sumber data
src/js/06g-palette.js    bilah perintah di header (autocomplete, riwayat) + profil tokoh (Wikipedia)
src/js/07-cash.js        kas dan alokasi (v1)
src/js/07b-asset.js      panel intelijen aset: kenapa bergerak, smart money proksi, fundamental, insider, earnings, order book
src/js/08-app.js         penghubung modul lama, bilah samping, status bursa/error di header
src/js/08b-terminal.js   registri entitas saat jalan + pelaksana perintah
src/js/08c-watchlists.js watchlist (banyak daftar) + halamannya
src/js/08d-alerts.js     alert + halamannya
src/js/08e-panels.js     panel ruang kerja (perkecil/perbesar/tutup), HELP, aksesibilitas keyboard
src/js/09a-prochart.js   grafik yang bisa dipakai ulang (9 timeframe, candle/garis/area, volume, zoom)
src/js/09b-security.js   halaman detail aset + registri tab
src/js/99-start.js       mendaftarkan halaman baru lalu menjalankan aplikasi
shared/parsers.mjs       parser respons API (dipakai browser DAN server, diuji)
shared/analytics.mjs     tema berita, spekulasi, skor dampak, skor negara, risiko, korelasi, rezim, uji tekanan (diuji)
shared/entities.mjs      registri entitas + mesin pencarian (diuji)
shared/entity-seed.mjs   katalog referensi: kode, nama, pemetaan sumber; TANPA angka pasar (diuji)
shared/commands.mjs      parser perintah + autocomplete (diuji)
shared/csv.mjs           ekspor CSV aman dari injeksi rumus spreadsheet (diuji)
server/server.mjs        server Node tanpa library: proxy, cache, rate limit, backoff per host, CORS, CSP berbasis hash, cek Host
server/lib/core.mjs      .env, cache memori+disk, antrean, ember token
server/lib/ais.mjs       pengumpul AIS (AISStream WebSocket + Digitraffic)
build.mjs                menggabungkan semuanya jadi dist/quant-terminal.html
test/                    unit test (npm test) + fixture berformat API asli
qa/                      tes browser end-to-end (npm run e2e) dengan sumber palsu berlabel [UJI]
docs/                    konteks proyek, prompt, EXTENDING.md (cara menambah fitur tanpa bentrok), SECURITY.md (audit keamanan)
server/routes/*.mjs      rute server tambahan per fitur (dimuat otomatis)
```

## Tes

```
npm run doctor       # cek Node, versi paket, font, browser E2E
npm test             # unit test parser, kalkulasi, pemindai rahasia
npm run e2e:install  # SEKALI saja: unduh Chromium yang cocok untuk tes E2E
npm run e2e          # build + skenario browser (atau set CHROME_PATH ke chrome.exe/msedge.exe)
npm run e2e -- B4    # hanya skenario yang namanya mengandung "B4"
npm run secrets      # cari API key bocor di file terlacak, dist, dan seluruh riwayat git
npm run a11y         # cek aksesibilitas otomatis (axe-core, WCAG A/AA) di semua halaman
```

Skenario E2E ada di `qa/scenarios/*.mjs`. Setiap skenario otomatis GAGAL bila ada exception tak tertangkap, promise rejection tak ditangani, console.error (selain kegagalan jaringan yang disengaja), atau indikator loading yang macet lebih dari 20 detik. Screenshot ada di `qa/out/`.

Font disimpan di `vendor/fonts` (lisensi OFL, file lisensinya ikut), jadi build tidak bergantung pada struktur paket font di node_modules.

Tes e2e memakai **sumber palsu** (`qa/fake-upstream.mjs`) yang meniru format API asli, karena lingkungan pengembangan tidak punya internet. Itu menguji alur aplikasi, **bukan** membuktikan API sungguhan merespons. Cara memverifikasi dengan internet sungguhan ada di `docs/QUANTTERMINAL_CONTEXT.md` bagian 3.

## Lisensi data dan atribusi

Peta: Natural Earth (domain publik). Globe: d3-geo (ISC). Metadata negara: world-countries (ODbL), i18n-iso-countries (MIT). Grafik: TradingView Lightweight Charts (Apache-2.0). Kurs: "Rates By Exchange Rate API". Data kapal Baltik © Fintraffic / digitraffic.fi, CC BY 4.0. Profil tokoh: Wikipedia (CC BY-SA). Berita: GDELT Project (hanya judul, sumber, waktu, tautan). Banyak paket API gratis hanya untuk pemakaian pribadi; baca ketentuannya sebelum mempublikasikan aplikasi untuk umum.
