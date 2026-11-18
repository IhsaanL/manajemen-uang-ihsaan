# MANAJEMEN UANG IHSAAN

Aplikasi keuangan pribadi bergaya fintech yang berjalan **offline-first** di browser/HP, lalu **disinkronkan ke MySQL** melalui API PHP di Laragon.

- Tidak ada akun cloud dan tidak ada pendaftaran.
- Data tetap bisa dicatat saat Wi-Fi mati.
- MySQL tidak pernah diakses langsung oleh browser. Semua lewat API.
- Tersedia backup JSON, restore, dan ekspor CSV.
- Ada wishlist tabungan target untuk menyisihkan uang ke barang yang ingin dibeli.

---

## Arsitektur

```text
HP / Laptop
┌───────────────────────────────────────────┐
│  PWA Manajemen Uang Ihsaan                │
│  LocalStorage = penyimpanan utama         │
│  (tetap bisa dipakai offline)             │
└──────────────────┬────────────────────────┘
                   │ HTTP + X-Api-Key
                   ▼
┌───────────────────────────────────────────┐
│  API PHP 8.3  (folder /api)               │
│  validasi, autentikasi, 3-way merge       │
└──────────────────┬────────────────────────┘
                   │ PDO / TCP lokal
                   ▼
┌───────────────────────────────────────────┐
│  MySQL 8  (Laragon)                       │
│  manajemen_uang_ihsaan                    │
└───────────────────────────────────────────┘
```

LocalStorage tetap menjadi sumber kerja aplikasi. Saat online, aplikasi mengambil data server, menggabungkannya, lalu mengirim hasil gabungan kembali. Jika server mati, aplikasi tetap berjalan normal dan menyimpan perubahan secara lokal.

---

## Mulai cepat (tanpa server)

1. Buka folder proyek.
2. Klik dua kali `index.html`.
3. Masukkan PIN bawaan: **123456** (6 digit).
4. Ganti PIN di **Data & Pengaturan → Ganti PIN**. PIN baru wajib 6 digit.

Mode ini sepenuhnya lokal. Sinkronisasi MySQL tidak aktif.

---

## Wishlist / tabungan target

Wishlist adalah catatan **alokasi uang**, bukan transaksi. Menyisihkan dana ke sebuah target tidak mengubah saldo dan tidak muncul di riwayat.

1. Buka **Wishlist** di sidebar, atau kartu **Tabungan target** di beranda.
2. Isi nama barang, harga target, tenggat opsional, dan catatan.
3. Tekan **Tabung** untuk menambah dana yang sudah disisihkan.
4. Saat target penuh (atau kamu memutuskan membeli lebih awal), tekan **Beli & catat**.
   Tindakan ini membuat satu transaksi pengeluaran sebesar harga target dan memindahkan barang ke arsip **Sudah dibeli**.
5. Barang di arsip bisa **dibuka kembali** atau dihapus. Transaksi yang sudah tercatat tidak ikut terhapus.

Dana tabungan ikut tersinkron ke MySQL dan masuk backup JSON.

---

## Setup Laragon + MySQL

### 1. Prasyarat

