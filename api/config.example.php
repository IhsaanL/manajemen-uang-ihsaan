<?php
/**
 * Contoh konfigurasi API.
 *
 * 1. Salin file ini menjadi `config.php` di folder yang sama.
 * 2. Ganti `api_key` dengan kunci acak yang panjang (minimal 24 karakter).
 * 3. Sesuaikan kredensial MySQL jika bukan bawaan Laragon.
 *
 * File `config.php` TIDAK ikut di-commit ke Git.
 */

return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'manajemen_uang_ihsaan',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],

    // Kunci ini dikirim aplikasi lewat header `X-Api-Key`.
    'api_key' => 'GANTI-DENGAN-KUNCI-ACAK-PANJANG-MINIMAL-24-KARAKTER',

    // Gunakan ['*'] untuk LAN rumah, atau daftar origin tertentu.
    'allowed_origins' => ['*'],

    // Batas ukuran body JSON (byte).
    'max_body_bytes' => 12582912,
];
