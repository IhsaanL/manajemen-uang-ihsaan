# ==========================================================================
# Setup Laragon untuk Manajemen Uang Ihsaan
# - membuat api/config.php + kunci API acak
# - membuat database MySQL dan tabelnya
# - membuat junction C:\laragon\www\manajemen-uang-ihsaan
#
# Jalankan dari PowerShell biasa (tidak perlu admin):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-laragon.ps1
# ==========================================================================

param(
  [string]$LaragonPath = 'C:\laragon',
  [string]$DbUser = 'root',
  [string]$DbPass = '',
  [string]$DbName = 'manajemen_uang_ihsaan'
)

$ErrorActionPreference = 'Stop'
$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ApiPath = Join-Path $ProjectPath 'api'
$ConfigPath = Join-Path $ApiPath 'config.php'

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Test-TcpPort([int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect('127.0.0.1', $port, $null, $null)
    return $async.AsyncWaitHandle.WaitOne(700) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

if (-not (Test-Path $LaragonPath)) {
  throw "Folder Laragon tidak ditemukan: $LaragonPath"
}
if (-not (Test-Path $ApiPath)) {
  throw "Folder api tidak ditemukan: $ApiPath"
}

Write-Step "Mencari PHP dan MySQL di Laragon"
$phpDir = Get-ChildItem (Join-Path $LaragonPath 'bin\php') -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
$mysqlDir = Get-ChildItem (Join-Path $LaragonPath 'bin\mysql') -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1

if (-not $phpDir) { throw 'PHP tidak ditemukan di C:\laragon\bin\php' }
if (-not $mysqlDir) { throw 'MySQL tidak ditemukan di C:\laragon\bin\mysql' }

$phpExe = Join-Path $phpDir.FullName 'php.exe'
$mysqlExe = Join-Path $mysqlDir.FullName 'bin\mysql.exe'
$mysqldExe = Join-Path $mysqlDir.FullName 'bin\mysqld.exe'
$myIni = Join-Path $mysqlDir.FullName 'my.ini'

Write-Host "PHP   : $phpExe"
Write-Host "MySQL : $mysqlExe"

Write-Step "Menyiapkan kunci API"
$apiKey = $null
if (Test-Path $ConfigPath) {
  $existing = [System.IO.File]::ReadAllText($ConfigPath)
  if ($existing -match "'api_key'\s*=>\s*'([^']+)'") {
    $apiKey = $matches[1]
  }

  # Pastikan config.php tidak menyimpan BOM; BOM akan merusak header JSON.
  $configBytes = [System.IO.File]::ReadAllBytes($ConfigPath)
  if ($configBytes.Length -ge 3 -and $configBytes[0] -eq 0xEF -and $configBytes[1] -eq 0xBB -and $configBytes[2] -eq 0xBF) {
    $cleanText = [System.Text.Encoding]::UTF8.GetString($configBytes, 3, $configBytes.Length - 3)
    [System.IO.File]::WriteAllText($ConfigPath, $cleanText, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'BOM pada config.php dibersihkan.' -ForegroundColor Yellow
  }
}

if (-not $apiKey -or $apiKey.StartsWith('GANTI-')) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 32
  $rng.GetBytes($bytes)
  $apiKey = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $rng.Dispose()

  $config = @"
<?php
/**
 * Konfigurasi lokal — dibuat otomatis oleh scripts/setup-laragon.ps1.
 * File ini tidak ikut di-commit ke Git.
 */

return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => '$DbName',
        'user' => '$DbUser',
        'pass' => '$DbPass',
        'charset' => 'utf8mb4',
    ],
    'api_key' => '$apiKey',
    'allowed_origins' => ['*'],
    'max_body_bytes' => 12582912,
];
"@
  [System.IO.File]::WriteAllText($ConfigPath, $config, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "config.php dibuat." -ForegroundColor Green
} else {
  Write-Host "config.php sudah ada; kunci API dipertahankan." -ForegroundColor Yellow
}

Write-Step "Memastikan MySQL berjalan di port 3306"
if (Test-TcpPort 3306) {
  Write-Host 'MySQL sudah berjalan.' -ForegroundColor Green
} else {
  Write-Host 'MySQL belum berjalan. Menyalakan mysqld...'
  if (-not (Test-Path $mysqldExe)) { throw "mysqld.exe tidak ditemukan: $mysqldExe" }
  if (Test-Path $myIni) {
    Start-Process -FilePath $mysqldExe -ArgumentList "--defaults-file=`"$myIni`"" -WindowStyle Hidden | Out-Null
  } else {
    Start-Process -FilePath $mysqldExe -ArgumentList "--datadir=`"$LaragonPath\data\mysql-8.4`"","--port=3306" -WindowStyle Hidden | Out-Null
  }

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-TcpPort 3306) { $ready = $true; break }
  }
  if (-not $ready) {
    throw 'MySQL belum siap. Buka Laragon lalu klik Start All, kemudian jalankan skrip ini lagi.'
  }
  Write-Host 'MySQL siap.' -ForegroundColor Green
}

