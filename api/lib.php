<?php
/**
 * MANAJEMEN UANG IHSAAN — pustaka API
 * Koneksi MySQL, autentikasi API key, validasi, dan baca/tulis state.
 */

declare(strict_types=1);

const MUIS_MAX_TRANSACTIONS = 20000;
const MUIS_MAX_SUBSCRIPTIONS = 500;
const MUIS_MAX_QUICK_ADDS = 20;

function muis_config(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        muis_fail(500, 'API belum dikonfigurasi. Salin api/config.example.php menjadi api/config.php.');
    }

    $loaded = require $path;
    if (!is_array($loaded)) {
        muis_fail(500, 'Konfigurasi API tidak valid.');
    }

    $loaded['db'] = array_merge([
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'manajemen_uang_ihsaan',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ], is_array($loaded['db'] ?? null) ? $loaded['db'] : []);

    $loaded['api_key'] = (string) ($loaded['api_key'] ?? '');
    $loaded['allowed_origins'] = is_array($loaded['allowed_origins'] ?? null)
        ? $loaded['allowed_origins']
        : ['*'];
    $loaded['max_body_bytes'] = (int) ($loaded['max_body_bytes'] ?? 12582912);

    $config = $loaded;
    return $config;
}

function muis_fail(int $status, string $message, array $extra = []): never
{
    muis_json_response($status, array_merge([
        'ok' => false,
        'error' => $message,
    ], $extra));
}

function muis_json_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function muis_apply_cors(): void
{
    $config = muis_config();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = $config['allowed_origins'];

    if (in_array('*', $allowed, true)) {
        header('Access-Control-Allow-Origin: *');
    } elseif ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, X-Base-Revision');
    header('Access-Control-Max-Age: 600');
}

function muis_require_auth(): void
{
    $config = muis_config();
    $expected = trim($config['api_key']);

    if ($expected === '' || str_starts_with($expected, 'GANTI-')) {
        muis_fail(500, 'API key belum diatur di api/config.php.');
    }

    $provided = trim((string) ($_SERVER['HTTP_X_API_KEY'] ?? ''));
    if ($provided === '') {
        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if (stripos($authorization, 'Bearer ') === 0) {
            $provided = trim(substr($authorization, 7));
        }
    }

    if ($provided === '' || !hash_equals($expected, $provided)) {
        muis_fail(401, 'API key tidak valid.');
    }
}

function muis_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = muis_config()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        (int) $db['port'],
        $db['name'],
        $db['charset']
    );

    try {
        $pdo = new PDO($dsn, (string) $db['user'], (string) $db['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
    } catch (Throwable $error) {
        error_log('[muis-api] Koneksi MySQL gagal: ' . $error->getMessage());
        muis_fail(503, 'Tidak dapat terhubung ke MySQL. Pastikan Laragon dan database berjalan.');
    }

    return $pdo;
}

function muis_read_json_body(): array
{
    $config = muis_config();
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        muis_fail(400, 'Body JSON kosong.');
    }
    if (strlen($raw) > $config['max_body_bytes']) {
        muis_fail(413, 'Data terlalu besar untuk dikirim.');
    }

    try {
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        muis_fail(400, 'Body bukan JSON yang valid.');
    }

    if (!is_array($decoded)) {
        muis_fail(400, 'Body JSON harus berupa objek.');
    }

    return $decoded;
}

function muis_text(mixed $value, int $maxLength): string
{
    $text = trim(preg_replace('/\s+/u', ' ', (string) $value) ?? '');
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }
    return substr($text, 0, $maxLength);
}

function muis_int(mixed $value, int $min, int $max, int $fallback): int
{
    if (!is_numeric($value)) {
        return $fallback;
    }
    $number = (int) round((float) $value);
    return max($min, min($max, $number));
}

function muis_valid_date(mixed $value): ?string
{
    $text = (string) $value;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $text)) {
        return null;
    }
    $year = (int) substr($text, 0, 4);
    if ($year < 1900 || $year > 2999) {
        return null;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $text);
    if (!$date || $date->format('Y-m-d') !== $text) {
        return null;
    }
    return $text;
}

function muis_datetime(mixed $value): string
{
    if (is_string($value) && $value !== '') {
        $timestamp = strtotime($value);
        if ($timestamp !== false && $timestamp >= 0 && $timestamp <= 32503679999) {
            return gmdate('Y-m-d H:i:s', $timestamp);
        }
    }
    return gmdate('Y-m-d H:i:s');
}

function muis_iso(?string $mysqlDatetime): ?string
{
    if ($mysqlDatetime === null || $mysqlDatetime === '') {
        return null;
    }
    $timestamp = strtotime($mysqlDatetime . ' UTC');
    if ($timestamp === false) {
        return null;
    }
    return gmdate('Y-m-d\TH:i:s\Z', $timestamp);
}

