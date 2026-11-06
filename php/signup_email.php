<?php
/**
 * signup_email.php - verifies the guest's email BEFORE the account is created,
 * using a "Verify my email" link (no code to type).
 *
 *   POST php/signup_email.php?action=send_link  { email }  -> emails the link
 *   POST php/signup_email.php?action=status     { email }  -> { verified: true|false }
 *
 * The link opens php/verify_signup_email.php, which marks the row verified in the
 * database. The Sign Up page polls "status"; once the row is verified the session
 * gets signup_verified_email, which is what register.php checks. The row is tied
 * to the sign-up page's own session id, so it works even when the link is opened
 * in a different browser (for example the Messenger or Gmail in-app browser).
 */
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/login_helpers.php';
require_once __DIR__ . '/mailer.php';

const SIGNUP_LINK_TTL_MINUTES = 30;
const SIGNUP_RESEND_SECONDS   = 30;

function signupJson(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function ensureSignupVerifyTable(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS signup_email_verifications (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            pending_id CHAR(32) NOT NULL,
            email VARCHAR(255) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            verified_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_token_hash (token_hash),
            KEY idx_pending (pending_id)
        )'
    );
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    signupJson(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}

$action = (string)($_GET['action'] ?? '');
$email  = strtolower(trim((string)($input['email'] ?? '')));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    signupJson(['success' => false, 'message' => 'Enter a valid email address.'], 422);
}

try {
    ensureSignupVerifyTable($pdo);

    switch ($action) {

        case 'send_link':
            $check = $pdo->prepare('SELECT user_id FROM users WHERE email = :email LIMIT 1');
            $check->execute(['email' => $email]);
            if ($check->fetch()) {
                signupJson(['success' => false, 'message' => 'An account with this email already exists.'], 409);
            }

            $sameEmail = ($_SESSION['signup_email'] ?? '') === $email;
            $sentAt    = (int)($_SESSION['signup_sent_at'] ?? 0);
            if ($sameEmail && $sentAt > time() - SIGNUP_RESEND_SECONDS) {
                $wait = SIGNUP_RESEND_SECONDS - (time() - $sentAt);
                signupJson(['success' => false, 'message' => 'Please wait ' . $wait . ' seconds before asking for another email.', 'wait' => $wait], 429);
            }

            if (empty($_SESSION['signup_pending_id'])) {
                $_SESSION['signup_pending_id'] = bin2hex(random_bytes(16));
            }
            $pendingId = (string)$_SESSION['signup_pending_id'];

            // Old links for this sign-up page stop working; expired rows are tidied up.
            $pdo->prepare('DELETE FROM signup_email_verifications WHERE pending_id = :p OR expires_at < NOW()')
                ->execute(['p' => $pendingId]);

            $token = bin2hex(random_bytes(24));
            $pdo->prepare(
                'INSERT INTO signup_email_verifications (pending_id, email, token_hash, expires_at)
                 VALUES (:p, :e, :h, DATE_ADD(NOW(), INTERVAL ' . SIGNUP_LINK_TTL_MINUTES . ' MINUTE))'
            )->execute(['p' => $pendingId, 'e' => $email, 'h' => hash('sha256', $token)]);

            $_SESSION['signup_email']   = $email;
            $_SESSION['signup_sent_at'] = time();
            unset($_SESSION['signup_verified_email']);

            $link = siteBaseUrl() . '/php/verify_signup_email.php?token=' . $token;
            $mailError = null;
            if (!sendSignupLinkEmail($email, $link, $mailError)) {
                error_log('Signup link mail error: ' . $mailError);
                $pdo->prepare('DELETE FROM signup_email_verifications WHERE pending_id = :p')->execute(['p' => $pendingId]);
                unset($_SESSION['signup_sent_at']);
                signupJson(['success' => false, 'message' => 'We could not send the email. Please check that your email address is real and try again.'], 502);
            }

            signupJson(['success' => true, 'message' => 'We sent a verification link to ' . $email . '.']);
            break;

        case 'status':
            $pendingId = (string)($_SESSION['signup_pending_id'] ?? '');
            if ($pendingId === '' || ($_SESSION['signup_email'] ?? '') !== $email) {
                signupJson(['success' => true, 'verified' => false]);
            }

            $st = $pdo->prepare(
                'SELECT 1 FROM signup_email_verifications
                 WHERE pending_id = :p AND email = :e AND verified_at IS NOT NULL AND expires_at > NOW() LIMIT 1'
            );
            $st->execute(['p' => $pendingId, 'e' => $email]);
            if ($st->fetchColumn()) {
                $_SESSION['signup_verified_email'] = $email;
                signupJson(['success' => true, 'verified' => true]);
            }
            signupJson(['success' => true, 'verified' => false]);
            break;

        default:
            signupJson(['success' => false, 'message' => 'Unknown action.'], 400);
    }
} catch (PDOException $e) {
    error_log('signup_email.php: ' . $e->getMessage());
    signupJson(['success' => false, 'message' => 'Server error. Please try again.'], 500);
}
