<?php
declare(strict_types=1);

// Camp Mayagay runs on Philippine time. Without this, Railway (UTC) shows
// login times 8 hours behind.
date_default_timezone_set('Asia/Manila');

$DB_HOST = getenv('DB_HOST') ?: 'localhost';
$DB_PORT = getenv('DB_PORT') ?: '3306';
$DB_NAME = getenv('DB_NAME') ?: 'camp_mayagay';
$DB_USER = getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('DB_PASSWORD') ?: '';
$DB_CHARSET = 'utf8mb4';

$dsn = "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset={$DB_CHARSET}";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, $options);
} catch (PDOException $e) {
    http_response_code(500);
    die(json_encode([
        'success' => false,
        'message' => 'Database connection failed.'
    ]));
}

try {
    $pdo->exec("SET time_zone = '+08:00'");
} catch (PDOException $e) {
    error_log('[camp-mayagay/db.php] could not set time zone: ' . $e->getMessage());
}

/** Real client IP. Behind Railway's proxy REMOTE_ADDR is an internal address
 *  (100.64.x.x); the visitor's address is the first public entry of
 *  X-Forwarded-For. Returns null if nothing usable is found. */
function clientIp(): ?string
{
    $isPublic = function (string $ip): bool {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false
            && strpos($ip, '100.64.') !== 0 && !preg_match('/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./', $ip);
    };
    $candidates = [];
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        foreach (explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']) as $part) {
            $candidates[] = trim($part);
        }
    }
    if (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $candidates[] = trim((string)$_SERVER['HTTP_X_REAL_IP']);
    }
    foreach ($candidates as $ip) {
        if ($ip !== '' && $isPublic($ip)) return $ip;
    }
    $remote = $_SERVER['REMOTE_ADDR'] ?? null;
    return $remote !== '' ? $remote : null;
}

/** One-time data fixes, each remembered in system_settings so it runs once. */
function runLegacyFixes(PDO $pdo): void
{
    try {
        $done = $pdo->query("SELECT setting_key FROM system_settings WHERE setting_key IN ('fix_tz_manila_v1','fix_misc_nov4_v1','fix_res_code_unique_v1','fix_2fa_on_v1')")
                    ->fetchAll(PDO::FETCH_COLUMN);
    } catch (Throwable $e) {
        return; // system_settings not ready yet
    }
    $mark = function (string $key) use ($pdo): void {
        $pdo->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (:k, '1') ON DUPLICATE KEY UPDATE setting_value = '1'")
            ->execute(['k' => $key]);
    };

    // 1) Old DATETIME values were written in UTC (Railway); shift them to Manila time once.
    if (!in_array('fix_tz_manila_v1', $done, true)) {
        try {
            $pdo->exec("UPDATE security_logs SET login_time = DATE_ADD(login_time, INTERVAL 8 HOUR) WHERE login_time IS NOT NULL");
            $pdo->exec("UPDATE security_logs SET logout_time = DATE_ADD(logout_time, INTERVAL 8 HOUR) WHERE logout_time IS NOT NULL");
            $pdo->exec("UPDATE payments SET payment_date = DATE_ADD(payment_date, INTERVAL 8 HOUR) WHERE payment_date IS NOT NULL");
            $mark('fix_tz_manila_v1');
        } catch (Throwable $e) {
            error_log('[camp-mayagay/db.php] tz fix failed: ' . $e->getMessage());
        }
    }

    // 2) Typo in saved notifications and the repeated "Detailed Report Generated" notices.
    if (!in_array('fix_misc_nov4_v1', $done, true)) {
        try {
            $pdo->exec("UPDATE notifications SET title = REPLACE(title, 'Annoucement', 'Announcement'), message = REPLACE(message, 'Annoucement', 'Announcement') WHERE title LIKE '%Annoucement%' OR message LIKE '%Annoucement%'");
            $pdo->exec("UPDATE notifications SET title = 'Payment Received' WHERE title = 'Payment Reminder'");
            $pdo->exec("DELETE FROM notifications WHERE title = 'Detailed Report Generated'");
            $mark('fix_misc_nov4_v1');
        } catch (Throwable $e) {
            error_log('[camp-mayagay/db.php] misc fix failed: ' . $e->getMessage());
        }
    }

    // 2b) Admin/staff login OTP must be ON (one time; admin can still switch it off in Account Security later).
    if (!in_array('fix_2fa_on_v1', $done, true)) {
        try {
            $pdo->exec("INSERT INTO system_settings (setting_key, setting_value) VALUES ('two_factor_enabled', '1') ON DUPLICATE KEY UPDATE setting_value = '1'");
            $mark('fix_2fa_on_v1');
        } catch (Throwable $e) {
            error_log('[camp-mayagay/db.php] 2fa default fix failed: ' . $e->getMessage());
        }
    }

    // 3) Make reservation codes unique: renumber duplicates, then add a UNIQUE index.
    if (!in_array('fix_res_code_unique_v1', $done, true)) {
        try {
            $rows = $pdo->query('SELECT reservation_id, code FROM reservations ORDER BY reservation_id')->fetchAll();
            $seen = [];
            $maxByPrefix = [];
            foreach ($rows as $r) {
                if (preg_match('/^(.*)-(\d+)$/', (string)$r['code'], $m)) {
                    $maxByPrefix[$m[1]] = max($maxByPrefix[$m[1]] ?? 0, (int)$m[2]);
                }
            }
            $upd = $pdo->prepare('UPDATE reservations SET code = :c WHERE reservation_id = :id');
            $updPay = $pdo->prepare('UPDATE payments SET reference_number = :c WHERE reservation_id = :id AND reference_number = :old');
            foreach ($rows as $r) {
                $code = (string)$r['code'];
                if (!isset($seen[$code])) { $seen[$code] = true; continue; }
                $prefix = preg_match('/^(.*)-(\d+)$/', $code, $m) ? $m[1] : $code;
                $next = ($maxByPrefix[$prefix] ?? 0) + 1;
                $maxByPrefix[$prefix] = $next;
                $new = $prefix . '-' . str_pad((string)$next, 2, '0', STR_PAD_LEFT);
                $upd->execute(['c' => $new, 'id' => $r['reservation_id']]);
                $updPay->execute(['c' => $new, 'id' => $r['reservation_id'], 'old' => $code]);
                $seen[$new] = true;
            }
            $hasIdx = $pdo->query("SHOW INDEX FROM reservations WHERE Key_name = 'uq_reservations_code'")->fetch();
            if (!$hasIdx) {
                $pdo->exec('ALTER TABLE reservations ADD UNIQUE KEY uq_reservations_code (code)');
            }
            $mark('fix_res_code_unique_v1');
        } catch (Throwable $e) {
            error_log('[camp-mayagay/db.php] code uniqueness fix failed: ' . $e->getMessage());
        }
    }
}
runLegacyFixes($pdo);