function muis_sanitize_settings(mixed $raw): array
{
    $settings = is_array($raw) ? $raw : [];
    $pin = (string) ($settings['pin'] ?? '');
    if (!preg_match('/^\d{4,6}$/', $pin)) {
        $pin = '123456';
    }
    $theme = (string) ($settings['theme'] ?? 'system');
    if (!in_array($theme, ['light', 'dark', 'system'], true)) {
        $theme = 'system';
    }

    return [
        'name' => muis_text($settings['name'] ?? 'Ihsaan', 24) ?: 'Ihsaan',
        'pin' => $pin,
        'monthlyLimit' => muis_int($settings['monthlyLimit'] ?? 1500000, 1, 1000000000000, 1500000),
        'weeklyLimit' => muis_int($settings['weeklyLimit'] ?? 350000, 1, 1000000000000, 350000),
        'theme' => $theme,
    ];
}

function muis_sanitize_transactions(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $result = [];
    $seen = [];
    foreach (array_slice($raw, 0, MUIS_MAX_TRANSACTIONS) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $type = $item['type'] ?? '';
        if ($type !== 'income' && $type !== 'expense') {
            continue;
        }
        $amount = muis_int($item['amount'] ?? 0, 1, 1000000000000, 0);
        if ($amount <= 0) {
            continue;
        }
        $date = muis_valid_date($item['date'] ?? '');
        if ($date === null) {
            continue;
        }
        $id = muis_text($item['id'] ?? '', 100);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;

        $result[] = [
            'id' => $id,
            'type' => $type,
            'amount' => $amount,
            'category' => muis_text($item['category'] ?? 'lainnya', 40) ?: 'lainnya',
            'note' => muis_text($item['note'] ?? '', 160) ?: 'Transaksi',
            'date' => $date,
            'createdAt' => muis_datetime($item['createdAt'] ?? null),
        ];
    }

    return $result;
}

function muis_sanitize_subscriptions(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $result = [];
    $seen = [];
    foreach (array_slice($raw, 0, MUIS_MAX_SUBSCRIPTIONS) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = muis_text($item['name'] ?? '', 60);
        $amount = muis_int($item['amount'] ?? 0, 1, 1000000000000, 0);
        $dueDate = muis_valid_date($item['dueDate'] ?? '');
        if ($name === '' || $amount <= 0 || $dueDate === null) {
            continue;
        }
        $id = muis_text($item['id'] ?? '', 100);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;

        $lastPaidAt = $item['lastPaidAt'] ?? null;
        $result[] = [
            'id' => $id,
            'name' => $name,
            'amount' => $amount,
            'cycle' => ($item['cycle'] ?? 'monthly') === 'weekly' ? 'weekly' : 'monthly',
            'dueDate' => $dueDate,
            'category' => muis_text($item['category'] ?? 'langganan', 40) ?: 'langganan',
            'active' => ($item['active'] ?? true) !== false,
            'createdAt' => muis_datetime($item['createdAt'] ?? null),
            'lastPaidAt' => is_string($lastPaidAt) && $lastPaidAt !== '' ? muis_iso(muis_datetime($lastPaidAt)) : null,
        ];
    }

    return $result;
}

function muis_sanitize_quick_adds(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $result = [];
    $seen = [];
    foreach (array_slice($raw, 0, MUIS_MAX_QUICK_ADDS) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $label = muis_text($item['label'] ?? '', 40);
        $amount = muis_int($item['amount'] ?? 0, 1, 1000000000000, 0);
        if ($label === '' || $amount <= 0) {
            continue;
        }
        $id = muis_text($item['id'] ?? '', 100);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;

        $result[] = [
            'id' => $id,
            'label' => $label,
            'amount' => $amount,
            'category' => muis_text($item['category'] ?? 'lainnya', 40) ?: 'lainnya',
        ];
    }

    return $result;
}

