# Audit keamanan QuantTerminal (v2.1, 7 Oktober 2026)

Ruang lingkup: aplikasi satu file (`dist/quant-terminal.html`) dan server lokal opsional (`server/`). Ancaman yang dipertimbangkan: situs lain yang dibuka di browser yang sama, konten pihak ketiga (judul berita, profil, respons API) yang berisi HTML/rumus jahat, penyalahgunaan kuota API lewat server yang terbuka ke jaringan, dan kebocoran kunci API.

Status per butir di bawah: **Diterapkan** artinya ada di kode dan diuji (nama tesnya disebut); **Batas** artinya risiko sisa yang diketahui.

| Area | Yang diterapkan | Bukti / tes |
|---|---|---|
| Kunci API | Hanya dibaca server dari `.env` (tidak di-commit, ada di `.gitignore`). Browser hanya menerima "ada/tidak ada" kunci. URL berkunci disamarkan (`redact`) sebelum dikirim ke browser sebagai `sourceUrl`. | `npm run secrets` memindai file terlacak, `dist`, seluruh riwayat git, dan nilai `.env` di `dist`; `test/secrets.test.mjs`; tes server memeriksa `/api/providers` tidak memuat token. |
| CSP | `script-src 'self'` + hash SHA-256 tiap skrip tertanam (dihitung server dari HTML), tanpa `unsafe-inline`; `img-src 'self' data:`; `connect-src` hanya host data yang dipakai; `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`. | `test/security.test.mjs` (CSP tanpa unsafe-inline, ada hash, tanpa `https:` di img-src); semua skenario server berjalan di bawah CSP ini. |
| CORS | Hanya origin dalam daftar (`ALLOWED_ORIGINS`) atau localhost. Origin `null` (file:// dan iframe sandbox milik situs mana pun) **ditolak bawaan**; bisa dibuka dengan `ALLOW_FILE_ORIGIN=1` (ada peringatan di konsol). | `test/security.test.mjs` (null ditolak, localhost diterima, situs asing ditolak). |
| DNS rebinding | Header `Host` harus localhost, alamat IP, atau nama di `ALLOWED_HOSTS`; selain itu 421. | `test/security.test.mjs`. |
| Validasi input server | Setiap parameter dicek regex ketat; nilai yang memengaruhi kunci cache dibatasi ke daftar tetap (mis. `limit` klines, `days` PortWatch, `start` FRED dibulatkan ke awal bulan). Rute tidak dikenal 404, metode selain GET 405. URL rusak tidak menjatuhkan proses (400). | `test/security.test.mjs` (URL `http://[`, limit di luar daftar, simbol berisi `<x>`). |
| Batas laju | Per IP non-loopback (`RATE_LIMIT_PER_MIN`, bawaan 240/menit; evicts hanya ember kedaluwarsa). Per penyedia: antrean/ember token (GDELT 1 per 6 dtk dengan batas tunggu, Finnhub, CoinGecko, Binance, dll.). Backoff per host saat 429/418/403/451. Browser tidak memakai jalur langsung untuk mengakali batas laju server. | Kode `server/server.mjs` (`gates`, `BACKOFF_MS`), `server/lib/core.mjs` (`Gate`, `Bucket`, `IpLimiter`). |
| Cache disk | Kunci di-hash, batas 3000 file dan umur 8 hari, dibersihkan berkala. | `server/lib/core.mjs` (`Cache.prune`). |
| XSS | Semua teks dari luar lewat `esc()` sebelum masuk `innerHTML`; tautan lewat `safeUrl()` (hanya http/https). Data rekomendasi Finnhub dibentuk ulang jadi angka di server dan di-escape di browser. | Audit otomatis 8 dimensi (Fase 0); parser perintah diuji dengan masukan `<script>`. |
| Injeksi rumus CSV | Ekspor CSV memberi awalan `'` pada teks yang diawali `= + - @ tab CR`; angka asli tidak diubah. | `test/security.test.mjs` (CSV). |
| Parser perintah | Murni (tidak menjalankan kode), panjang dibatasi 200 karakter, hasilnya objek aksi yang dipetakan ke fungsi aplikasi; masukan tak dikenal hanya menghasilkan saran pencarian. | `test/commands.test.mjs` ("masukan aneh tidak membuat parser error"). |
| Tautan keluar | `target="_blank"` selalu dengan `rel="noopener noreferrer"` (termasuk logo atribusi grafik yang dibuat library). | Skenario D1–D3 memeriksa setiap halaman. |
| Data pribadi | Profil tokoh hanya peran publik dari sumber publik; tanpa alamat, nomor, email, keluarga, tanggal lahir. | Lihat modul tokoh (Prioritas 6) dan tesnya. |
| Penyimpanan browser | Watchlist, alert, pengaturan, cache data publik di `localStorage` perangkat ini saja; tidak ada kunci API atau data sensitif di sana. Log error hanya di memori. | – |

## Endpoint server

`/api/health`, `/api/providers`, `/api/worldbank`, `/api/imf`, `/api/gdelt/doc`, `/api/gdelt/geo`, `/api/fred`, `/api/portwatch/chokepoints`, `/api/ships`, `/api/ships/track`, `/api/hazards`, `/api/fx`, `/api/bis/policy`, `/api/crypto/markets`, `/api/crypto/binance24h`, `/api/crypto/klines`, `/api/crypto/depth`, `/api/crypto/ohlc`, `/api/finnhub`, `/api/quote`, `/api/yahoo/chart` (mati bawaan), `/api/wiki/summary`, `/api/wiki/search`, ditambah rute di `server/routes/*.mjs` (nama harus `/api/...`, tidak boleh menimpa rute yang ada). Semua hanya GET, jawaban JSON dengan format `{ ok, provider, source, sourceUrl, fetchedAt, cached, stale, quality, data }`.

## Risiko sisa (Batas)

- `style-src 'unsafe-inline'` masih ada karena warna/ukuran dinamis memakai atribut `style`. Risikonya lebih kecil daripada skrip, tetapi CSS injection tetap mungkin bila ada celah escape.
- Bila `HOST=0.0.0.0`, siapa pun di jaringan yang sama bisa memakai kuota API kamu (dibatasi per IP). Biarkan `127.0.0.1` kecuali kamu paham risikonya.
- Sumber "tidak resmi" (Yahoo) bisa berubah format atau diblokir; matikan bila tidak diperlukan.
- Audit ini otomatis + tinjauan kode; belum ada uji penetrasi manual.
