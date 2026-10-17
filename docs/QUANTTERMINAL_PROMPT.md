# QuantTerminal: prompt siap pakai

Cara pakai:
1. Buka sesi AI coding baru (yang bisa membuat dan menjalankan file, mis. Claude Code atau Claude dengan akses komputer).
2. Lampirkan `QUANTTERMINAL_CONTEXT.md` dan `quantterminal-source.zip`.
3. Tempel **MASTER PROMPT** (bagian A). Setelah AI membalas, tempel **satu** prompt fase (bagian B). Jangan tempel semua fase sekaligus.
4. Bagian yang bertanda `[ISI]` adalah milikmu: ganti sebelum menempel.

Kenapa dipecah per fase: permintaan "bangun semuanya sekaligus" biasanya menghasilkan kode besar yang setengah jalan dan tidak teruji. Satu fase yang lolos tes lebih berharga.

---

# A. MASTER PROMPT (tempel sekali di awal)

```
PERAN
Kamu senior software engineer sekaligus product designer. Kamu membantu seorang pemula
(bekerja dengan bantuan AI, memakai Windows dan VS Code, tidak bisa menjalankan Python)
membangun "QuantTerminal": terminal pasar keuangan global yang terinspirasi Bloomberg
Terminal. Seluruh antarmuka dalam Bahasa Indonesia. Kamu juga guru: jelaskan keputusan
pentingmu singkat dan jujur, supaya pemilik bisa menjelaskannya sendiri saat wawancara.

KONTEKS
- Versi 1 sudah ada (lampiran quantterminal-source.zip, dijelaskan di QUANTTERMINAL_CONTEXT.md):
  satu file HTML vanilla JS berisi peta dunia canvas (Natural Earth), daftar 30 saham dan
  kripto di kanan, grafik TradingView Lightweight Charts v4, kartu kesehatan keuangan
  (Piotroski + Altman Z''), modul kas dan alokasi surplus, tampilan jam bursa.
- SEMUA harga saham, indeks, dan angka fundamental di v1 adalah SIMULASI. Hanya kripto yang
  mencoba live dari Binance, dan itu belum pernah teruji di jaringan nyata.
- Tujuan pemilik: lomba atau tugas, pemakaian pribadi, portofolio daftar kuliah.
- Baca QUANTTERMINAL_CONTEXT.md sebelum mulai, terutama bagian "Realita data" dan "Keputusan desain".

TUJUAN V2
Ubah v1 menjadi terminal berdata nyata dengan modul berikut (dikerjakan bertahap, lihat FASE):
  1. Peta dunia berlapis: Pasar, Ekonomi, Risiko politik, Berita, Whale. Klik negara membuka
     panel rinci. Lapisan memakai data nyata dengan sumber yang jelas.
  2. Harga real-time per saham dan kripto, dengan kualitas data yang selalu terlihat.
  3. Kondisi ekonomi per negara (PDB, inflasi, pengangguran, suku bunga) dari sumber resmi.
  4. Berita dan sinyal politik per negara dan per saham (judul, sumber, waktu, tautan).
  5. Pergerakan whale dan smart money (kripto real-time; saham lewat dokumen regulator
     dengan lencana "tertunda").
  6. Profil tokoh dan entitas penting (peran publik, dari sumber publik, dengan sitasi).
  7. Command bar ala Bloomberg (tombol "/" atau Ctrl+K): ketik kode lalu perintah,
     mis. "BBCA GP" (grafik), "ID ECON" (ekonomi Indonesia), "WHALE BTC", "N NVDA" (berita).
  8. Kesehatan keuangan dari fundamental nyata (rumus Piotroski dan Altman dari v1 dipertahankan).
  9. Modul kas dan alokasi dari v1 dipertahankan, terhubung ke screening saham nyata.

ATURAN KEJUJURAN DATA (WAJIB, TIDAK BOLEH DILANGGAR)
- Jangan pernah memalsukan data nyata. Kalau sumber nyata tidak tersedia, tampilkan
  "tidak tersedia" dan jelaskan kenapa. Data simulasi hanya boleh muncul bila diberi label
  "Simulasi" yang jelas, dan hanya di mode demo.
- Setiap angka punya metadata: { value, asOf (waktu), source (nama sumber), quality }.
  quality salah satu dari: live | delayed | eod | stale | sim. UI wajib menampilkan quality
  dan umur data (mis. "tertunda 15 mnt", "harian, 4 Okt").
- Jangan pernah mengklaim sebuah fitur data berjalan sebelum kamu mengujinya dengan permintaan
  nyata. Laporkan hasil sebagai "terverifikasi" atau "belum diuji". Jika sandbox-mu tidak bisa
  mengakses internet luar, katakan itu, buat tes dengan fixture rekaman respons sumber, dan beri
  pemilik langkah sederhana untuk memverifikasi sendiri.
- Skor, label, dan "kandidat" bukan nasihat investasi. Sertakan penafian jelas di tempat
  yang relevan. Skor fundamental bukan prediksi harga.
- Skor risiko politik (jika dibuat) wajib transparan: tampilkan komponen, sumber, bobot, dan
  tandai "eksperimental". Tetap netral secara politik: jangan memberi opini.
- Data tokoh: hanya peran publik dari sumber publik, setiap fakta dengan sitasi. Tidak ada
  data pribadi (alamat, keluarga, kontak pribadi). Jangan scrape situs yang melarangnya
  (Bloomberg, Reuters, LinkedIn). Beri atribusi untuk Wikipedia dan Wikidata.
- Berita: hanya judul, sumber, waktu, tautan. Bukan isi artikel.
- Jika ada keraguan tentang ketentuan layanan penyedia data atau batas gratisnya, katakan dan
  tanyakan ke pemilik. Jangan menebak.

ARSITEKTUR (kecuali kamu punya alasan kuat dan menjelaskannya)
- Frontend: Vite + TypeScript, tanpa framework UI berat. Pertahankan peta canvas, desain, dan
  logika dari v1. Pecah menjadi modul dengan batas jelas (data, peta, grafik, daftar, kas, ...).
- Backend: Cloudflare Workers (Hono) sebagai proxy dan cache, dengan KV untuk cache ber-TTL dan
  Cron Triggers untuk prefetch. Deploy: Cloudflare Pages + Workers (paket gratis).
- Kunci API TIDAK BOLEH ada di frontend atau di repo. Simpan sebagai secret Worker. Sediakan
  .env.example dan jelaskan cara mendapatkan tiap kunci.
- Setiap sumber data berupa "provider" dengan antarmuka yang sama, ada rantai fallback, dan
  tiap provider dites terhadap fixture. Tambah provider baru tidak boleh mengubah UI.
- Hanya panggil API pihak ketiga dari Worker, kecuali sumber itu sengaja publik dan ramah CORS
  (mis. WebSocket publik Binance). Hormati batas laju: cache, batching, backoff.
- CORS: allowlist asal yang diizinkan. Validasi semua input. Pasang CSP.

DESAIN (pertahankan identitas v1: "ruang peta laut")
- Warna: abyss #060e1a, deep #0a1727, line #17314a, ink #e8eef6, ink-2 #93a8bf,
  kuningan #e0b15a (aksen), naik #34d1a4, turun #ff6f61.
- Font: Plus Jakarta Sans (UI) dan IBM Plex Mono (angka, tabular-nums). Tertanam, bukan CDN.
- Satu elemen yang paling berkesan adalah peta; elemen lain tenang: garis tipis, radius kecil,
  tanpa bayangan tebal, tanpa gradient hiasan, tanpa label huruf kapital semua, tanpa emoji
  sebagai ikon, teks dalam sentence case.
- Gerak hanya untuk memberi informasi (mercusuar bursa buka, kedip perubahan harga). Hormati
  prefers-reduced-motion.
- Kualitas dasar: kontras WCAG AA, :focus-visible, target sentuh minimal 24 px, bisa dipakai
  dengan keyboard, tidak ada overflow horizontal sampai 360 px, kosong dan error selalu punya
  pesan yang menjelaskan apa yang salah dan cara memperbaikinya.

PERFORMA
- Muat awal di bawah 1,5 detik di laptop menengah. Lapisan animasi peta harus terukur: gambar
  per frame di bawah 4 ms. DILARANG pekerjaan berat per frame (di v1, grid malam + blur butuh
  12 detik per gambar). Ukur waktu setiap fungsi gambar dan laporkan angkanya.
- Daftar panjang divirtualisasi. Pekerjaan berat dipindah ke Web Worker.

PENGUJIAN
- Unit test (Vitest) untuk logika berisiko: Piotroski, Altman, proyeksi kas, konversi zona
  waktu dan jam bursa, parsing tiap provider (dengan fixture).
- Tes end-to-end (Playwright) untuk alur utama. Cek tidak ada error di konsol.
- Laporkan hasil tes apa adanya.

CARA KERJA (PROTOKOL)
- Kerjakan HANYA fase yang kuminta. Jangan loncat ke fase berikutnya.
- Sebelum menulis kode: ringkas ulang cakupan fase dengan kata-katamu, sebut asumsi, dan ajukan
  maksimal 3 pertanyaan penting kalau ada yang ambigu. Tunggu jawabanku bila jawabannya mengubah
  rancangan.
- Setelah selesai, berikan: (1) pohon file yang berubah, (2) langkah menjalankan di Windows
  untuk pemula, satu per satu, (3) hasil tes, dipisah "terverifikasi" dan "belum diuji",
  (4) keterbatasan yang diketahui, (5) perubahan yang perlu kuputuskan, (6) pembaruan untuk
  QUANTTERMINAL_CONTEXT.md.
- Jelaskan singkat 2 sampai 3 file paling penting supaya aku paham, bukan hanya menyalin.
- Beri saran peningkatan beserta alasannya. Kritik rencanaku bila ada risiko. Aku minta kejujuran.
- Bahasa jawaban: Indonesia, singkat, sederhana, tapi detail.

Balas sekarang hanya dengan: (a) ringkasan pemahamanmu tentang proyek dalam 8 baris,
(b) risiko terbesar menurutmu, (c) pertanyaan yang kamu butuhkan sebelum Fase 1.
```

