# MANAJEMEN UANG IHSAAN

Aplikasi keuangan pribadi berbasis frontend standalone. Tidak perlu server, akun, atau database eksternal. Semua data tersimpan di **LocalStorage** browser perangkat.

## Buka aplikasi

1. Buka folder `manajemen-uang-ihsaan`.
2. Klik dua kali `index.html` (Chrome, Edge, atau browser modern lain).
3. Masukkan PIN bawaan: **1234**.
4. Ganti PIN dari menu **Data & Pengaturan → Ganti PIN**.

> PIN bawaan juga dapat diubah dari variabel `defaultPin` di bagian paling atas `assets/js/core.js`. PIN yang sudah diganti lewat aplikasi disimpan di LocalStorage dan tidak berubah hanya karena kode diubah.

## Fitur

- Layar kunci PIN 4 digit dan tombol **Kunci Aplikasi**.
- Dashboard bento dengan **Jatah Aman Hari Ini**, saldo, pemasukan, pengeluaran, dan streak hemat.
- Batas mingguan dan bulanan dengan indikator hijau, amber, dan merah + alert over-budget.
- Catat uang masuk/keluar, kategori khusus mahasiswa, validasi ketat, dan format Rupiah otomatis.
- Quick-add preset satu ketuk (Bensin, Makan Kampus, Kopi/Jajan) yang bisa dikelola.
- Radar langganan dengan hitung mundur dan tombol **Bayar & Catat**.
- Grafik donat kategori dan grafik batang 7 hari (Chart.js lokal).
- Riwayat transaksi dengan pencarian, filter jenis/kategori/bulan, edit, dan hapus.
- Backup/restore `.json`, ekspor laporan `.csv`, dan reset data.
- Light/dark mode, mobile bottom navigation, PWA manifest, dan service worker offline.
- Semua aset (Tailwind build, Chart.js, Lucide, font) tersedia lokal. Tanpa CDN.

## Backup dan pindah perangkat

1. Buka **Data & Pengaturan**.
2. Pilih **Backup JSON**.
3. Kirim file `.json` ke perangkat lain.
4. Di perangkat tujuan, buka aplikasi, pilih **Restore JSON**, lalu pilih file tersebut.

File backup memuat data keuangan, pengaturan, preset, dan PIN. Simpan file di tempat pribadi.

## Memasang sebagai PWA

PWA memerlukan halaman yang dibuka melalui `http://`, `https://`, atau `localhost`. Membuka `index.html` langsung dari file tetap menjalankan seluruh fitur utama, tetapi browser tidak mengizinkan instalasi service worker/PWA dari protokol `file://`.

Jika ingin memasang ke home screen:

- Letakkan folder ini di hosting statis (GitHub Pages, Netlify, dll.), atau
- jalankan web server lokal, misalnya `npx serve .` atau `python -m http.server 8080`, lalu buka alamat yang ditampilkan.

Manifest, ikon, dan service worker sudah disiapkan.

## Struktur

```
index.html
manifest.json
sw.js
assets/
  css/app.css          # Tailwind build
  js/core.js           # konfigurasi, data, logika keuangan
  js/render-dashboard.js
  js/render-pages.js
  js/actions.js
  js/app.js            # PIN, tema, navigasi, inisialisasi
  vendor/              # Chart.js & Lucide lokal
  fonts/               # Plus Jakarta Sans & JetBrains Mono
icons/
src/input.css          # sumber CSS Tailwind
tailwind.config.js
```

## Pengembangan CSS

Tailwind sudah dikompilasi ke `assets/css/app.css`. Jika mengubah kelas di HTML/JS:

```bash
npm install
npm run build:css
```

## Catatan privasi

PIN adalah kunci layar lokal, bukan enkripsi data. Siapa pun yang memiliki akses ke profil browser dan LocalStorage secara teknis dapat membaca data. Gunakan PIN perangkat/OS, kunci aplikasi ini, dan backup rutin. Menghapus data situs di browser juga akan menghapus data aplikasi.

## Kredit

- Chart.js — MIT
- Lucide Icons — ISC
- Plus Jakarta Sans & JetBrains Mono — SIL Open Font License
- Tailwind CSS — MIT
