# QuantTerminal v2

Terminal intelijen pasar global: **globe 3D**, **kondisi ekonomi semua negara**, **berita dan spekulasi per negara**, **pergerakan kapal (AIS)**, makro AS, kripto, dan pasar saham. Semua dari sumber data **gratis**, dengan label kualitas di setiap angka. Bukan nasihat investasi.

> Aturan utama proyek ini: **tidak ada data karangan**. Kalau sumber tidak bisa diakses, aplikasi menulis "Tidak tersedia" dan alasannya. Harga simulasi v1 hanya muncul di **mode demo** (bawaan mati) dan selalu berlabel "sim".

## Cara menjalankan (Windows, pemula)

Ada dua cara. Cara A paling mudah, cara B membuka semua fitur.

### A. Tanpa server (double-click)
1. Buka `dist/quant-terminal.html` di Chrome atau Edge (double-click, atau Live Server di VS Code).
2. Yang jalan: harga kripto (Binance/CoinGecko), ekonomi semua negara (World Bank, IMF bila browser diizinkan), gempa (USGS), kurs, kapal Laut Baltik (Digitraffic), berita GDELT (bila tidak diblokir browser).
3. Yang **tidak** jalan tanpa server: saham, indeks, FRED (makro AS), bank sentral (BIS), kapal global (AISStream).

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
| Sumber data | Status, latensi, jumlah permintaan, cache, error, batas setiap penyedia; kesehatan data | – | – |

Palet perintah: tekan **Ctrl+K**. Contoh: `AAPL`, `AAPL FA`, `BTC`, `INDONESIA`, `ID NEWS`, `COMPARE ID US CN`, `OIL`, `US10Y`, `SHIP HORMUZ`, `N RUPIAH`, `Jensen Huang`, `HELP`.

Klik angka bergaris bawah titik untuk melihat **asal-usul data**: sumber, endpoint, periode, waktu diambil, rumus.

## Struktur kode

```
src/template.html        kerangka halaman (semua halaman ada di sini)
src/style.css            desain "ruang peta laut" v1 + komponen terminal v2
src/js/01-core.js        util, daftar bursa/saham, State (v1)
src/js/01b-data.js       LAPISAN DATA: registri penyedia, server/langsung, cache, label kualitas, asal-usul
src/js/02-sim.js         jam bursa + simulasi (simulasi hanya di mode demo)
src/js/03-health.js      Piotroski + Altman (v1, fundamental sintetis, hanya mode demo)
src/js/04-map.js         peta 2D canvas (v1)
src/js/04b-globe.js      GLOBE 3D (d3-geo ortografis di canvas) + semua lapisan
src/js/05-chart.js       grafik TradingView Lightweight Charts (v1, kini dari riwayat nyata)
src/js/05b-prices.js     harga nyata: Binance -> CoinGecko, Finnhub, FRED, Yahoo opsional
src/js/06a-country.js    intelijen negara + berita & spekulasi + perbandingan
src/js/06b-news.js       terminal berita + rantai dampak
src/js/06c-ships.js      kapal AIS + chokepoint
src/js/06d-intel.js      halaman Intel 3D
src/js/06e-macro.js      makro, obligasi, komoditas, bank sentral, korelasi, rezim, analog, uji tekanan
src/js/06f-sources.js    pusat sumber data
src/js/06g-palette.js    palet perintah Ctrl+K + profil tokoh (Wikipedia)
src/js/07-cash.js        kas dan alokasi (v1)
src/js/07b-asset.js      panel intelijen aset: kenapa bergerak, smart money proksi, fundamental, insider, earnings, order book
src/js/08-app.js         penghubung semua modul
shared/parsers.mjs       parser respons API (dipakai browser DAN server, diuji)
shared/analytics.mjs     tema berita, spekulasi, skor dampak, skor negara, risiko, korelasi, rezim, uji tekanan (diuji)
server/server.mjs        server Node tanpa library: proxy, cache, rate limit, CORS, CSP
server/lib/core.mjs      .env, cache memori+disk, antrean, ember token
server/lib/ais.mjs       pengumpul AIS (AISStream WebSocket + Digitraffic)
build.mjs                menggabungkan semuanya jadi dist/quant-terminal.html
test/                    unit test (npm test) + fixture berformat API asli
qa/                      tes browser end-to-end (npm run e2e) dengan sumber palsu berlabel [UJI]
docs/                    konteks proyek dan prompt
```

## Tes

```
npm run doctor       # cek Node, versi paket, font, browser E2E
npm test             # unit test parser, kalkulasi, pemindai rahasia
npm run e2e:install  # SEKALI saja: unduh Chromium yang cocok untuk tes E2E
npm run e2e          # build + skenario browser (atau set CHROME_PATH ke chrome.exe/msedge.exe)
npm run e2e -- B4    # hanya skenario yang namanya mengandung "B4"
npm run secrets      # cari API key bocor di file terlacak, dist, dan seluruh riwayat git
```

Skenario E2E ada di `qa/scenarios/*.mjs`. Setiap skenario otomatis GAGAL bila ada exception tak tertangkap, promise rejection tak ditangani, console.error (selain kegagalan jaringan yang disengaja), atau indikator loading yang macet lebih dari 20 detik. Screenshot ada di `qa/out/`.

Font disimpan di `vendor/fonts` (lisensi OFL, file lisensinya ikut), jadi build tidak bergantung pada struktur paket font di node_modules.

Tes e2e memakai **sumber palsu** (`qa/fake-upstream.mjs`) yang meniru format API asli, karena lingkungan pengembangan tidak punya internet. Itu menguji alur aplikasi, **bukan** membuktikan API sungguhan merespons. Cara memverifikasi dengan internet sungguhan ada di `docs/QUANTTERMINAL_CONTEXT.md` bagian 3.

## Lisensi data dan atribusi

Peta: Natural Earth (domain publik). Globe: d3-geo (ISC). Metadata negara: world-countries (ODbL), i18n-iso-countries (MIT). Grafik: TradingView Lightweight Charts (Apache-2.0). Kurs: "Rates By Exchange Rate API". Data kapal Baltik © Fintraffic / digitraffic.fi, CC BY 4.0. Profil tokoh: Wikipedia (CC BY-SA). Berita: GDELT Project (hanya judul, sumber, waktu, tautan). Banyak paket API gratis hanya untuk pemakaian pribadi; baca ketentuannya sebelum mempublikasikan aplikasi untuk umum.