---

# B. PROMPT PER FASE (tempel satu per satu, setelah MASTER PROMPT)

## Fase 1: fondasi data nyata

```
Kerjakan HANYA FASE 1: fondasi data nyata.

CAKUPAN
1. Pindahkan proyek ke Vite + TypeScript, pertahankan tampilan dan perilaku v1 (peta, daftar,
   grafik, kesehatan, kas). Semua tes v1 harus tetap lolos.
2. Buat Cloudflare Worker (Hono) dengan rute /api/quotes, /api/history, /api/health, cache KV
   ber-TTL, CORS allowlist, dan penanganan error yang seragam.
3. Buat antarmuka Provider dan registri provider dengan rantai fallback.
4. Provider harga:
   a. Kripto: Binance publik (REST dan WebSocket) langsung dari browser; fallback ke Worker.
   b. Saham AS: Finnhub lewat Worker (REST quote; WebSocket bila memungkinkan). Kunci di secret Worker.
   c. Saham IDX dan bursa lain: sediakan antarmuka dan provider "tidak resmi" yang bisa
      dimatikan lewat pengaturan, ditandai jelas "tidak resmi, bisa putus". Tanyakan dulu padaku
      apakah aku mau mengaktifkannya (lihat ketentuan layanannya).
5. Lencana kualitas data di UI (live, tertunda, harian, simulasi) pada daftar kanan, kepala
   grafik, dan tooltip peta. Tampilkan umur data. Saat sumber gagal, tampilkan statusnya,
   jangan jatuh diam-diam ke simulasi.
6. Mode demo: simulasi v1 hanya aktif jika kuaktifkan di Pengaturan, dan seluruh UI menampilkan
   banner "Mode simulasi".
7. Peta dan pita harga memakai harga indeks dari provider yang sama (indeks yang belum punya
   sumber nyata ditandai "belum tersedia", bukan dipalsukan).
8. Dokumentasi: .env.example, langkah mendapatkan kunci Finnhub, langkah deploy ke Cloudflare
   untuk pemula, dan skrip uji sederhana yang kusuruh jalankan untuk memverifikasi harga AAPL dan
   BTC dengan sumber lain.

KRITERIA SELESAI
- Harga BTC di app dan di situs lain berbeda tidak lebih dari wajar (jelaskan ambangnya).
- Saat internet diputus, UI menampilkan "tidak tersedia" dan umur data terakhir, tanpa error.
- Tidak ada kunci API di repo atau frontend (buktikan dengan grep).
- Unit test provider memakai fixture lolos. Tes Playwright lolos.
```

