# Fixture uji (BUKAN data nyata)

File di folder ini meniru **bentuk** respons asli setiap API (nama field, tipe, struktur),
dipakai oleh `npm test` dan `npm run e2e` karena lingkungan pengembangan tidak bisa
mengakses internet. **Angkanya contoh, bukan data pasar sungguhan**, dan tidak pernah
ditanam ke `dist/quant-terminal.html`.

Kalau sebuah API mengubah formatnya, perbarui fixture dengan menyimpan respons asli
(mis. buka URL-nya di browser, simpan JSON-nya), lalu jalankan `npm test`.
