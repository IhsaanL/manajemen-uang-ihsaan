<?php
/**
 * GET /api/health — cek cepat apakah PHP dan MySQL siap dipakai.
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

muis_apply_cors();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$database = false;
$revision = null;
try {
    $db = muis_db();
    $row = $db->query('SELECT revision FROM sync_meta WHERE id = 1')->fetch();
    $database = true;
    $revision = $row ? (int) $row['revision'] : 0;
} catch (Throwable $error) {
    error_log('[muis-api] Health check MySQL gagal: ' . $error->getMessage());
}

muis_json_response(200, [
    'ok' => true,
    'service' => 'manajemen-uang-ihsaan-api',
    'php' => PHP_VERSION,
    'database' => $database,
    'revision' => $revision,
    'serverTime' => gmdate('Y-m-d\TH:i:s\Z'),
]);