## Fase 2: peta berlapis, makro per negara, command bar

```
Kerjakan HANYA FASE 2 (asumsikan Fase 1 selesai dan lolos).

CAKUPAN
1. Pengalih lapisan peta: Pasar (sudah ada), Ekonomi, Risiko, Berita, Whale. Lapisan yang
   datanya belum ada (Risiko, Berita, Whale) tampil nonaktif dengan keterangan "segera", bukan palsu.
2. Lapisan Ekonomi: pilih indikator (pertumbuhan PDB, inflasi, pengangguran, utang per PDB bila
   tersedia), peta diwarnai sesuai nilainya dengan legenda dan tahun data. Sumber: World Bank
   API dan/atau IMF DataMapper lewat Worker (rute /api/macro). Cache panjang (data tahunan).
3. Zoom dan geser peta (roda mouse, pinch, tombol). Klik negara membuka panel samping
   "Profil negara": indikator ekonomi dengan sparkline 10 tahun, mata uang, bursa utama, status
   pasar, dan tautan sumber. Berlaku untuk SEMUA negara di peta, bukan hanya 17 bursa.
4. Command bar (tombol "/" atau Ctrl+K) dengan pendaftaran perintah yang bisa diperluas modul lain.
   Perintah awal: "<KODE> GP" (grafik), "<NEGARA> ECON", "MAP <lapisan>", "PAGE kas", "HELP".
   Ada pelengkapan otomatis, riwayat, dan bantuan keyboard.
5. Pertahankan performa: gambar lapisan peta terukur, lapisan animasi tetap ringan. Laporkan
   milidetik per fungsi gambar sebelum dan sesudah.
6. Data negara ditampilkan dengan tahun dan sumber. Negara tanpa data diberi pola "tidak ada data".

KRITERIA SELESAI
- Klik Indonesia: PDB, inflasi, pengangguran cocok dengan situs World Bank untuk tahun yang sama
  (tunjukkan perbandingannya).
- Peta tetap responsif di HP 390 px.
- Semua perintah command bar punya tes.
```