Write-Step "Mengimpor skema database $DbName"
$schemaPath = Join-Path $ApiPath 'schema.sql'
if (-not (Test-Path $schemaPath)) { throw "schema.sql tidak ditemukan: $schemaPath" }

$schemaText = [System.IO.File]::ReadAllText($schemaPath)
if ($DbName -ne 'manajemen_uang_ihsaan') {
  $schemaText = $schemaText.Replace('manajemen_uang_ihsaan', $DbName)
}
$tempSchema = Join-Path ([System.IO.Path]::GetTempPath()) ("muis-schema-$PID.sql")
[System.IO.File]::WriteAllText($tempSchema, $schemaText, (New-Object System.Text.UTF8Encoding($false)))

$mysqlArgs = @(
  '--host=127.0.0.1',
  '--port=3306',
  "--user=$DbUser",
  '--default-character-set=utf8mb4',
  '--protocol=TCP'
)
if ($DbPass -ne '') { $mysqlArgs += "--password=$DbPass" }

$import = Start-Process -FilePath $mysqlExe -ArgumentList $mysqlArgs `
  -RedirectStandardInput $tempSchema -NoNewWindow -Wait -PassThru
Remove-Item $tempSchema -ErrorAction SilentlyContinue
if ($import.ExitCode -ne 0) {
  throw "Impor skema gagal (exit $($import.ExitCode)). Periksa kredensial MySQL di skrip ini."
}
Write-Host 'Skema dan tabel siap.' -ForegroundColor Green

Write-Step "Membuat akses web di C:\laragon\www"
$wwwPath = Join-Path $LaragonPath 'www'
$linkPath = Join-Path $wwwPath 'manajemen-uang-ihsaan'
if (-not (Test-Path $wwwPath)) { New-Item -ItemType Directory -Path $wwwPath | Out-Null }

if (Test-Path $linkPath) {
  $item = Get-Item $linkPath -Force
  if ($item.LinkType -eq 'Junction') {
    Write-Host "Junction sudah ada: $linkPath" -ForegroundColor Yellow
  } else {
    Write-Host "Peringatan: $linkPath sudah ada dan bukan junction. Lewati pembuatan junction." -ForegroundColor Yellow
  }
} else {
  New-Item -ItemType Junction -Path $linkPath -Target $ProjectPath | Out-Null
  Write-Host "Junction dibuat: $linkPath" -ForegroundColor Green
}

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " SETUP SELESAI" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "1. Buka Laragon, klik Start All (Apache + MySQL)." -ForegroundColor White
Write-Host "2. Buka aplikasi:" -ForegroundColor White
Write-Host "   http://localhost/manajemen-uang-ihsaan/" -ForegroundColor Yellow
if ($lanIp) {
  Write-Host "   http://$lanIp/manajemen-uang-ihsaan/   (dari HP, Wi-Fi sama)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "3. Di aplikasi: Data & Pengaturan -> Sinkronisasi MySQL" -ForegroundColor White
Write-Host "   Alamat API (dari HP): http://$lanIp/manajemen-uang-ihsaan/api" -ForegroundColor White
Write-Host "   Kunci API:" -ForegroundColor White
Write-Host "   $apiKey" -ForegroundColor Yellow
Write-Host ""
Write-Host "Tes API di browser:" -ForegroundColor White
Write-Host "   http://localhost/manajemen-uang-ihsaan/api/health.php" -ForegroundColor Yellow
Write-Host ""
Write-Host "Catatan: PIN aplikasi hanya kunci layar. Kunci API di atas yang" -ForegroundColor Gray
Write-Host "melindungi akses ke MySQL. Jangan bagikan kunci ini." -ForegroundColor Gray
Write-Host ""
