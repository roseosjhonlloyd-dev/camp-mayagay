<?php
/**
 * signup_email.php - verifies the guest's email BEFORE the account is created.
 *
 *   POST php/signup_email.php?action=send_code    { email }        -> emails a 6-digit code
 *   POST php/signup_email.php?action=verify_code  { email, code }  -> marks that email as verified
 *
 * The code and the "verified" flag live in the PHP session. register.php only
 * creates the account when the email being registered is the one verified here.
 */
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/mailer.php';

const SIGNUP_CODE_TTL_SECONDS  = 600; // 10 minutes
const SIGNUP_RESEND_SECONDS    = 30;
const SIGNUP_MAX_CODE_ATTEMPTS = 5;

function signupJson(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data);
    exit;
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
    switch ($action) {

        case 'send_code':
            $check = $pdo->prepare('SELECT user_id FROM users WHERE email = :email LIMIT 1');
            $check->execute(['email' => $email]);
            if ($check->fetch()) {
                signupJson(['success' => false, 'message' => 'An account with this email already exists.'], 409);
            }

            $sameEmail = ($_SESSION['signup_email'] ?? '') === $email;
            $sentAt    = (int)($_SESSION['signup_sent_at'] ?? 0);
            if ($sameEmail && $sentAt > time() - SIGNUP_RESEND_SECONDS) {
                $wait = SIGNUP_RESEND_SECONDS - (time() - $sentAt);
                signupJson(['success' => false, 'message' => 'Please wait ' . $wait . ' seconds before asking for another code.', 'wait' => $wait], 429);
            }

            $code = (string)random_int(100000, 999999);
            $_SESSION['signup_email']      = $email;
            $_SESSION['signup_code_hash']  = hash('sha256', $code);
            $_SESSION['signup_expires']    = time() + SIGNUP_CODE_TTL_SECONDS;
            $_SESSION['signup_attempts']   = 0;
            $_SESSION['signup_sent_at']    = time();
            unset($_SESSION['signup_verified_email']);

            $mailError = null;
            if (!sendSignupCodeEmail($email, $code, $mailError)) {
                error_log('Signup code mail error: ' . $mailError);
                unset($_SESSION['signup_code_hash'], $_SESSION['signup_sent_at']);
                signupJson(['success' => false, 'message' => 'We could not send the code. Please check that your email address is real and try again.'], 502);
            }

            signupJson(['success' => true, 'message' => 'We sent a 6-digit code to ' . $email . '.']);
            break;

        case 'verify_code':
            $code = trim((string)($input['code'] ?? ''));

            if (($_SESSION['signup_email'] ?? '') !== $email || empty($_SESSION['signup_code_hash'])) {
                signupJson(['success' => false, 'message' => 'Please request a code for this email first.'], 422);
            }
            if (time() > (int)($_SESSION['signup_expires'] ?? 0)) {
                signupJson(['success' => false, 'message' => 'This code has expired. Please request a new one.'], 422);
            }
            if ((int)($_SESSION['signup_attempts'] ?? 0) >= SIGNUP_MAX_CODE_ATTEMPTS) {
                signupJson(['success' => false, 'message' => 'Too many wrong tries. Please request a new code.'], 429);
            }
            if (!preg_match('/^\d{6}$/', $code)) {
                signupJson(['success' => false, 'message' => 'Enter the 6-digit code.'], 422);
            }
            if (!hash_equals((string)$_SESSION['signup_code_hash'], hash('sha256', $code))) {
                $_SESSION['signup_attempts'] = (int)($_SESSION['signup_attempts'] ?? 0) + 1;
                signupJson(['success' => false, 'message' => 'Incorrect code. Please try again.'], 422);
            }

            $_SESSION['signup_verified_email'] = $email;
            unset($_SESSION['signup_code_hash'], $_SESSION['signup_expires'], $_SESSION['signup_attempts']);
            signupJson(['success' => true, 'message' => 'Email verified.']);
            break;

        default:
            signupJson(['success' => false, 'message' => 'Unknown action.'], 400);
    }
} catch (PDOException $e) {
    signupJson(['success' => false, 'message' => 'Server error. Please try again.'], 500);
}