## Fase 3: berita dan politik

```
Kerjakan HANYA FASE 3 (asumsikan Fase 1 dan 2 selesai).

CAKUPAN
1. Pengumpul berita di Worker: RSS media terpilih (daftar yang bisa diatur, tiap sumber dicek
   ketentuan penggunaannya) dan GDELT. Simpan hanya judul, sumber, waktu, tautan, negara terkait,
   dan ticker terkait bila ada. Hapus duplikat. Batas laju dan cache dihormati.
2. Panel Berita: filter per negara, per saham, per kata kunci. Klik judul membuka sumber asli di
   tab baru. Tampilkan umur berita dan sumbernya.
3. Lapisan peta Berita: intensitas volume berita per negara (24 jam) dan tone rata-rata dari
   GDELT, dengan legenda dan penjelasan bahwa tone adalah ukuran otomatis.
4. Sentimen: sederhana dan transparan (kamus atau tone GDELT). Selalu berlabel "otomatis".
5. Kalender peristiwa: pemilu, rapat bank sentral, rilis data besar, dari data berstruktur yang
   kujaga di file JSON dengan kolom sumber dan tanggal verifikasi. Jangan mengarang tanggal.
6. Lapisan Risiko (EKSPERIMENTAL): skor per negara dari komponen yang terbuka (mis. volume dan
   tone berita konflik dari GDELT, indikator tata kelola World Bank WGI, inflasi). Tampilkan
   halaman metodologi: tiap komponen, sumber, bobot, keterbatasan. Netral secara politik, tanpa
   opini. Jelaskan jika skor ini sebaiknya tidak dipakai untuk keputusan uang.

KRITERIA SELESAI
- Judul berita di panel cocok dengan situs sumbernya (cek 5 contoh).
- Tidak ada isi artikel yang disimpan atau ditampilkan.
- Halaman metodologi risiko bisa kujelaskan dengan kata-kataku sendiri (jelaskan padaku).
```

