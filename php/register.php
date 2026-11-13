<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/login_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST; 
}

$firstname       = trim((string)($input['firstname'] ?? ''));
$lastname        = trim((string)($input['lastname'] ?? ''));
$email           = trim((string)($input['email'] ?? ''));
$username        = trim((string)($input['username'] ?? ''));
$contact_number  = trim((string)($input['contact_number'] ?? ''));
$password        = (string)($input['password'] ?? '');
$confirmPassword = (string)($input['confirm_password'] ?? '');

$errors = [];

if (empty($input['consent'])) {
    $errors['consent'] = 'Please agree to the Terms and Conditions.';
}

if ($firstname === '')       $errors['firstname'] = 'First name is required.';
if ($lastname === '')        $errors['lastname']  = 'Last name is required.';
if ($username === '')        $errors['username']  = 'Username is required.';
if (strlen($username) > 0 && !preg_match('/^[A-Za-z0-9_.]{3,50}$/', $username)) {
    $errors['username'] = 'Username must be 3-50 characters (letters, numbers, . and _ only).';
}
if ($email === '') {
    $errors['email'] = 'Email is required.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Enter a valid email address.';
}
if ($contact_number !== '' && !preg_match('/^([0-9]{11}|\+[0-9]{7,17})$/', $contact_number)) {
    $errors['contact_number'] = 'Enter a valid contact number (11 digits for PH, or +country code).';
}
if ($password === '') {
    $errors['password'] = 'Password is required.';
} else {
    $policyError = validateSignupPassword($password);
    if ($policyError !== null) {
        $errors['password'] = $policyError;
    }
}
if ($confirmPassword === '') {
    $errors['confirm_password'] = 'Please confirm your password.';
} elseif ($password !== $confirmPassword) {
    $errors['confirm_password'] = 'Passwords do not match.';
}

if (!empty($errors)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Validation failed.', 'errors' => $errors]);
    exit;
}

// The email must have been confirmed with the link sent by signup_email.php.
// Checked here on the server too, so it can't be skipped by editing the page.
if (strtolower($email) !== (string)($_SESSION['signup_verified_email'] ?? '')) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Please verify your email address before creating an account.',
        'errors'  => ['email' => 'Verify your email first.'],
    ]);
    exit;
}

try {
    $check = $pdo->prepare('SELECT user_id FROM users WHERE email = :email OR username = :username LIMIT 1');
    $check->execute(['email' => $email, 'username' => $username]);

    if ($check->fetch()) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'An account with this email or username already exists.'
        ]);
        exit;
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    ensureEmailVerifyColumns($pdo);

    $stmt = $pdo->prepare(
        'INSERT INTO users (role, firstname, lastname, username, email, contact_number, password, email_verified)
         VALUES (:role, :firstname, :lastname, :username, :email, :contact_number, :password, 1)'
    );

    $stmt->execute([
        'role'           => 'guest',
        'firstname'      => $firstname,
        'lastname'       => $lastname,
        'username'       => $username,
        'email'          => $email,
        'contact_number' => $contact_number !== '' ? $contact_number : null,
        'password'       => $hashedPassword,
    ]);

    $newUserId = (int)$pdo->lastInsertId();

    // The email was already confirmed with the emailed link before this point,
    // so the account is created as verified. Clear the flags so they can't be reused.
    try {
        if (!empty($_SESSION['signup_pending_id'])) {
            $pdo->prepare('DELETE FROM signup_email_verifications WHERE pending_id = :p')
                ->execute(['p' => (string)$_SESSION['signup_pending_id']]);
        }
    } catch (PDOException $e) {
        // not critical - expired rows are cleaned up on the next request
    }
    unset(
        $_SESSION['signup_email'],
        $_SESSION['signup_pending_id'],
        $_SESSION['signup_sent_at'],
        $_SESSION['signup_verified_email']
    );

    // Record the sign-up itself as a security log entry, with device and
    // approximate location, same as a login attempt.
    require_once __DIR__ . '/login_helpers.php';
    $signupLocation = detectLoginLocation(clientIp());
    $pdo->prepare(
        "INSERT INTO security_logs (user_id, activity, ip_address, device_info, location, location_lat, location_lng, login_time, status)
         VALUES (:uid, 'signup', :ip, :device, :location, :lat, :lng, NOW(), 'success')"
    )->execute([
        'uid'      => $newUserId,
        'ip'       => clientIp(),
        'device'   => detectDeviceInfo((string)($_SERVER['HTTP_USER_AGENT'] ?? '')),
        'location' => $signupLocation['label'],
        'lat'      => $signupLocation['lat'],
        'lng'      => $signupLocation['lng'],
    ]);

    echo json_encode([
        'success'  => true,
        'message'  => 'Account created! You can now log in.',
        'needs_verification' => false,
        'redirect' => 'index.html'
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Registration failed. Please try again.']);
}
