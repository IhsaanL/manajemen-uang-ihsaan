<?php
/**
 * GET  /api/state  — ambil seluruh data + revisi server
 * PUT  /api/state  — kirim seluruh data (optimistic locking via baseRevision)
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

muis_apply_cors();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    muis_require_auth();
    $db = muis_db();

    if ($method === 'GET') {
        $state = muis_read_state($db);
        muis_json_response(200, [
            'ok' => true,
            'revision' => $state['revision'],
            'updatedAt' => $state['updatedAt'],
            'serverTime' => gmdate('Y-m-d\TH:i:s\Z'),
            'data' => $state['data'],
        ]);
    }

    if ($method === 'PUT') {
        $body = muis_read_json_body();
        $data = $body['data'] ?? $body;
        if (!is_array($data)) {
            muis_fail(400, 'Field `data` harus berupa objek.');
        }

        $baseRevision = null;
        if (array_key_exists('baseRevision', $body) && $body['baseRevision'] !== null) {
            if (!is_numeric($body['baseRevision'])) {
                muis_fail(400, '`baseRevision` harus berupa angka.');
            }
            $baseRevision = (int) $body['baseRevision'];
        }

        $clientId = is_string($body['clientId'] ?? null) ? $body['clientId'] : '';
        $result = muis_write_state($db, $data, $baseRevision, $clientId);

        if ($result['conflict']) {
            muis_json_response(409, [
                'ok' => false,
                'error' => 'Data di server sudah berubah. Muat ulang lalu gabungkan kembali.',
                'revision' => $result['revision'],
            ]);
        }

        muis_json_response(200, [
            'ok' => true,
            'revision' => $result['revision'],
            'updatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ]);
    }

    header('Allow: GET, PUT, OPTIONS');
    muis_fail(405, 'Metode tidak didukung.');
} catch (Throwable $error) {
    error_log('[muis-api] Kesalahan tak terduga: ' . $error->getMessage());
    muis_fail(500, 'Terjadi kesalahan pada server.');
}