- [Laragon](https://laragon.org/) dengan **PHP 8.1+** dan **MySQL 8**.
- Proyek sudah ada di komputer, misalnya:
  `D:\Data (D)\Ihsaan\kuliah\.Coding\Coolyeah\manajemen-uang-ihsaan`

### 2. Jalankan skrip setup

Dari PowerShell di folder proyek:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-laragon.ps1
```

Skrip ini akan:

1. Membuat `api/config.php` berisi kunci API acak.
2. Menyalakan MySQL jika belum berjalan.
3. Membuat database `manajemen_uang_ihsaan` dan semua tabel.
4. Membuat junction `C:\laragon\www\manajemen-uang-ihsaan` ke folder proyek.
5. Menampilkan **kunci API** dan alamat lokal/LAN.

> Simpan kunci API yang ditampilkan. Kunci itu yang dimasukkan ke aplikasi.
> `api/config.php` sengaja di-ignore Git dan tidak boleh di-commit.
>
> Sudah pernah setup sebelumnya? Jalankan ulang skrip ini (atau import `api/schema.sql`) untuk menambah tabel `wishlist`. Skrip memakai `CREATE TABLE IF NOT EXISTS`, jadi data lama tidak dihapus.

### 3. Jalankan Laragon

Buka Laragon, klik **Start All** (Apache + MySQL).

Buka:

- Laptop: `http://localhost/manajemen-uang-ihsaan/`
- HP (Wi-Fi sama): `http://IP-LAPTOP/manajemen-uang-ihsaan/`

Cek API:

```text
http://localhost/manajemen-uang-ihsaan/api/health.php
```

Respons yang benar:

```json
{"ok":true,"service":"manajemen-uang-ihsaan-api","php":"8.3.x","database":true,"revision":0}
```

### 4. Aktifkan sinkronisasi di aplikasi

1. Buka **Data & Pengaturan**.
2. Cari kartu **Sinkronisasi MySQL**.
3. Isi **Kunci API** dari hasil setup.
4. **Alamat API**:
   - Kosongkan jika aplikasi dibuka dari Laragon yang sama.
   - Dari HP, isi: `http://IP-LAPTOP/manajemen-uang-ihsaan/api`
5. Tekan **Simpan & Sinkronkan**.

Status di header akan berubah menjadi **Tersinkron** jika berhasil.

### 5. Pasang di HP

1. Pastikan HP dan laptop berada di Wi-Fi yang sama.
2. Buka alamat LAN di Chrome/Safari HP.
3. Pilih **Tambahkan ke layar utama** / **Add to Home Screen**.
4. Buka aplikasi dari ikon, lalu isi kunci API seperti langkah di atas.

> Lewat `http://IP-LAN`, browser biasanya hanya mengizinkan **shortcut home screen**, bukan PWA penuh dengan service worker. PWA penuh membutuhkan `https://` atau `localhost`. Aplikasi dan sinkronisasi tetap berfungsi.

### Catatan offline di HP

- Selama halaman aplikasi masih terbuka, Wi-Fi mati tidak menghentikan pencatatan. Data masuk ke LocalStorage dan dikirim saat online lagi.
- Setelah semua tab ditutup, membuka aplikasi lagi dari `http://IP-LAN` membutuhkan laptop + Laragon tetap hidup.
- Untuk **cold-start offline** di HP (aplikasi tetap terbuka tanpa server), diperlukan HTTPS agar service worker aktif:
  - **Cloudflare Tunnel / ngrok** → HTTPS, tetapi laptop tetap harus nyala.
  - **mkcert + Apache SSL** → CA lokal yang dipercaya di HP, lalu akses `https://...` (lebih teknis).
  - **Hosting/VPS** → paling andal untuk akses dari mana saja.

---

## Cara kerja sinkronisasi

Setiap perangkat menyimpan `baseline`, yaitu salinan data terakhir yang sudah disepakati dengan server. Saat sinkronisasi:

1. Ambil state terbaru dari `GET /api/state`.
2. Bandingkan data lokal, data server, dan baseline (**3-way merge**):
   - Hanya lokal berubah → pakai lokal.
   - Hanya server berubah → pakai server.
   - Keduanya berubah sama → tidak ada konflik.
   - Keduanya berubah berbeda → versi perangkat yang sedang sinkron dipertahankan, lalu diberi notifikasi.
   - Satu sisi menghapus, sisi lain tidak berubah → penghapusan diterapkan.
   - Satu sisi menghapus, sisi lain mengubah → perubahan dipertahankan agar data tidak hilang.
3. Kirim hasil gabungan dengan `PUT /api/state` dan `baseRevision`.
4. Jika server sudah berubah lebih dulu (`409 Conflict`), ulangi tarik–gabung–kirim.
5. Simpan `baseline` dan revisi baru.

Perilaku lain:

- Perubahan lokal dijadwalkan otomatis ±1,6 detik setelah disimpan.
- Saat kembali online, antrean langsung dikirim.
- Sinkronisasi juga dicek saat aplikasi dibuka, saat tab aktif kembali, dan tiap 5 menit.
- Semua data tetap ditulis ke LocalStorage lebih dulu, termasuk saat offline.

### Yang disinkronkan

- Transaksi
- Langganan
- Wishlist / tabungan target
- Preset catat cepat
- Pengaturan: nama, batas bulanan/mingguan, tema, dan PIN

`lastBackupAt` hanya metadata lokal. Backup JSON tetap disarankan sebagai cadangan independen.

### Tombol pemulihan

- **Sinkronkan Sekarang** — tarik, gabung, dan kirim.
- **Ambil dari Server** — menimpa data perangkat dengan data MySQL. Gunakan dengan hati-hati.
- **Kirim ke Server** — menimpa data MySQL dengan data perangkat. Gunakan jika perangkat ini yang paling benar.
- **Putuskan** — mematikan sinkronisasi di perangkat dan menghapus kunci API dari browser. Data MySQL tidak dihapus.

---

## API

Semua endpoint membutuhkan header:

```http
X-Api-Key: <kunci dari api/config.php>
```

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/api/health.php` | Cek PHP + MySQL (tanpa kunci) |
| `GET` | `/api/state.php` | Ambil seluruh data + revisi |
| `PUT` | `/api/state.php` | Kirim seluruh data |

Contoh `PUT`:

```json
{
  "baseRevision": 3,
  "clientId": "device-abc",
  "data": {
    "settings": {
      "name": "Ihsaan",
      "pin": "123456",
      "monthlyLimit": 1500000,
      "weeklyLimit": 350000,
      "theme": "system"
    },
    "transactions": [],
    "subscriptions": [],
    "wishlist": [],
    "quickAdds": []
  }
}
```

Jika `baseRevision` tidak sama dengan revisi server, API mengembalikan `409` dan klien akan mengulang proses gabung.

### Tabel MySQL

- `settings`
- `transactions`
- `subscriptions`
- `wishlist`
- `quick_adds`
- `sync_meta` — revisi untuk optimistic locking

Skema lengkap: `api/schema.sql`.

---

## Setup manual (tanpa skrip)

Jika tidak ingin memakai PowerShell:

1. Salin `api/config.example.php` menjadi `api/config.php`.
2. Isi kredensial MySQL dan kunci API acak (minimal 24 karakter).
3. Buat database dengan phpMyAdmin atau:

   ```powershell
   Get-Content .\api\schema.sql | & "C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe" -u root
   ```

4. Arahkan DocumentRoot Laragon ke folder proyek, atau buat junction:

   ```powershell
   New-Item -ItemType Junction -Path "C:\laragon\www\manajemen-uang-ihsaan" -Target "D:\path\ke\manajemen-uang-ihsaan"
   ```

5. Jalankan Apache + MySQL dari Laragon.

---

## Keamanan

- **PIN aplikasi hanya kunci layar**, bukan enkripsi dan bukan pengaman API.
- Akses MySQL dilindungi **kunci API** di `api/config.php`.
- Jangan commit `api/config.php` dan jangan bagikan kunci API.
- Jangan membuka port **3306** ke internet. Cukup port HTTP Apache/Laragon.
- Gunakan hanya di jaringan rumah/LAN tepercaya.
- Untuk akses dari luar rumah, gunakan HTTPS tunnel (misalnya Cloudflare Tunnel) dan tetap jaga kunci API.
- Backup JSON berisi seluruh data dan PIN. Simpan di tempat pribadi.

Jika ingin membatasi CORS, ubah `allowed_origins` di `api/config.php` dari `['*']` menjadi daftar origin tertentu.

---

## Troubleshooting

### Status “Gagal sinkron” / 401

Kunci API salah atau berbeda dengan `api/config.php`. Ambil ulang kunci dari file itu, lalu simpan lagi di aplikasi.

### Status “Gagal sinkron” / 503

MySQL belum berjalan. Buka Laragon → **Start All**, atau jalankan ulang `scripts/setup-laragon.ps1`.

### HP tidak bisa membuka alamat LAN

- Pastikan HP dan laptop di Wi-Fi yang sama.
- Cek IP laptop:
  ```powershell
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' }
  ```
- Izinkan Apache/PHP di Windows Firewall untuk jaringan privat.
- IP bisa berubah setelah reconnect. Perbarui alamat API di aplikasi.

### Halaman GitHub Pages tidak bisa sinkron

GitHub Pages hanya menghosting file statis. Tidak ada PHP/MySQL di sana. Aplikasi di GitHub Pages tetap bisa dipakai lokal, tetapi sinkronisasi harus diarahkan ke API Laragon. Jika halaman HTTPS memanggil API `http://`, browser akan memblokir **mixed content**. Gunakan tunnel HTTPS atau buka aplikasi langsung dari Laragon.

### Perubahan kode tidak muncul

Service worker menyimpan aset secara cache-first. Naikkan `CACHE_NAME` di `sw.js`, lalu reload dengan **Ctrl+Shift+R** (atau hapus site data di HP).

### `config.php` 403

Itu memang disengaja oleh `api/.htaccess`. File konfigurasi hanya boleh di-include oleh PHP, bukan dibuka dari browser.

---

## Backup & pindah perangkat

Walaupun sudah ada sinkronisasi, backup tetap penting:

1. **Data & Pengaturan → Backup JSON**.
2. Simpan file di tempat aman.
3. Untuk memulihkan: **Restore JSON** lalu pilih file.

Backup memuat transaksi, langganan, preset, pengaturan, dan PIN. File CSV hanya untuk laporan, tidak bisa direstore.

---

## Struktur proyek

```text
manajemen-uang-ihsaan/
├─ index.html
├─ manifest.json
├─ sw.js
├─ api/
│  ├─ config.example.php   # contoh konfigurasi (di-commit)
│  ├─ config.php           # rahasia lokal (di-ignore)
│  ├─ .htaccess
│  ├─ lib.php
│  ├─ health.php
│  ├─ state.php
│  └─ schema.sql
├─ assets/
│  ├─ css/app.css
│  ├─ js/core.js
│  ├─ js/render-dashboard.js
│  ├─ js/render-pages.js
│  ├─ js/actions.js
│  ├─ js/sync.js            # offline-first + 3-way merge
│  ├─ js/app.js
│  ├─ fonts/
│  └─ vendor/
├─ icons/
├─ scripts/
│  └─ setup-laragon.ps1
├─ src/input.css
└─ tailwind.config.js
```

---

## Pengembangan

Build ulang CSS setelah mengubah class Tailwind atau markup:

```powershell
npm install
npm run build:css
```

Menjalankan API tanpa Apache juga bisa:

```powershell
php -S 127.0.0.1:8080 -t .
```

Lalu buka `http://127.0.0.1:8080/`.

---

## Lisensi

Proyek pribadi. Data keuangan bersifat sensitif; gunakan dan simpan dengan hati-hati.
