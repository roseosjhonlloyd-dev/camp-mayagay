<?php
declare(strict_types=1);

// Keep PHP warnings/notices out of the JSON body (same reasoning as api.php).
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/mailer.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}

function sendJson(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

try {
    switch ($action) {

        case 'send_code':
            $email = trim((string)($input['email'] ?? ''));

            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                sendJson(['success' => false, 'message' => 'Enter a valid email address.'], 422);
            }

            $stmt = $pdo->prepare('SELECT user_id FROM users WHERE email = :email LIMIT 1');
            $stmt->execute(['email' => $email]);
            $user = $stmt->fetch();

            if ($user) {
                $code = (string)random_int(100000, 999999);

                $_SESSION['reset_email']    = $email;
                $_SESSION['reset_code']     = $code;
                $_SESSION['reset_expires']  = time() + (10 * 60); // 10 minutes
                $_SESSION['reset_verified'] = false;

                $mailError = null;
                if (!sendVerificationEmail($email, $code, $mailError)) {
                    error_log('Forgot password mail error: ' . $mailError);
                }
            }

            sendJson([
                'success' => true,
                'message' => 'If that email is registered, a verification code has been sent.',
            ]);
            break;

        case 'resend_code':
            $email = (string)($_SESSION['reset_email'] ?? '');
            if ($email === '') {
                sendJson(['success' => false, 'message' => 'Please start over from the Forgot Password page.'], 422);
            }

            $code = (string)random_int(100000, 999999);
            $_SESSION['reset_code']     = $code;
            $_SESSION['reset_expires']  = time() + (10 * 60);
            $_SESSION['reset_verified'] = false;

            $mailError = null;
            if (!sendVerificationEmail($email, $code, $mailError)) {
                error_log('Forgot password resend mail error: ' . $mailError);
            }

            sendJson(['success' => true, 'message' => 'A new code has been sent.']);
            break;

        case 'verify_code':
            $code = trim((string)($input['code'] ?? ''));

            if (empty($_SESSION['reset_code']) || empty($_SESSION['reset_expires'])) {
                sendJson(['success' => false, 'message' => 'Please request a new code.'], 422);
            }
            if (time() > (int)$_SESSION['reset_expires']) {
                sendJson(['success' => false, 'message' => 'This code has expired. Please request a new one.'], 422);
            }
            if (!hash_equals((string)$_SESSION['reset_code'], $code)) {
                sendJson(['success' => false, 'message' => 'Incorrect code. Please try again.'], 422);
            }

            $_SESSION['reset_verified'] = true;
            sendJson(['success' => true, 'message' => 'Code verified.']);
            break;


        case 'reset_password':
            if (empty($_SESSION['reset_verified']) || empty($_SESSION['reset_email'])) {
                sendJson(['success' => false, 'message' => 'Please verify your code first.'], 422);
            }

            $newPassword     = (string)($input['new_password'] ?? '');
            $confirmPassword = (string)($input['confirm_password'] ?? '');

            if (strlen($newPassword) < 8) {
                sendJson(['success' => false, 'message' => 'Password must be at least 8 characters.'], 422);
            }
            if ($newPassword !== $confirmPassword) {
                sendJson(['success' => false, 'message' => 'Passwords do not match.'], 422);
            }

            $hashed = password_hash($newPassword, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare('UPDATE users SET password = :password WHERE email = :email');
            $stmt->execute([
                'password' => $hashed,
                'email'    => $_SESSION['reset_email'],
            ]);

            unset(
                $_SESSION['reset_email'],
                $_SESSION['reset_code'],
                $_SESSION['reset_expires'],
                $_SESSION['reset_verified']
            );

            sendJson(['success' => true, 'message' => 'Password reset successfully.']);
            break;

        default:
            sendJson(['success' => false, 'message' => 'Unknown action.'], 400);
    }
} catch (PDOException $e) {
    sendJson(['success' => false, 'message' => 'Server error. Please try again.'], 500);
}
