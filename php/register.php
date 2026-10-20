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
$validIdImage    = (string)($input['valid_id_image'] ?? '');

$errors = [];

$validIdMatches = [];
if ($validIdImage === '') {
    $errors['valid_id'] = 'Please upload a photo of a valid ID.';
} elseif (!preg_match('/^data:image\/(jpeg|png);base64,(.+)$/', $validIdImage, $validIdMatches)) {
    $errors['valid_id'] = 'Please upload a JPEG or PNG image.';
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
if ($contact_number !== '' && !preg_match('/^[0-9+\-\s]{7,20}$/', $contact_number)) {
    $errors['contact_number'] = 'Enter a valid contact number.';
}
if ($password === '') {
    $errors['password'] = 'Password is required.';
} else {
    $policyError = validatePasswordPolicy($password, getSystemSettings($pdo)['password_policy_enabled'] === '1');
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

    $stmt = $pdo->prepare(
        'INSERT INTO users (role, firstname, lastname, username, email, contact_number, password)
         VALUES (:role, :firstname, :lastname, :username, :email, :contact_number, :password)'
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

    // Save the valid ID photo the guest uploaded during sign-up, so it's
    // ready for the admin to review (Security Management > User
    // Management). Registration already failed above if this was
    // missing, so it should always be present here.
    if (isset($validIdMatches[2])) {
        $idBinary = base64_decode($validIdMatches[2], true);
        if ($idBinary !== false && strlen($idBinary) <= 5 * 1024 * 1024) {
            $idExtension = $validIdMatches[1] === 'jpeg' ? 'jpg' : 'png';
            $idUploadDir = __DIR__ . '/../assets/uploads/valid_ids';
            if (!is_dir($idUploadDir)) {
                mkdir($idUploadDir, 0755, true);
            }
            $idFilename = 'user' . $newUserId . '_' . time() . '.' . $idExtension;
            if (file_put_contents($idUploadDir . '/' . $idFilename, $idBinary) !== false) {
                $idRelativePath = 'assets/uploads/valid_ids/' . $idFilename;
                $pdo->prepare("UPDATE users SET valid_id_image = :img, id_verification_status = 'pending' WHERE user_id = :id")
                    ->execute(['img' => $idRelativePath, 'id' => $newUserId]);
            }
        }
    }

    // Record the sign-up itself as a security log entry, with device and
    // approximate location, same as a login attempt.
    require_once __DIR__ . '/login_helpers.php';
    $signupLocation = detectLoginLocation($_SERVER['REMOTE_ADDR'] ?? null);
    $pdo->prepare(
        "INSERT INTO security_logs (user_id, activity, ip_address, device_info, location, location_lat, location_lng, login_time, status)
         VALUES (:uid, 'signup', :ip, :device, :location, :lat, :lng, NOW(), 'success')"
    )->execute([
        'uid'      => $newUserId,
        'ip'       => $_SERVER['REMOTE_ADDR'] ?? null,
        'device'   => detectDeviceInfo((string)($_SERVER['HTTP_USER_AGENT'] ?? '')),
        'location' => $signupLocation['label'],
        'lat'      => $signupLocation['lat'],
        'lng'      => $signupLocation['lng'],
    ]);

    echo json_encode([
        'success'  => true,
        'message'  => 'Registration successful. You may now log in.',
        'redirect' => 'Login.html'
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Registration failed. Please try again.']);
}
