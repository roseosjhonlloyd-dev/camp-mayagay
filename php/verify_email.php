<?php
/**
 * verify_email.php - opened from the link in the activation email.
 * Marks the account as verified, then sends the guest to the login page.
 */
declare(strict_types=1);
ini_set('display_errors', '0');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/login_helpers.php';

$token = (string)($_GET['token'] ?? '');
$ok = false;
if (preg_match('/^[a-f0-9]{48}$/', $token)) {
    try {
        ensureEmailVerifyColumns($pdo);
        $st = $pdo->prepare('SELECT user_id FROM users WHERE email_verify_hash = :h AND email_verify_expires > NOW() AND email_verified = 0 LIMIT 1');
        $st->execute(['h' => hash('sha256', $token)]);
        $uid = $st->fetchColumn();
        if ($uid) {
            $pdo->prepare('UPDATE users SET email_verified = 1, email_verify_hash = NULL, email_verify_expires = NULL WHERE user_id = :id')
                ->execute(['id' => (int)$uid]);
            $ok = true;
        }
    } catch (Throwable $e) { $ok = false; }
}
header('Location: ../index.html?verified=' . ($ok ? '1' : '0'));
exit;
