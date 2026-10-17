# Daftar pekerjaan berikutnya (backlog)

Ditulis supaya sesi berikutnya (manusia atau AI) tidak perlu menebak. Pemilik proyek: tambahkan
keinginanmu di bagian "Permintaan pemilik" dengan kalimat yang jelas (halaman apa, apa yang mengganggu).

## Permintaan pemilik
- (kosong: tulis di sini)

## Butuh akses jaringan (sandbox cloud memblokir semua sumber data; pengaturan Network access di environment)
- Uji semua sumber data asli: SEC EDGAR, Binance spot/futures, CoinGecko, FRED, GDELT, World Bank, IMF,
  ExchangeRate-API, Frankfurter, BIS, USGS, GDACS, Digitraffic, Finnhub, Wikidata, Wikipedia, mempool.space.
  Bandingkan format respons asli dengan parser di `shared/` dan fixture di `test/fixtures/`.
- Verifikasi ID seri FRED survei Fed regional (`GACDFSA066MSFRBPHI`, `GACDINA066MNFRBNY`) dan properti Wikidata.
- Kolom "Perubahan %" Valas: ExchangeRate-API gratis hanya memberi kurs terakhir. Opsi jujur: kurs + perubahan
  dari satu sumber yang punya riwayat (kurs referensi ECB lewat Frankfurter). Format endpoint riwayatnya harus
  diverifikasi dulu; jangan mencampur kurs dari satu sumber dengan kurs kemarin dari sumber lain.

## Rapikan (kecil, tidak mendesak)
- Warna garis grafik SVG di JavaScript masih literal (`#34d1a4`, `#ff6f61`, dll.); bisa lewat token `--up`/`--down`.
- `src/js/06e-macro.js` memakai lebar `style` inline di dua input.
- `.tpill.dup` di `src/css/50-markets.css` memakai `var(--blue, #6fb1ff)` dan latar rgb literal.
