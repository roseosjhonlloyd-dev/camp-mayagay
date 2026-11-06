<?php
/**
 * resend_verification.php - sends a new activation link to an unverified account.
 * Always answers with the same generic message so it cannot be used to find out
 * which emails are registered.
 */
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/login_helpers.php';

$input = json_decode(file_get_contents('php://input'), true);
$identifier = trim((string)(is_array($input) ? ($input['identifier'] ?? '') : ''));
$generic = ['success' => true, 'message' => 'If that account is waiting for verification, a new link was sent to its email.'];

try {
    ensureEmailVerifyColumns($pdo);
    if ($identifier !== '') {
        $st = $pdo->prepare('SELECT user_id, email, firstname, email_verify_sent FROM users WHERE (username = :a OR email = :b) AND email_verified = 0 LIMIT 1');
        $st->execute(['a' => $identifier, 'b' => $identifier]);
        $u = $st->fetch();
        if ($u) {
            if ($u['email_verify_sent'] && strtotime((string)$u['email_verify_sent']) > time() - 60) {
                http_response_code(429);
                echo json_encode(['success' => false, 'message' => 'Please wait a minute before asking for another email.']);
                exit;
            }
            $err = null;
            sendAccountActivationLink($pdo, (int)$u['user_id'], (string)$u['email'], (string)$u['firstname'], $err);
        }
    }
} catch (Throwable $e) { /* generic answer below */ }
echo json_encode($generic);