function muis_read_state(PDO $db): array
{
    $meta = $db->query('SELECT revision, updated_at FROM sync_meta WHERE id = 1')->fetch();
    $revision = $meta ? (int) $meta['revision'] : 0;

    $settingsRow = $db->query('SELECT * FROM settings WHERE id = 1')->fetch();
    $settings = null;
    if ($settingsRow) {
        $settings = [
            'name' => (string) $settingsRow['name'],
            'pin' => (string) $settingsRow['pin'],
            'monthlyLimit' => (int) $settingsRow['monthly_limit'],
            'weeklyLimit' => (int) $settingsRow['weekly_limit'],
            'theme' => (string) $settingsRow['theme'],
        ];
    }

    $transactions = [];
    $rows = $db->query('SELECT * FROM transactions ORDER BY tx_date ASC, created_at ASC');
    foreach ($rows as $row) {
        $transactions[] = [
            'id' => (string) $row['id'],
            'type' => (string) $row['type'],
            'amount' => (int) $row['amount'],
            'category' => (string) $row['category'],
            'note' => (string) $row['note'],
            'date' => (string) $row['tx_date'],
            'createdAt' => muis_iso((string) $row['created_at']),
        ];
    }

    $subscriptions = [];
    $rows = $db->query('SELECT * FROM subscriptions ORDER BY due_date ASC, created_at ASC');
    foreach ($rows as $row) {
        $subscriptions[] = [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'amount' => (int) $row['amount'],
            'cycle' => (string) $row['cycle'],
            'dueDate' => (string) $row['due_date'],
            'category' => (string) $row['category'],
            'active' => (bool) $row['active'],
            'createdAt' => muis_iso((string) $row['created_at']),
            'lastPaidAt' => muis_iso($row['last_paid_at']),
        ];
    }

    $quickAdds = [];
    $rows = $db->query('SELECT * FROM quick_adds ORDER BY sort_order ASC, id ASC');
    foreach ($rows as $row) {
        $quickAdds[] = [
            'id' => (string) $row['id'],
            'label' => (string) $row['label'],
            'amount' => (int) $row['amount'],
            'category' => (string) $row['category'],
        ];
    }

    return [
        'revision' => $revision,
        'updatedAt' => $meta ? muis_iso((string) $meta['updated_at']) : null,
        'data' => [
            'settings' => $settings,
            'transactions' => $transactions,
            'subscriptions' => $subscriptions,
            'quickAdds' => $quickAdds,
        ],
    ];
}

/**
 * Tulis seluruh state dalam satu transaksi MySQL.
 *
 * @return array{conflict: bool, revision: int}
 */
function muis_write_state(PDO $db, array $data, ?int $baseRevision, string $clientId = ''): array
{
    $settings = muis_sanitize_settings($data['settings'] ?? null);
    $transactions = muis_sanitize_transactions($data['transactions'] ?? []);
    $subscriptions = muis_sanitize_subscriptions($data['subscriptions'] ?? []);
    $quickAdds = muis_sanitize_quick_adds($data['quickAdds'] ?? []);

    $db->beginTransaction();
    try {
        $db->exec('INSERT INTO sync_meta (id, revision, updated_at) VALUES (1, 0, UTC_TIMESTAMP())
                   ON DUPLICATE KEY UPDATE id = id');
        $row = $db->query('SELECT revision FROM sync_meta WHERE id = 1 FOR UPDATE')->fetch();
        $current = $row ? (int) $row['revision'] : 0;

        if ($baseRevision !== null && $baseRevision !== $current) {
            $db->rollBack();
            return ['conflict' => true, 'revision' => $current];
        }

        $db->exec('DELETE FROM transactions');
        $db->exec('DELETE FROM subscriptions');
        $db->exec('DELETE FROM quick_adds');

        $statement = $db->prepare(
            'INSERT INTO transactions (id, type, amount, category, note, tx_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($transactions as $item) {
            $statement->execute([
                $item['id'],
                $item['type'],
                $item['amount'],
                $item['category'],
                $item['note'],
                $item['date'],
                $item['createdAt'],
            ]);
        }

        $statement = $db->prepare(
            'INSERT INTO subscriptions (id, name, amount, cycle, due_date, category, active, created_at, last_paid_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($subscriptions as $item) {
            $statement->execute([
                $item['id'],
                $item['name'],
                $item['amount'],
                $item['cycle'],
                $item['dueDate'],
                $item['category'],
                $item['active'] ? 1 : 0,
                $item['createdAt'],
                $item['lastPaidAt'] !== null ? muis_datetime($item['lastPaidAt']) : null,
            ]);
        }

        $statement = $db->prepare(
            'INSERT INTO quick_adds (id, label, amount, category, sort_order)
             VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($quickAdds as $index => $item) {
            $statement->execute([$item['id'], $item['label'], $item['amount'], $item['category'], $index]);
        }

        $statement = $db->prepare(
            'INSERT INTO settings (id, name, pin, monthly_limit, weekly_limit, theme, updated_at)
             VALUES (1, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               pin = VALUES(pin),
               monthly_limit = VALUES(monthly_limit),
               weekly_limit = VALUES(weekly_limit),
               theme = VALUES(theme),
               updated_at = UTC_TIMESTAMP()'
        );
        $statement->execute([
            $settings['name'],
            $settings['pin'],
            $settings['monthlyLimit'],
            $settings['weeklyLimit'],
            $settings['theme'],
        ]);

        $newRevision = $current + 1;
        $statement = $db->prepare(
            'UPDATE sync_meta SET revision = ?, updated_at = UTC_TIMESTAMP(), client_id = ? WHERE id = 1'
        );
        $statement->execute([$newRevision, muis_text($clientId, 100)]);

        $db->commit();
        return ['conflict' => false, 'revision' => $newRevision];
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('[muis-api] Gagal menulis state: ' . $error->getMessage());
        muis_fail(500, 'Gagal menyimpan data ke MySQL.');
    }
}