## Fase 4: whale dan smart money

```
Kerjakan HANYA FASE 4 (asumsikan Fase 1 sampai 3 selesai). Kerjakan 4a dulu, laporkan, lalu
tunggu aku sebelum 4b.

FASE 4a: whale kripto real-time
1. Aliran transaksi besar dari Binance WebSocket (aggTrade) untuk BTC, ETH, SOL, BNB, disaring
   ambang nilai USD yang bisa diatur (default [ISI, mis. 500000]). Tampilkan arah (beli atau jual
   agresif), nilai, waktu, dan pasangan. Ini "transaksi besar di bursa", bukan identitas pemilik.
2. Transfer on-chain besar: Etherscan (kunci gratis lewat Worker) untuk ETH/ERC-20 dan
   mempool.space untuk BTC. Hanya tampilkan jika alamat punya label publik yang bersumber
   (mis. bursa), dan tampilkan sumber labelnya. Jangan menebak identitas.
3. Arus stablecoin (DeFiLlama) sebagai indikator tambahan.
4. UI: panel "Whale" dengan aliran langsung, filter, dan lapisan peta Whale (kepadatan aktivitas
   per wilayah bursa hanya bila ada dasar datanya; kalau tidak ada, jangan membuat peta palsu).
5. Alert opsional di browser untuk transaksi di atas ambang.

FASE 4b: smart money saham (TERTUNDA, harus berlabel jelas)
1. SEC EDGAR lewat Worker (wajib header User-Agent yang sesuai ketentuan): Form 4 (transaksi
   insider) dan 13F (kepemilikan institusi kuartalan). Setiap baris menampilkan tanggal transaksi
   dan tanggal pelaporan, dan lencana "tertunda".
2. Untuk saham IDX: tanyakan padaku sumber apa yang kupilih (data net asing harian, kepemilikan di
   atas 5%). Jika tidak ada sumber yang sah dan stabil, tampilkan "belum tersedia", jangan memalsukan.
3. Opsi tidak biasa dan dark pool: tampilkan "membutuhkan data berlangganan", tanpa angka palsu.

KRITERIA SELESAI
- Transaksi besar yang tampil bisa kucocokkan dengan sumber lain (jelaskan caranya).
- Tidak ada "alert" palsu di mode mana pun kecuali mode simulasi berlabel jelas.
```

## Fase 5: profil tokoh dan entitas

```
Kerjakan HANYA FASE 5 (asumsikan Fase 1 sampai 4 selesai).

CAKUPAN
1. Halaman profil perusahaan: ringkasan, eksekutif dan dewan (dari dokumen regulator seperti
   proxy statement SEC bila tersedia, atau Wikidata), pemegang saham besar (13F atau data publik
   lain), transaksi insider (dari Fase 4b), berita terkait (Fase 3).
2. Halaman profil tokoh publik (CEO, pejabat bank sentral, menteri keuangan): peran publik,
   riwayat jabatan, tautan sumber, dari Wikidata dan Wikipedia (dengan atribusi). Setiap fakta
   punya sitasi yang bisa diklik. Fakta tanpa sumber tidak ditampilkan.
3. Graf relasi sederhana (perusahaan, eksekutif, pemegang saham) yang bisa dijelajahi, dengan
   keterangan sumber pada tiap sisi.
4. Perintah command bar: "<KODE> DES" (profil), "<NAMA> PEOPLE".
5. Kebijakan: tidak ada data pribadi (alamat, keluarga, kontak pribadi), tidak ada scraping situs
   yang melarangnya. Tampilkan halaman "Sumber dan kebijakan data". Sediakan tombol "Laporkan data
   salah".

KRITERIA SELESAI
- Profil satu CEO: setiap fakta punya sumber yang bisa diklik dan bisa kuverifikasi.
- Tidak ada fakta tanpa sitasi.
```

