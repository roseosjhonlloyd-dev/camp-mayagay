<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$identifier = trim((string)($input['identifier'] ?? ''));
$password   = (string)($input['password'] ?? '');
$is2faVerify = ($input['action'] ?? '') === 'verify_2fa';
$isResend2fa = ($input['action'] ?? '') === 'resend_2fa';

if (!$is2faVerify && !$isResend2fa && ($identifier === '' || $password === '')) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Username/email and password are required.']);
    exit;
}

require_once __DIR__ . '/login_helpers.php';

$deviceInfo = detectDeviceInfo((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
$loginLocation = detectLoginLocation($_SERVER['REMOTE_ADDR'] ?? null);
// Prefer the position the browser shared (with permission); on the 2FA
// step reuse the one remembered from the password step.
$clientLocation = resolveClientLocation($input);
if ($clientLocation) {
    $loginLocation = $clientLocation;
} elseif ($is2faVerify && !empty($_SESSION['pending_2fa_loc']) && is_array($_SESSION['pending_2fa_loc'])) {
    $loginLocation = $_SESSION['pending_2fa_loc'];
}
$settings = getSystemSettings($pdo);
$loginAttemptLimit = max(1, (int)$settings['login_attempt_limit']);
$activityLoggingOn = $settings['activity_logging_enabled'] === '1';
$twoFactorOn = $settings['two_factor_enabled'] === '1';

/** Only writes to security_logs when Activity Logging is turned on.
 *  $location is the ['label' => ..., 'lat' => ..., 'lng' => ...] array
 *  returned by detectLoginLocation(). */
function logSecurityActivity(PDO $pdo, bool $enabled, ?int $uid, string $activity, string $ip, string $device, array $location, string $status): void
{
    if (!$enabled) return;
    $pdo->prepare(
        "INSERT INTO security_logs (user_id, activity, ip_address, device_info, location, location_lat, location_lng, login_time, status)
         VALUES (:uid, :activity, :ip, :device, :location, :lat, :lng, NOW(), :status)"
    )->execute([
        'uid'      => $uid,
        'activity' => $activity,
        'ip'       => $ip,
        'device'   => $device,
        'location' => $location['label'],
        'lat'      => $location['lat'],
        'lng'      => $location['lng'],
        'status'   => $status,
    ]);
}

try {
    // Resend a fresh 2FA code for the login attempt already in progress.
    if (($input['action'] ?? '') === 'resend_2fa') {
        if (empty($_SESSION['pending_2fa_user_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'No pending verification. Please log in again.']);
            exit;
        }
        if (!empty($_SESSION['pending_2fa_resend_at']) && time() < $_SESSION['pending_2fa_resend_at']) {
            echo json_encode(['success' => false, 'message' => 'Please wait before requesting another code.']);
            exit;
        }
        $stmt = $pdo->prepare('SELECT email FROM users WHERE user_id = :id LIMIT 1');
        $stmt->execute(['id' => $_SESSION['pending_2fa_user_id']]);
        $pendingUser = $stmt->fetch();
        if (!$pendingUser) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Account not found.']);
            exit;
        }

        $code = (string)random_int(100000, 999999);
        $_SESSION['pending_2fa_code']      = $code;
        $_SESSION['pending_2fa_expires']   = time() + (10 * 60);
        $_SESSION['pending_2fa_resend_at'] = time() + 60;

        respondNow(['success' => true, 'message' => 'A new verification code was sent to your email.']);

        require_once __DIR__ . '/mailer.php';
        $mailError = null;
        if (!sendVerificationEmail($pendingUser['email'], $code, $mailError)) {
            error_log('2FA resend mail error: ' . $mailError);
        }
        exit;
    }

    // Handle the "code" step of a 2FA login (see below) before anything else.
    if (($input['action'] ?? '') === 'verify_2fa') {
        $code = trim((string)($input['code'] ?? ''));
        if (empty($_SESSION['pending_2fa_user_id']) || empty($_SESSION['pending_2fa_code'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'No pending verification. Please log in again.']);
            exit;
        }
        if (time() > ($_SESSION['pending_2fa_expires'] ?? 0)) {
            unset($_SESSION['pending_2fa_user_id'], $_SESSION['pending_2fa_code'], $_SESSION['pending_2fa_expires']);
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Code expired. Please log in again.']);
            exit;
        }
        if (!hash_equals((string)$_SESSION['pending_2fa_code'], $code)) {
            echo json_encode(['success' => false, 'message' => 'Incorrect code. Please try again.']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT user_id AS id, role, firstname, lastname, username, email, contact_number, address, status, profile_image, valid_id_image, id_verification_status FROM users WHERE user_id = :id LIMIT 1');
        $stmt->execute(['id' => $_SESSION['pending_2fa_user_id']]);
        $user = $stmt->fetch();
        unset($_SESSION['pending_2fa_user_id'], $_SESSION['pending_2fa_code'], $_SESSION['pending_2fa_expires'], $_SESSION['pending_2fa_loc']);

        if (!$user) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Account not found.']);
            exit;
        }

        logSecurityActivity($pdo, $activityLoggingOn, (int)$user['id'], 'login', $_SERVER['REMOTE_ADDR'] ?? '', $deviceInfo, $loginLocation, 'success');

        session_regenerate_id(true);
        $_SESSION['user_id']       = $user['id'];
        $_SESSION['role']          = $user['role'];
        $_SESSION['username']      = $user['username'];
        $_SESSION['firstname']     = $user['firstname'];
        $_SESSION['lastname']      = $user['lastname'];
        $_SESSION['email']         = $user['email'];
        $_SESSION['contact_number']= $user['contact_number'];
        $_SESSION['address']       = $user['address'];
        $_SESSION['profile_image'] = $user['profile_image'];
        $_SESSION['valid_id_image'] = $user['valid_id_image'];
        $_SESSION['id_verification_status'] = $user['id_verification_status'];
        $_SESSION['last_activity'] = time();
        $redirect = 'dashboard-guest.html';
        if ($user['role'] === 'admin') $redirect = 'dashboard-admin.html';
        elseif ($user['role'] === 'staff') $redirect = 'dashboard-staff.html';

        echo json_encode(['success' => true, 'message' => 'Login successful.', 'role' => $user['role'], 'redirect' => $redirect]);
        exit;
    }

   $stmt = $pdo->prepare(
    'SELECT user_id AS id, role, firstname, lastname, username, email, contact_number, address, password, status, profile_image, valid_id_image, id_verification_status
     FROM users
     WHERE username = :identifier1 OR email = :identifier2
     LIMIT 1'
);
$stmt->execute([
    'identifier1' => $identifier,
    'identifier2' => $identifier,
]);
    $user = $stmt->fetch();

    // Lock the account after too many failed attempts in the last 15
    // minutes (per the "Login Attempt" setting in Account Security).
    $recentFailures = $pdo->prepare(
        'SELECT COUNT(*) FROM login_attempts WHERE identifier = :identifier AND success = 0 AND attempted_at > (NOW() - INTERVAL 15 MINUTE)'
    );
    $recentFailures->execute(['identifier' => $identifier]);
    if ((int)$recentFailures->fetchColumn() >= $loginAttemptLimit) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Too many failed login attempts. Please try again in 15 minutes.']);
        exit;
    }

    $logStmt = $pdo->prepare(
        'INSERT INTO login_attempts (identifier, ip_address, success) VALUES (:identifier, :ip, :success)'
    );

    if (!$user || !password_verify($password, $user['password'])) {
        $logStmt->execute([
            'identifier' => $identifier,
            'ip'         => $_SERVER['REMOTE_ADDR'] ?? null,
            'success'    => 0,
        ]);
        logSecurityActivity($pdo, $activityLoggingOn, $user['id'] ?? null, 'login attempt', $_SERVER['REMOTE_ADDR'] ?? '', $deviceInfo, $loginLocation, 'failed');
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid username/email or password.']);
        exit;
    }

    if ($user['status'] === 'disabled') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'This account has been disabled. Contact the administrator.']);
        exit;
    }

    $logStmt->execute([
        'identifier' => $identifier,
        'ip'         => $_SERVER['REMOTE_ADDR'] ?? null,
        'success'    => 1,
    ]);

    // 2FA gate: for admin/staff accounts, when enabled in Account
    // Security, require a one-time email code before the session starts.
    if ($twoFactorOn && in_array($user['role'], ['admin', 'staff'], true)) {
        $code = (string)random_int(100000, 999999);
        $_SESSION['pending_2fa_user_id'] = $user['id'];
        $_SESSION['pending_2fa_code']    = $code;
        $_SESSION['pending_2fa_expires'] = time() + (10 * 60);
        $_SESSION['pending_2fa_resend_at'] = time() + 60;
        $_SESSION['pending_2fa_loc']     = $loginLocation;

        respondNow([
            'success'    => true,
            'needs_2fa'  => true,
            'message'    => 'We sent a 6-digit verification code to your email.',
        ]);

        require_once __DIR__ . '/mailer.php';
        $mailError = null;
        if (!sendVerificationEmail($user['email'], $code, $mailError)) {
            error_log('2FA mail error: ' . $mailError);
        }
        exit;
    }

    logSecurityActivity($pdo, $activityLoggingOn, $user['id'], 'login', $_SERVER['REMOTE_ADDR'] ?? '', $deviceInfo, $loginLocation, 'success');

    session_regenerate_id(true);

    $_SESSION['user_id']       = $user['id'];
    $_SESSION['role']          = $user['role'];
    $_SESSION['username']      = $user['username'];
    $_SESSION['firstname']     = $user['firstname'];
    $_SESSION['lastname']      = $user['lastname'];
    $_SESSION['email']         = $user['email'];
    $_SESSION['contact_number']= $user['contact_number'];
    $_SESSION['address']       = $user['address'];
    $_SESSION['profile_image'] = $user['profile_image'];
    $_SESSION['valid_id_image'] = $user['valid_id_image'];
    $_SESSION['id_verification_status'] = $user['id_verification_status'];
    $_SESSION['last_activity'] = time();

    $redirect = 'dashboard-guest.html';
    if ($user['role'] === 'admin') {
        $redirect = 'dashboard-admin.html';
    } elseif ($user['role'] === 'staff') {
        $redirect = 'dashboard-staff.html';
    }

    echo json_encode([
        'success'  => true,
        'message'  => 'Login successful.',
        'role'     => $user['role'],
        'redirect' => $redirect,
    ]);


} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Login failed. Please try again.']);
}
