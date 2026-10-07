/* =====================================================================
   START: panel ruang kerja diberi kontrol, lalu aplikasi jalan. Halaman baru mendaftarkan
   dirinya sendiri di akhir filenya (App.registerPage), jadi file ini tidak perlu diubah.
   File ini sengaja terakhir (urutan nama file) supaya semua modul sudah terdefinisi.
   ===================================================================== */
Panels.init();
App.init();
if (Alerts.list().some(a => a.enabled && !a.triggeredAt)) Alerts.start();