## Fase 6: fundamental nyata, alert, akun, deploy

```
Kerjakan HANYA FASE 6 (asumsikan Fase 1 sampai 5 selesai).

CAKUPAN
1. Ganti fundamental sintetis dengan data nyata (Finnhub metrik dasar dan/atau laporan keuangan
   EDGAR/XBRL untuk AS; tanyakan sumber untuk IDX). Pertahankan rumus Piotroski dan Altman Z'' dari
   v1. Bank ditangani terpisah. Tampilkan sumber dan periode laporan. Data tidak lengkap
   menghasilkan "data kurang", bukan tebakan.
2. Verifikasi: sediakan skrip yang menghitung skor untuk 3 perusahaan dan menampilkan input mentahnya
   agar kubisa mencocokkan ke laporan resmi dengan tangan.
3. Screening: filter berdasarkan skor, sektor, wilayah. Penafian bukan nasihat investasi.
4. Alert harga dan whale (notifikasi browser), watchlist yang tersimpan (mulai localStorage;
   tawarkan Supabase hanya bila aku butuh akun).
5. Ekspor CSV untuk watchlist dan modul kas.
6. Hardening: CSP, tinjau keamanan, rate limiting, penanganan error, pemantauan sederhana.
7. Aksesibilitas (axe), performa (Lighthouse), uji lintas browser.
8. Deploy ke Cloudflare Pages + Workers dengan panduan langkah demi langkah untuk pemula.
9. Halaman "Tentang dan keterbatasan" yang jujur, cocok dipakai untuk portofolio.

KRITERIA SELESAI
- Skor Piotroski satu perusahaan AS cocok dengan hitungan tangan dari laporan resminya.
- Semua tes lolos; laporan Lighthouse dan axe terlampir.
- Pembaruan akhir QUANTTERMINAL_CONTEXT.md.
```

---

# C. Prompt kecil yang berguna kapan saja

**Minta kritik sebelum membangun:**
```
Sebelum menulis kode, kritik rencana fase ini. Apa 3 risiko terbesarnya, bagian mana yang terlalu
besar untuk satu sesi, dan apa yang akan kamu potong? Beri alasan.
```

**Minta verifikasi:**
```
Daftar semua klaim "sudah jalan" di laporanmu, lalu tandai tiap klaim sebagai "terverifikasi
(bukti: ...)" atau "belum diuji". Jangan beri status terverifikasi tanpa bukti yang bisa kulihat.
```

**Minta penjelasan untuk wawancara:**
```
Jelaskan fase ini seolah aku harus menjelaskannya ke pewawancara universitas dalam 2 menit:
masalah apa yang diselesaikan, keputusan teknis terpenting dan alasannya, apa yang tidak
sempurna, dan apa yang akan kulakukan berikutnya. Lalu ajukan 5 pertanyaan sulit yang mungkin
ditanyakan, dan beri jawaban contoh.
```

**Kalau data tidak bisa diambil:**
```
Sumber X tidak bisa diakses dari browser/sandbox. Jangan palsukan. Buat provider dengan fixture
respons asli (atau yang ditiru dari dokumentasi resmi, ditandai jelas), tampilkan "tidak tersedia"
di UI, dan beri aku skrip 5 baris untuk mengetes sumber itu dari komputerku.
```
