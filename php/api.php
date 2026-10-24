<?php
/**
 * api.php
 * Single JSON endpoint used by dashboard-guest.js and dashboard-admin.js.
 * Talks to the ERD schema in database/erd_schema.sql:
 *   users -> accommodations -> reservations -> payments -> notifications
 *   users -> feedback_concerns / reports / security_logs
 *
 * Responses are shaped to keep field names the existing front-end
 * already expects (id, cabin_id, cabin_name, check_in, check_out,
 * guests_count, status ...) even though the underlying DB columns now
 * follow the ERD (reservation_id, accommodation_id, check_in_date,
 * check_out_date, number_of_guests, reservation_status ...).
 *
 * Usage: POST php/api.php?action=... (see the switch below).
 * Every response is JSON: { success: bool, ... }
 */

declare(strict_types=1);

// XAMPP's default php.ini shows warnings/notices directly in the output,
// which breaks the JSON this endpoint promises (fetch().json() then fails
// with a generic network-looking error on the front-end, e.g. "Could not
// send feedback"). Keep errors out of the response body but still log them,
// and turn any fatal error into a proper JSON error instead of an HTML
// error page.
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json');

register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
        }
        echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
    }
});

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/login_helpers.php';

$user   = currentUser();
$action = $_GET['action'] ?? $_POST['action'] ?? '';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}

function deny(string $message = 'You must be logged in.', int $code = 401): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

function requireLogin(?array $user): void
{
    if (!$user) deny();
}

function requireAdmin(?array $user): void
{
    if (!$user || $user['role'] !== 'admin') deny('Admins only.', 403);
}

/** True for Admin and Staff. Staff share the admin dashboard data (all
 *  reservations, admin notifications, all feedback); what each staff
 *  account may actually open is still controlled by requireModuleAccess()
 *  (Security Management > Roles & Permissions). */
function isStaffOrAdmin(?array $user): bool
{
    return $user !== null && in_array($user['role'], ['admin', 'staff'], true);
}

/* ------------------------------------------------------------
   ROLE-BASED ACCESS CONTROL (Security Management > Roles & Permissions)
------------------------------------------------------------ */
const ACCESS_MODULES = [
    'dashboard'      => 'Dashboard',
    'reservation'    => 'Reservation',
    'payments'       => 'Payment Transactions',
    'accommodation'  => 'Accommodation',
    'guest_record'   => 'Guest Record',
    'notifications'  => 'Notifications',
    'feedback'       => 'Feedback & Concern',
    'reports'        => 'Reports',
    'user_account'   => 'User Account',
    'settings'       => 'Settings',
];

const DEFAULT_ACCESS_MATRIX = [
    'dashboard'     => ['admin' => true,  'staff' => true,  'guest' => false],
    'reservation'   => ['admin' => true,  'staff' => true,  'guest' => true],
    'payments'      => ['admin' => true,  'staff' => true,  'guest' => false],
    'accommodation' => ['admin' => true,  'staff' => true,  'guest' => true],
    'guest_record'  => ['admin' => true,  'staff' => true,  'guest' => false],
    'notifications' => ['admin' => true,  'staff' => true,  'guest' => true],
    'feedback'      => ['admin' => true,  'staff' => true,  'guest' => true],
    'reports'       => ['admin' => true,  'staff' => true,  'guest' => false],
    'user_account'  => ['admin' => true,  'staff' => false, 'guest' => false],
    'settings'      => ['admin' => true,  'staff' => false, 'guest' => false],
];

/** Seeds any module/role row that doesn't exist yet in role_permissions,
 *  using DEFAULT_ACCESS_MATRIX. Safe to call every time - it never
 *  overwrites a row an admin already edited. */
function ensureFavoritesTable(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS accommodation_favorites (
            user_id          INT UNSIGNED NOT NULL,
            accommodation_id INT UNSIGNED NOT NULL,
            created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, accommodation_id)
        ) ENGINE=InnoDB"
    );
}

function ensureAmenitiesColumn(PDO $pdo): void
{
    static $done = false;
    if ($done) return;
    $has = $pdo->query("SHOW COLUMNS FROM accommodations LIKE 'amenities'")->fetch();
    if (!$has) {
        $pdo->exec('ALTER TABLE accommodations ADD COLUMN amenities TEXT NULL AFTER description');
    }
    $done = true;
}

/** Adds reservations.amount_paid (how much the guest has actually paid).
 *  Existing rows already marked 'paid' are backfilled to their full total. */
function ensureAmountPaidColumn(PDO $pdo): void
{
    static $done = false;
    if ($done) return;
    $has = $pdo->query("SHOW COLUMNS FROM reservations LIKE 'amount_paid'")->fetch();
    if (!$has) {
        $pdo->exec('ALTER TABLE reservations ADD COLUMN amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_amount');
        $pdo->exec("UPDATE reservations SET amount_paid = total_amount WHERE payment_status = 'paid'");
    }
    $done = true;
}

/** unpaid / partial / paid from the amounts. */
function paymentStatusFor(float $total, float $paid): string
{
    if ($paid <= 0) return 'unpaid';
    if ($total > 0 && $paid + 0.004 < $total) return 'partial';
    return 'paid';
}

/** Photos that ship with the code (committed to GitHub under assets/images/accommodations),
 *  so they survive every Railway deploy. slug => relative path. */
const BUNDLED_ACCOMMODATION_PHOTOS = [
    'nipa1' => 'assets/images/accommodations/nipa1.jpg',
    'nipa2' => 'assets/images/accommodations/nipa2.jpg',
    'tent'  => 'assets/images/accommodations/tent.jpg',
    'big1'  => 'assets/images/accommodations/big1.jpg',
    'big2'  => 'assets/images/accommodations/big2.jpg',
];

/** One time only: point the accommodations at the bundled photos (replaces the old pictures).
 *  Remembered in system_settings so later admin uploads are never overwritten. */
function applyBundledAccommodationPhotos(PDO $pdo): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $flag = $pdo->prepare("SELECT 1 FROM system_settings WHERE setting_key = 'accom_photos_v1'");
        $flag->execute();
        if ($flag->fetchColumn()) return;
        $upd = $pdo->prepare('UPDATE accommodations SET image = :img WHERE slug = :slug');
        foreach (BUNDLED_ACCOMMODATION_PHOTOS as $slug => $path) {
            if (is_file(__DIR__ . '/../' . $path)) {
                $upd->execute(['img' => $path, 'slug' => $slug]);
            }
        }
        $pdo->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('accom_photos_v1', '1')")->execute();
    } catch (PDOException $e) {
        // non-fatal: the list below still works with whatever image is saved
    }
}

function sanitizeAmenities($raw): ?string
{
    if (!is_array($raw)) return null;
    $out = [];
    foreach ($raw as $item) {
        $t = trim(preg_replace('/\s+/', ' ', (string)$item));
        if ($t === '') continue;
        $t = mb_substr($t, 0, 40);
        foreach ($out as $existing) { if (mb_strtolower($existing) === mb_strtolower($t)) continue 2; }
        $out[] = $t;
        if (count($out) >= 20) break;
    }
    return json_encode($out, JSON_UNESCAPED_UNICODE);
}

function ensureRolePermissionsSeeded(PDO $pdo): void
{
    $existing = $pdo->query('SELECT module_key, role FROM role_permissions')->fetchAll();
    $have = [];
    foreach ($existing as $row) {
        $have[$row['module_key'] . '|' . $row['role']] = true;
    }
    $insert = $pdo->prepare(
        'INSERT INTO role_permissions (module_key, role, allowed) VALUES (:module_key, :role, :allowed)'
    );
    foreach (DEFAULT_ACCESS_MATRIX as $moduleKey => $roles) {
        foreach ($roles as $role => $allowed) {
            if (!isset($have[$moduleKey . '|' . $role])) {
                $insert->execute(['module_key' => $moduleKey, 'role' => $role, 'allowed' => $allowed ? 1 : 0]);
            }
        }
    }
}

/** Full access-module matrix for the admin table, e.g.
 *  [ ['module_key'=>'dashboard','module'=>'Dashboard','admin'=>true,'staff'=>true,'guest'=>false], ... ] */
function getAccessModuleMatrix(PDO $pdo): array
{
    ensureRolePermissionsSeeded($pdo);
    $matrix = [];
    foreach (ACCESS_MODULES as $key => $label) {
        $matrix[$key] = ['module_key' => $key, 'module' => $label, 'admin' => false, 'staff' => false, 'guest' => false];
    }
    $stmt = $pdo->query('SELECT module_key, role, allowed FROM role_permissions');
    foreach ($stmt->fetchAll() as $row) {
        if (isset($matrix[$row['module_key']])) {
            $matrix[$row['module_key']][$row['role']] = (bool)$row['allowed'];
        }
    }
    return array_values($matrix);
}

/** Just the modules a single role may access, e.g. ['reservation'=>true,...] */
function getPermissionsForRole(PDO $pdo, string $role): array
{
    $out = [];
    foreach (getAccessModuleMatrix($pdo) as $row) {
        $out[$row['module_key']] = !empty($row[$role]);
    }
    return $out;
}

/** Blocks the request if the logged-in user's role does not have
 *  access to $moduleKey. Admins always pass - full system access is
 *  guaranteed for admin (see the guard in permissions_update below),
 *  so only Staff and Guest are actually restricted by this. */
function requireModuleAccess(PDO $pdo, ?array $user, string $moduleKey): void
{
    if (!$user) deny();
    if ($user['role'] === 'admin') return;
    $perms = getPermissionsForRole($pdo, $user['role']);
    if (empty($perms[$moduleKey])) {
        deny('You do not have access to this feature. Please contact the administrator.', 403);
    }
}

/** Adds a notification row. $userId = null means "broadcast to admins".
 *  $recipientEmail/$emailStatus are only relevant for guest-facing
 *  messages that were also emailed out (see the "Add Message" composer). */
function addNotification(PDO $pdo, ?int $userId, string $audience, string $type, string $title, string $desc, ?int $reservationId = null, ?string $recipientEmail = null, string $emailStatus = 'not_applicable'): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO notifications (user_id, audience, notification_type, title, message, reservation_id, recipient_email, email_status)
         VALUES (:user_id, :audience, :type, :title, :message, :reservation_id, :recipient_email, :email_status)'
    );
    $stmt->execute([
        'user_id'         => $userId,
        'audience'        => $audience,
        'type'            => $type,
        'title'           => $title,
        'message'         => $desc,
        'reservation_id'  => $reservationId,
        'recipient_email' => $recipientEmail,
        'email_status'    => $emailStatus,
    ]);
    return (int)$pdo->lastInsertId();
}

/** Logs an entry to security_logs. */
/** Decodes a base64 data-URL image and saves it under assets/uploads/accommodations.
 *  Returns the relative path on success, or null (with $error set) on failure. */
function saveAccommodationImage(string $dataUrl, int $accommodationHint, ?string &$error): ?string
{
    if (!preg_match('/^data:image\/(jpeg|png|webp);base64,(.+)$/', $dataUrl, $matches)) {
        $error = 'Please choose a JPEG, PNG, or WEBP image.';
        return null;
    }

    $extMap = ['jpeg' => 'jpg', 'png' => 'png', 'webp' => 'webp'];
    $extension = $extMap[$matches[1]];
    $binary = base64_decode($matches[2], true);

    if ($binary === false) {
        $error = 'Could not read that image. Please try another file.';
        return null;
    }
    if (strlen($binary) > 5 * 1024 * 1024) {
        $error = 'Image is larger than 5MB. Please choose a smaller photo.';
        return null;
    }

    $uploadDir = __DIR__ . '/../assets/uploads/accommodations';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $filename = 'acc' . $accommodationHint . '_' . time() . '_' . bin2hex(random_bytes(3)) . '.' . $extension;
    $fullPath = $uploadDir . '/' . $filename;

    if (file_put_contents($fullPath, $binary) === false) {
        $error = 'Could not save the photo on the server.';
        return null;
    }

    return 'assets/uploads/accommodations/' . $filename;
}

function logSecurity(PDO $pdo, ?int $userId, string $activity, string $status = 'success'): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO security_logs (user_id, activity, ip_address, login_time, status)
         VALUES (:user_id, :activity, :ip, NOW(), :status)'
    );
    $stmt->execute([
        'user_id'  => $userId,
        'activity' => $activity,
        'ip'       => $_SERVER['REMOTE_ADDR'] ?? null,
        'status'   => $status,
    ]);
}

/** Reshapes a reservation (joined with accommodations) into the
 *  legacy field names dashboard-guest.js / dashboard-admin.js expect. */
function reservationRow(array $r): array
{
    return [
        'id'             => (int)$r['reservation_id'],
        'user_id'        => $r['user_id'] !== null ? (int)$r['user_id'] : null,
        'code'           => $r['code'],
        'guest_name'     => $r['guest_name'],
        'guest_email'    => $r['guest_email'],
        'guest_phone'    => $r['guest_phone'],
        'cabin_id'       => $r['slug'],
        'cabin_name'     => $r['accommodation_name'],
        'accommodation_id' => (int)$r['accommodation_id'],
        'check_in'       => $r['check_in_date'],
        'check_out'      => $r['check_out_date'],
        'guests_count'   => (int)$r['number_of_guests'],
        'payment_method' => $r['payment_method'],
        'total_amount'   => $r['total_amount'],
        'amount_paid'    => isset($r['amount_paid']) ? $r['amount_paid'] : '0.00',
        'status'         => $r['reservation_status'],
        'cancel_requested' => (bool)($r['cancel_requested'] ?? false),
        'cancel_reason'  => $r['cancel_reason'] ?? null,
        'payment_status' => $r['payment_status'],
        'created_by'     => $r['created_by'],
        'data'           => $r['data'] ? json_decode((string)$r['data'], true) : null,
        'created_at'     => $r['created_at'],
        'updated_at'     => $r['updated_at'],
    ];
}

const RESERVATION_SELECT = 'SELECT r.*, a.slug, a.accommodation_name FROM reservations r
     JOIN accommodations a ON a.accommodation_id = r.accommodation_id';

try {
    switch ($action) {

        /* ------------------------------------------------------------ */
        case 'session':
            echo json_encode(['success' => true, 'user' => $user]);
            break;

        /* ------------------------------------------------------------
           PROFILE / SETTINGS
        ------------------------------------------------------------ */
        case 'profile_update':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'settings');
            $firstname = trim((string)($input['firstname'] ?? ''));
            $lastname  = trim((string)($input['lastname'] ?? ''));
            $contact   = trim((string)($input['contact_number'] ?? ''));
            $address   = trim((string)($input['address'] ?? ''));

            if ($firstname === '' || $lastname === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'First and last name are required.']);
                break;
            }

            $stmt = $pdo->prepare('UPDATE users SET firstname = :fn, lastname = :ln, contact_number = :cn, address = :addr WHERE user_id = :id');
            $stmt->execute(['fn' => $firstname, 'ln' => $lastname, 'cn' => $contact !== '' ? $contact : null, 'addr' => $address !== '' ? $address : null, 'id' => $user['id']]);

            $_SESSION['firstname']      = $firstname;
            $_SESSION['lastname']       = $lastname;
            $_SESSION['contact_number'] = $contact;
            $_SESSION['address']        = $address;

            echo json_encode(['success' => true, 'user' => currentUser()]);
            break;

        /* ------------------------------------------------------------
           PROFILE PHOTO: guest picks a photo (sent as a base64 data
           URL), we save it as a real file under assets/uploads/avatars
           and remember only the file path in the database - this is
           what actually fixes the photo not saving / not following the
           right account, since it's now tied to the user's row instead
           of the browser's localStorage.
        ------------------------------------------------------------ */
        case 'profile_photo_update':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'settings');
            $photo = (string)($input['photo'] ?? '');

            if ($photo === '' || !preg_match('/^data:image\/(jpeg|png);base64,(.+)$/', $photo, $matches)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Please choose a JPEG or PNG image.']);
                break;
            }

            $extension = $matches[1] === 'jpeg' ? 'jpg' : 'png';
            $binary    = base64_decode($matches[2], true);

            if ($binary === false) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Could not read that image. Please try another file.']);
                break;
            }

            if (strlen($binary) > 3 * 1024 * 1024) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Image is larger than 3MB. Please choose a smaller photo.']);
                break;
            }

            $uploadDir = __DIR__ . '/../assets/uploads/avatars';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filename = 'user' . $user['id'] . '_' . time() . '.' . $extension;
            $fullPath = $uploadDir . '/' . $filename;

            if (file_put_contents($fullPath, $binary) === false) {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Could not save the photo on the server.']);
                break;
            }

            $oldStmt = $pdo->prepare('SELECT profile_image FROM users WHERE user_id = :id');
            $oldStmt->execute(['id' => $user['id']]);
            $oldPath = $oldStmt->fetchColumn();
            if ($oldPath) {
                $oldFullPath = __DIR__ . '/../' . $oldPath;
                if (is_file($oldFullPath)) {
                    @unlink($oldFullPath);
                }
            }

            $relativePath = 'assets/uploads/avatars/' . $filename;

            $stmt = $pdo->prepare('UPDATE users SET profile_image = :img WHERE user_id = :id');
            $stmt->execute(['img' => $relativePath, 'id' => $user['id']]);

            $_SESSION['profile_image'] = $relativePath;

            echo json_encode(['success' => true, 'profile_image' => $relativePath, 'user' => currentUser()]);
            break;

        /* ------------------------------------------------------------
           VALID ID UPLOAD: guest submits a photo of a government ID
           from Settings. Saved server-side (not localStorage) and
           marked 'pending' so it's ready for future admin review.
        ------------------------------------------------------------ */
        case 'valid_id_upload':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'settings');
            $photo = (string)($input['photo'] ?? '');

            if ($photo === '' || !preg_match('/^data:image\/(jpeg|png);base64,(.+)$/', $photo, $matches)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Please choose a JPEG or PNG image.']);
                break;
            }

            $extension = $matches[1] === 'jpeg' ? 'jpg' : 'png';
            $binary    = base64_decode($matches[2], true);

            if ($binary === false) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Could not read that image. Please try another file.']);
                break;
            }

            if (strlen($binary) > 5 * 1024 * 1024) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Image is larger than 5MB. Please choose a smaller photo.']);
                break;
            }

            $uploadDir = __DIR__ . '/../assets/uploads/valid_ids';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filename = 'user' . $user['id'] . '_' . time() . '.' . $extension;
            $fullPath = $uploadDir . '/' . $filename;

            if (file_put_contents($fullPath, $binary) === false) {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Could not save the ID on the server.']);
                break;
            }

            $oldStmt = $pdo->prepare('SELECT valid_id_image FROM users WHERE user_id = :id');
            $oldStmt->execute(['id' => $user['id']]);
            $oldPath = $oldStmt->fetchColumn();
            if ($oldPath) {
                $oldFullPath = __DIR__ . '/../' . $oldPath;
                if (is_file($oldFullPath)) {
                    @unlink($oldFullPath);
                }
            }

            $relativePath = 'assets/uploads/valid_ids/' . $filename;

            $stmt = $pdo->prepare("UPDATE users SET valid_id_image = :img, id_verification_status = 'pending' WHERE user_id = :id");
            $stmt->execute(['img' => $relativePath, 'id' => $user['id']]);

            $_SESSION['valid_id_image'] = $relativePath;
            $_SESSION['id_verification_status'] = 'pending';

            echo json_encode(['success' => true, 'valid_id_image' => $relativePath, 'user' => currentUser()]);
            break;

        /* ------------------------------------------------------------
           CHANGE PASSWORD: guest confirms their current password, then
           sets a new one. Uses password_verify() against the stored
           hash - never compares plain text.
        ------------------------------------------------------------ */
        case 'change_password':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'settings');
            $currentPassword = (string)($input['current_password'] ?? '');
            $newPassword     = (string)($input['new_password'] ?? '');
            $confirmPassword = (string)($input['confirm_password'] ?? '');

            if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Please fill in all password fields.']);
                break;
            }
            $policyError = validatePasswordPolicy($newPassword, getSystemSettings($pdo)['password_policy_enabled'] === '1');
            if ($policyError !== null) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => $policyError]);
                break;
            }
            if ($newPassword !== $confirmPassword) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'New password and confirmation do not match.']);
                break;
            }

            $stmt = $pdo->prepare('SELECT password FROM users WHERE user_id = :id LIMIT 1');
            $stmt->execute(['id' => $user['id']]);
            $row = $stmt->fetch();

            if (!$row || !password_verify($currentPassword, $row['password'])) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Current password is incorrect.']);
                break;
            }

            $hashed = password_hash($newPassword, PASSWORD_DEFAULT);
            $update = $pdo->prepare('UPDATE users SET password = :password WHERE user_id = :id');
            $update->execute(['password' => $hashed, 'id' => $user['id']]);

            echo json_encode(['success' => true, 'message' => 'Password updated successfully.']);
            break;

        /* ------------------------------------------------------------
           USER MANAGEMENT (admin only)
        ------------------------------------------------------------ */
        /* ------------------------------------------------------------
           ACCOUNT SECURITY SETTINGS (admin only)
        ------------------------------------------------------------ */
        case 'security_settings_get':
            requireAdmin($user);
            echo json_encode(['success' => true, 'settings' => getSystemSettings($pdo)]);
            break;

        case 'security_settings_update':
            requireAdmin($user);
            $allowedKeys = [
                'two_factor_enabled'       => ['0', '1'],
                'activity_logging_enabled' => ['0', '1'],
                'password_policy_enabled'  => ['0', '1'],
                'session_timeout_minutes'  => null,
                'login_attempt_limit'      => null,
            ];
            $upsert = $pdo->prepare(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (:k, :v)
                 ON DUPLICATE KEY UPDATE setting_value = :v2'
            );
            foreach ($allowedKeys as $key => $allowedValues) {
                if (!array_key_exists($key, $input)) continue;
                $value = (string)$input[$key];
                if ($key === 'session_timeout_minutes' || $key === 'login_attempt_limit') {
                    $value = (string)max(1, (int)$value);
                } elseif ($allowedValues !== null && !in_array($value, $allowedValues, true)) {
                    continue;
                }
                $upsert->execute(['k' => $key, 'v' => $value, 'v2' => $value]);
            }
            echo json_encode(['success' => true, 'settings' => getSystemSettings($pdo)]);
            break;

        /* ------------------------------------------------------------
           ROLE & PERMISSION MATRIX (admin edits; every role reads its own)
        ------------------------------------------------------------ */
        case 'permissions_get':
            requireAdmin($user);
            echo json_encode(['success' => true, 'modules' => getAccessModuleMatrix($pdo)]);
            break;

        case 'permissions_update':
            requireAdmin($user);
            $moduleKey = (string)($input['module_key'] ?? '');
            $role      = (string)($input['role'] ?? '');
            $allowed   = !empty($input['allowed']) ? 1 : 0;

            if (!array_key_exists($moduleKey, ACCESS_MODULES) || !in_array($role, ['admin', 'staff', 'guest'], true)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Invalid module or role.']);
                break;
            }

            // Safety guard: admin must always keep full system access
            // per the project spec, so this toggle only meaningfully
            // restricts the Staff and Guest columns.
            if ($role === 'admin' && $allowed === 0) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Admin must always have full access to every module.']);
                break;
            }

            ensureRolePermissionsSeeded($pdo);
            $upsert = $pdo->prepare(
                'INSERT INTO role_permissions (module_key, role, allowed) VALUES (:module_key, :role, :allowed)
                 ON DUPLICATE KEY UPDATE allowed = :allowed2'
            );
            $upsert->execute(['module_key' => $moduleKey, 'role' => $role, 'allowed' => $allowed, 'allowed2' => $allowed]);

            logSecurity($pdo, $user['id'], 'updated permission: ' . $moduleKey . ' (' . $role . ') -> ' . ($allowed ? 'allowed' : 'denied'));

            echo json_encode(['success' => true, 'modules' => getAccessModuleMatrix($pdo)]);
            break;

        case 'my_permissions':
            requireLogin($user);
            echo json_encode(['success' => true, 'permissions' => getPermissionsForRole($pdo, $user['role'])]);
            break;

        case 'users_list':
            requireAdmin($user);
            $stmt = $pdo->query('SELECT user_id, firstname, lastname, username, email, contact_number, role, status, created_at, valid_id_image, id_verification_status FROM users ORDER BY user_id ASC');
            $rows = array_map(function ($u) {
                return [
                    'id'             => (int)$u['user_id'],
                    'user_id'        => 'USR-' . str_pad((string)$u['user_id'], 2, '0', STR_PAD_LEFT),
                    'firstname'      => $u['firstname'],
                    'lastname'       => $u['lastname'],
                    'name'           => trim($u['firstname'] . ' ' . $u['lastname']),
                    'username'       => $u['username'],
                    'email'          => $u['email'],
                    'contact_number' => $u['contact_number'],
                    'role'           => $u['role'],
                    'status'         => $u['status'],
                    'created_at'     => $u['created_at'],
                    'valid_id_image' => $u['valid_id_image'],
                    'id_verification_status' => $u['id_verification_status'],
                ];
            }, $stmt->fetchAll());
            echo json_encode(['success' => true, 'users' => $rows]);
            break;

        case 'id_verify_review':
            requireAdmin($user);
            $targetId = (int)($input['id'] ?? 0);
            $decision = (string)($input['status'] ?? '');
            if (!$targetId || !in_array($decision, ['verified', 'rejected'], true)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Invalid request.']);
                break;
            }

            $stmt = $pdo->prepare('UPDATE users SET id_verification_status = :status WHERE user_id = :id');
            $stmt->execute(['status' => $decision, 'id' => $targetId]);

            $title = $decision === 'verified' ? 'Valid ID Verified' : 'Valid ID Rejected';
            $desc  = $decision === 'verified'
                ? 'Your submitted ID has been verified. Thank you!'
                : 'Your submitted ID was not accepted. Please upload a clearer photo of a valid government ID in Settings.';
            addNotification($pdo, $targetId, 'guest', 'announcement', $title, $desc);

            $emailStmt = $pdo->prepare('SELECT email FROM users WHERE user_id = :id');
            $emailStmt->execute(['id' => $targetId]);
            $targetEmail = $emailStmt->fetchColumn();

            respondNow(['success' => true]);

            if ($targetEmail) {
                require_once __DIR__ . '/mailer.php';
                $mailError = null;
                sendNotificationEmail($targetEmail, $title, $desc, $mailError);
            }
            break;

        case 'users_create':
            requireAdmin($user);
            $firstname = trim((string)($input['firstname'] ?? ''));
            $lastname  = trim((string)($input['lastname'] ?? ''));
            $username  = trim((string)($input['username'] ?? ''));
            $email     = trim((string)($input['email'] ?? ''));
            $contact   = trim((string)($input['contact_number'] ?? ''));
            $role      = (string)($input['role'] ?? 'guest');
            $password  = (string)($input['password'] ?? '');

            if ($firstname === '' || $lastname === '' || $username === '' || $email === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'First name, last name, username, and email are required.']);
                break;
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Enter a valid email address.']);
                break;
            }
            if (!in_array($role, ['guest', 'staff', 'admin'], true)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Invalid role.']);
                break;
            }
            if ($password === '') {
                $password = bin2hex(random_bytes(4)); // temp password if none supplied
            } elseif (strlen($password) < 8) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Password must be at least 8 characters.']);
                break;
            }

            $check = $pdo->prepare('SELECT user_id FROM users WHERE email = :email OR username = :username LIMIT 1');
            $check->execute(['email' => $email, 'username' => $username]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'A user with this email or username already exists.']);
                break;
            }

            $stmt = $pdo->prepare(
                'INSERT INTO users (firstname, lastname, username, email, contact_number, password, role, status)
                 VALUES (:fn, :ln, :un, :em, :cn, :pw, :role, :status)'
            );
            $stmt->execute([
                'fn'     => $firstname,
                'ln'     => $lastname,
                'un'     => $username,
                'em'     => $email,
                'cn'     => $contact !== '' ? $contact : null,
                'pw'     => password_hash($password, PASSWORD_DEFAULT),
                'role'   => $role,
                'status' => 'active',
            ]);
            $newId = (int)$pdo->lastInsertId();
            logSecurity($pdo, $user['id'], 'Created user #' . $newId . ' (' . $username . ')');
            echo json_encode(['success' => true, 'user_id' => $newId]);
            break;

        case 'users_update':
            requireAdmin($user);
            $id = (int)($input['id'] ?? 0);
            if (!$id) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Missing id.']); break; }

            $map = [
                'firstname'      => 'firstname',
                'lastname'       => 'lastname',
                'username'       => 'username',
                'email'          => 'email',
                'contact_number' => 'contact_number',
            ];
            $fields = [];
            $params = ['id' => $id];
            foreach ($map as $inKey => $col) {
                if (isset($input[$inKey])) {
                    $val = trim((string)$input[$inKey]);
                    $fields[] = "$col = :$col";
                    $params[$col] = $val !== '' ? $val : null;
                }
            }
            if (isset($input['role']) && in_array($input['role'], ['guest', 'staff', 'admin'], true)) {
                $fields[] = 'role = :role';
                $params['role'] = $input['role'];
            }
            if (isset($input['status']) && in_array($input['status'], ['active', 'disabled'], true)) {
                $fields[] = 'status = :status';
                $params['status'] = $input['status'];
            }
            if (!empty($input['password'])) {
                if (strlen((string)$input['password']) < 8) {
                    http_response_code(422);
                    echo json_encode(['success' => false, 'message' => 'Password must be at least 8 characters.']);
                    break;
                }
                $fields[] = 'password = :password';
                $params['password'] = password_hash((string)$input['password'], PASSWORD_DEFAULT);
            }
            if (empty($fields)) { echo json_encode(['success' => false, 'message' => 'Nothing to update.']); break; }

            if (isset($params['email']) || isset($params['username'])) {
                $check = $pdo->prepare('SELECT user_id FROM users WHERE (email = :email OR username = :username) AND user_id != :id LIMIT 1');
                $check->execute([
                    'email'    => $params['email']    ?? '',
                    'username' => $params['username'] ?? '',
                    'id'       => $id,
                ]);
                if ($check->fetch()) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'message' => 'Another user already uses that email or username.']);
                    break;
                }
            }

            $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE user_id = :id';
            $pdo->prepare($sql)->execute($params);

            if ($user['id'] === $id) {
                foreach (['firstname', 'lastname', 'username', 'email', 'contact_number'] as $f) {
                    if (isset($params[$f])) $_SESSION[$f] = $params[$f];
                }
            }
            logSecurity($pdo, $user['id'], 'Updated user #' . $id);
            echo json_encode(['success' => true]);
            break;

        case 'users_delete':
            requireAdmin($user);
            $id = (int)($input['id'] ?? 0);
            if (!$id) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Missing id.']); break; }
            if ($id === (int)$user['id']) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'You cannot delete your own account.']);
                break;
            }
            $pdo->prepare('DELETE FROM users WHERE user_id = :id')->execute(['id' => $id]);
            logSecurity($pdo, $user['id'], 'Deleted user #' . $id);
            echo json_encode(['success' => true]);
            break;

        /* ------------------------------------------------------------
           ACCOMMODATIONS
        ------------------------------------------------------------ */
        case 'accommodations_list':
            if ($user) requireModuleAccess($pdo, $user, 'accommodation');
            ensureAmenitiesColumn($pdo);
            applyBundledAccommodationPhotos($pdo);
            $stmt = $pdo->query('SELECT * FROM accommodations ORDER BY accommodation_id ASC');
            $accRows = $stmt->fetchAll();
            foreach ($accRows as &$accRow) {
                // If a saved upload no longer exists on disk (Railway wipes uploads on deploy),
                // fall back to the bundled photo instead of showing a broken image.
                $img = (string)($accRow['image'] ?? '');
                if ($img !== '' && !preg_match('#^https?://#', $img) && !is_file(__DIR__ . '/../' . $img)) {
                    $fallback = BUNDLED_ACCOMMODATION_PHOTOS[$accRow['slug'] ?? ''] ?? null;
                    $accRow['image'] = ($fallback && is_file(__DIR__ . '/../' . $fallback)) ? $fallback : null;
                }
                $decoded = isset($accRow['amenities']) && $accRow['amenities'] !== null ? json_decode($accRow['amenities'], true) : null;
                $accRow['amenities'] = is_array($decoded) ? $decoded : null;
            }
            unset($accRow);
            echo json_encode(['success' => true, 'accommodations' => $accRows]);
            break;

        case 'accommodations_trending':
            // Trending = ONLY accommodations na may kahit isang rating na
            // (hindi na fixed list). Ranked by average rating, tapos by dami
            // ng ratings, tapos by dami ng bookings.
            requireLogin($user);
            $stmt = $pdo->query(
                "SELECT a.accommodation_id, a.accommodation_name, a.slug, a.type, a.price, a.capacity, a.image,
                        rt.avg_rating, rt.rating_count,
                        (SELECT COUNT(*) FROM reservations r
                          WHERE r.accommodation_id = a.accommodation_id
                            AND r.reservation_status NOT IN ('cancelled', 'declined')) AS booking_count
                 FROM accommodations a
                 INNER JOIN (
                     SELECT accommodation_id,
                            ROUND(AVG(rating), 1) AS avg_rating,
                            COUNT(*) AS rating_count
                     FROM feedback_concerns
                     WHERE category = 'feedback' AND rating IS NOT NULL AND accommodation_id IS NOT NULL
                     GROUP BY accommodation_id
                 ) rt ON rt.accommodation_id = a.accommodation_id
                 WHERE a.status != 'unavailable'
                 ORDER BY rt.avg_rating DESC, rt.rating_count DESC, booking_count DESC
                 LIMIT 10"
            );
            echo json_encode(['success' => true, 'accommodations' => $stmt->fetchAll()]);
            break;

        case 'favorites_list':
            requireLogin($user);
            ensureFavoritesTable($pdo);
            $mine = $pdo->prepare('SELECT accommodation_id FROM accommodation_favorites WHERE user_id = :u');
            $mine->execute(['u' => $user['id']]);
            $counts = $pdo->query('SELECT accommodation_id, COUNT(*) AS total FROM accommodation_favorites GROUP BY accommodation_id')->fetchAll();
            echo json_encode([
                'success'   => true,
                'favorites' => array_map('intval', $mine->fetchAll(PDO::FETCH_COLUMN)),
                'counts'    => $counts,
            ]);
            break;

        case 'favorites_toggle':
            requireLogin($user);
            ensureFavoritesTable($pdo);
            $favAccId = (int)($input['accommodation_id'] ?? 0);
            $chk = $pdo->prepare('SELECT 1 FROM accommodations WHERE accommodation_id = :id');
            $chk->execute(['id' => $favAccId]);
            if ($favAccId <= 0 || !$chk->fetchColumn()) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Accommodation not found.']);
                break;
            }
            $has = $pdo->prepare('SELECT 1 FROM accommodation_favorites WHERE user_id = :u AND accommodation_id = :a');
            $has->execute(['u' => $user['id'], 'a' => $favAccId]);
            if ($has->fetchColumn()) {
                $pdo->prepare('DELETE FROM accommodation_favorites WHERE user_id = :u AND accommodation_id = :a')
                    ->execute(['u' => $user['id'], 'a' => $favAccId]);
                $nowFav = false;
            } else {
                $pdo->prepare('INSERT INTO accommodation_favorites (user_id, accommodation_id) VALUES (:u, :a)')
                    ->execute(['u' => $user['id'], 'a' => $favAccId]);
                $nowFav = true;
            }
            $cnt = $pdo->prepare('SELECT COUNT(*) FROM accommodation_favorites WHERE accommodation_id = :a');
            $cnt->execute(['a' => $favAccId]);
            echo json_encode(['success' => true, 'favorited' => $nowFav, 'count' => (int)$cnt->fetchColumn()]);
            break;

        case 'accommodation_reviews':
            // Lahat ng ratings/comments ng mga dating nag-stay sa ISANG
            // accommodation (para sa reviews modal ng Trending cards).
            requireLogin($user);
            $accId = (int)($input['accommodation_id'] ?? 0);
            if ($accId <= 0) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Accommodation is required.']); break; }
            $stmt = $pdo->prepare(
                "SELECT fc.feedback_id, fc.rating, fc.message, fc.submitted_at, fc.guest_name
                 FROM feedback_concerns fc
                 WHERE fc.category = 'feedback' AND fc.rating IS NOT NULL AND fc.accommodation_id = :id
                 ORDER BY fc.submitted_at DESC
                 LIMIT 200"
            );
            $stmt->execute(['id' => $accId]);
            $rows = $stmt->fetchAll();
            $sum = 0;
            foreach ($rows as &$row) {
                $sum += (int)$row['rating'];
                $nameParts = preg_split('/\s+/', trim((string)$row['guest_name']));
                $first = $nameParts[0] ?? 'Guest';
                $lastInitial = isset($nameParts[1]) && $nameParts[1] !== '' ? strtoupper($nameParts[1][0]) . '.' : '';
                $row['guest_display_name'] = trim($first . ' ' . $lastInitial);
                unset($row['guest_name']);
            }
            unset($row);
            $count = count($rows);
            echo json_encode([
                'success'    => true,
                'reviews'    => $rows,
                'rating_count' => $count,
                'avg_rating' => $count ? round($sum / $count, 1) : null
            ]);
            break;

        case 'accommodations_create':
            requireModuleAccess($pdo, $user, 'accommodation');
            $name     = trim((string)($input['accommodation_name'] ?? ''));
            $type     = (string)($input['type'] ?? 'cabin');
            $capacity = trim((string)($input['capacity'] ?? ''));
            $price    = (float)($input['price'] ?? 0);
            $desc     = trim((string)($input['description'] ?? ''));
            $slug     = trim((string)($input['slug'] ?? ''));
            ensureAmenitiesColumn($pdo);
            $amenities = sanitizeAmenities($input['amenities'] ?? null);

            if ($name === '') { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Accommodation name is required.']); break; }
            if (!in_array($type, ['room', 'cabin', 'nipa', 'tent area'], true)) {
                http_response_code(422); echo json_encode(['success' => false, 'message' => 'Invalid type.']); break;
            }
            if ($slug === '') {
                $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name));
                $slug = trim($slug, '-') . '-' . random_int(100, 999);
            }

            $imagePath = null;
            if (!empty($input['image'])) {
                $imgError = null;
                $imagePath = saveAccommodationImage((string)$input['image'], 0, $imgError);
                if ($imagePath === null) {
                    http_response_code(422);
                    echo json_encode(['success' => false, 'message' => $imgError]);
                    break;
                }
            }

            $stmt = $pdo->prepare(
                'INSERT INTO accommodations (slug, accommodation_name, description, amenities, type, capacity, price, status, image)
                 VALUES (:slug, :name, :desc, :amenities, :type, :capacity, :price, :status, :image)'
            );
            $stmt->execute([
                'slug'     => $slug,
                'name'     => $name,
                'desc'     => $desc !== '' ? $desc : null,
                'amenities' => $amenities,
                'type'     => $type,
                'capacity' => $capacity !== '' ? $capacity : null,
                'price'    => $price,
                'status'   => 'available',
                'image'    => $imagePath,
            ]);
            echo json_encode(['success' => true, 'accommodation_id' => (int)$pdo->lastInsertId()]);
            break;

        case 'accommodations_update':
            requireModuleAccess($pdo, $user, 'accommodation');
            $id = (int)($input['accommodation_id'] ?? 0);
            if (!$id) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Missing id.']); break; }

            ensureAmenitiesColumn($pdo);
            $fields = [];
            $params = ['id' => $id];
            if (array_key_exists('amenities', $input) && is_array($input['amenities'])) {
                $fields[] = 'amenities = :amenities'; $params['amenities'] = sanitizeAmenities($input['amenities']);
            }
            if (isset($input['accommodation_name'])) { $fields[] = 'accommodation_name = :name'; $params['name'] = trim((string)$input['accommodation_name']); }
            if (isset($input['description']))         { $fields[] = 'description = :desc';         $params['desc'] = trim((string)$input['description']); }
            if (isset($input['capacity']))             { $fields[] = 'capacity = :capacity';         $params['capacity'] = trim((string)$input['capacity']); }
            if (isset($input['price']))                 { $fields[] = 'price = :price';               $params['price'] = (float)$input['price']; }
            if (isset($input['type']) && in_array($input['type'], ['room', 'cabin', 'nipa', 'tent area'], true)) {
                $fields[] = 'type = :type'; $params['type'] = $input['type'];
            }
            if (isset($input['status']) && in_array($input['status'], ['available', 'unavailable'], true)) {
                $fields[] = 'status = :status'; $params['status'] = $input['status'];
            }
            if (!empty($input['image'])) {
                $imgError = null;
                $newImagePath = saveAccommodationImage((string)$input['image'], $id, $imgError);
                if ($newImagePath === null) {
                    http_response_code(422);
                    echo json_encode(['success' => false, 'message' => $imgError]);
                    break;
                }
                $oldImgStmt = $pdo->prepare('SELECT image FROM accommodations WHERE accommodation_id = :id');
                $oldImgStmt->execute(['id' => $id]);
                $oldImage = $oldImgStmt->fetchColumn();
                if ($oldImage) {
                    $oldFullPath = __DIR__ . '/../' . $oldImage;
                    if (is_file($oldFullPath)) {
                        @unlink($oldFullPath);
                    }
                }
                $fields[] = 'image = :image';
                $params['image'] = $newImagePath;
            }
            if (empty($fields)) { echo json_encode(['success' => false, 'message' => 'Nothing to update.']); break; }

            $pdo->prepare('UPDATE accommodations SET ' . implode(', ', $fields) . ' WHERE accommodation_id = :id')->execute($params);
            echo json_encode(['success' => true]);
            break;

        case 'accommodations_update_status':
            requireModuleAccess($pdo, $user, 'accommodation');
            $id     = (int)($input['accommodation_id'] ?? 0);
            $status = (string)($input['status'] ?? '');
            if (!$id || !in_array($status, ['available', 'unavailable'], true)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Invalid accommodation or status.']);
                break;
            }
            $pdo->prepare('UPDATE accommodations SET status = :status WHERE accommodation_id = :id')
                ->execute(['status' => $status, 'id' => $id]);
            echo json_encode(['success' => true]);
            break;

        case 'accommodations_delete':
            requireAdmin($user);
            $id = (int)($input['accommodation_id'] ?? 0);
            if (!$id) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Missing id.']); break; }
            $inUse = $pdo->prepare('SELECT COUNT(*) FROM reservations WHERE accommodation_id = :id');
            $inUse->execute(['id' => $id]);
            if ((int)$inUse->fetchColumn() > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'This accommodation has existing reservations and cannot be deleted.']);
                break;
            }
            $pdo->prepare('DELETE FROM accommodations WHERE accommodation_id = :id')->execute(['id' => $id]);
            echo json_encode(['success' => true]);
            break;

        /* ------------------------------------------------------------
           RESERVATIONS
        ------------------------------------------------------------ */
        case 'reservations_list':
            ensureAmountPaidColumn($pdo);
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'reservation');
            if (isStaffOrAdmin($user)) {
                $stmt = $pdo->query(RESERVATION_SELECT . ' ORDER BY r.created_at DESC');
                $rows = $stmt->fetchAll();
            } else {
                $stmt = $pdo->prepare(RESERVATION_SELECT . ' WHERE r.user_id = :uid ORDER BY r.created_at DESC');
                $stmt->execute(['uid' => $user['id']]);
                $rows = $stmt->fetchAll();
            }
            echo json_encode(['success' => true, 'reservations' => array_map('reservationRow', $rows)]);
            break;

        // Real accommodation availability, used by the Guest booking grid.
        // Only returns accommodation + dates (no guest name/contact info),
        // so any logged-in guest can safely use it to see which cabins are
        // actually free - no more fake/random availability.
        case 'availability_list':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'reservation');
            $stmt = $pdo->query(
                "SELECT a.slug, r.check_in_date, r.check_out_date
                 FROM reservations r
                 JOIN accommodations a ON a.accommodation_id = r.accommodation_id
                 WHERE r.reservation_status IN ('pending', 'confirmed')"
            );
            $rows = $stmt->fetchAll();
            $bookings = array_map(function ($row) {
                return [
                    'slug'      => $row['slug'],
                    'check_in'  => $row['check_in_date'],
                    'check_out' => $row['check_out_date'],
                ];
            }, $rows);
            echo json_encode(['success' => true, 'bookings' => $bookings]);
            break;

        case 'reservations_create':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'reservation');
            // Staff and admin both manage the front-desk / reservation panel,
            // so both are allowed to record a reservation as already
            // confirmed (walk-in guests), unlike a regular guest self-booking
            // through the public site, which always starts as 'pending'.
            $isAdmin = in_array($user['role'], ['admin', 'staff'], true);

            $guestName  = trim((string)($input['guest_name'] ?? ($user['firstname'] . ' ' . $user['lastname'])));
            $guestEmail = trim((string)($input['guest_email'] ?? ($user['email'] ?? '')));
            $guestPhone = trim((string)($input['guest_phone'] ?? ''));
            $cabinId    = trim((string)($input['cabin_id'] ?? ''));
            $cabinName  = trim((string)($input['cabin_name'] ?? ''));
            $checkIn    = trim((string)($input['check_in'] ?? ''));
            $checkOut   = trim((string)($input['check_out'] ?? ''));
            $guestsCnt  = max(1, (int)($input['guests_count'] ?? 1));
            $payment    = trim((string)($input['payment_method'] ?? ''));
            $total      = (float)($input['total_amount'] ?? 0);
            $status     = $isAdmin ? (string)($input['status'] ?? 'confirmed') : 'pending';
            ensureAmountPaidColumn($pdo);
            // Walk-in (admin/staff): the amount actually received is typed in.
            // Online (guest): depends on the receipt/reference they submitted.
            if ($isAdmin) {
                $amountPaid = max(0.0, min($total, (float)($input['amount_paid'] ?? 0)));
            } else {
                $hasReceipt = is_array($input['data'] ?? null) && (
                    trim((string)($input['data']['receiptImage'] ?? '')) !== '' ||
                    trim((string)($input['data']['gcashRef'] ?? '')) !== ''
                );
                $amountPaid = $hasReceipt ? $total : 0.0;
            }
            $payStatus = paymentStatusFor($total, $amountPaid);
            $code       = trim((string)($input['code'] ?? ('CMY-' . date('Y') . '-' . strtoupper(substr($cabinId, 0, 3)) . '-' . random_int(10, 99))));
            $data       = $input['data'] ?? null;

            if ($guestName === '' || $cabinId === '' || $checkIn === '' || $checkOut === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Missing required booking details.']);
                break;
            }

            // Resolve (or create) the accommodation row from the slug
            // the front-end already uses (nipa1, glass, tent, ...).
            $stmt = $pdo->prepare('SELECT accommodation_id FROM accommodations WHERE slug = :slug');
            $stmt->execute(['slug' => $cabinId]);
            $accommodationId = $stmt->fetchColumn();
            if (!$accommodationId) {
                $stmt = $pdo->prepare(
                    'INSERT INTO accommodations (slug, accommodation_name, price) VALUES (:slug, :name, :price)'
                );
                $stmt->execute(['slug' => $cabinId, 'name' => $cabinName !== '' ? $cabinName : $cabinId, 'price' => $total]);
                $accommodationId = (int)$pdo->lastInsertId();
            }

            $userIdForRow = $isAdmin ? (isset($input['user_id']) ? (int)$input['user_id'] : null) : $user['id'];

            // ---- Double-booking guard ---------------------------------
            // 1) I-lock muna ang row ng accommodation na ito (FOR UPDATE).
            //    Kung dalawang booking request ang dumating para sa parehong
            //    cabin nang halos sabay-sabay, hihintayin ng pangalawa na
            //    matapos muna ang una - hindi na sila pareho makakakuha ng
            //    "available" nang sabay.
            // 2) Pagkatapos lang ma-lock, i-che-check kung may existing
            //    pending/confirmed reservation na overlapping ang petsa.
            $pdo->beginTransaction();
            try {
                $lockStmt = $pdo->prepare('SELECT accommodation_id FROM accommodations WHERE accommodation_id = :id FOR UPDATE');
                $lockStmt->execute(['id' => $accommodationId]);

                $overlapStmt = $pdo->prepare(
                    "SELECT reservation_id FROM reservations
                     WHERE accommodation_id = :accommodation_id
                       AND reservation_status IN ('pending', 'confirmed')
                       AND check_in_date < :check_out
                       AND check_out_date > :check_in
                     LIMIT 1"
                );
                $overlapStmt->execute([
                    'accommodation_id' => $accommodationId,
                    'check_in'         => $checkIn,
                    'check_out'        => $checkOut,
                ]);

                if ($overlapStmt->fetch()) {
                    $pdo->rollBack();
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Hindi na available ang accommodation na ito para sa napiling petsa. Pumili ng ibang petsa o accommodation.',
                    ]);
                    break;
                }

                $stmt = $pdo->prepare(
                    'INSERT INTO reservations
                        (code, user_id, accommodation_id, guest_name, guest_email, guest_phone,
                         check_in_date, check_out_date, number_of_guests, payment_method, total_amount, amount_paid,
                         reservation_status, payment_status, created_by, data)
                     VALUES
                        (:code, :user_id, :accommodation_id, :guest_name, :guest_email, :guest_phone,
                         :check_in_date, :check_out_date, :number_of_guests, :payment_method, :total_amount, :amount_paid,
                         :reservation_status, :payment_status, :created_by, :data)'
                );
                $stmt->execute([
                    'code'               => $code,
                    'user_id'            => $userIdForRow,
                    'accommodation_id'   => $accommodationId,
                    'guest_name'         => $guestName,
                    'guest_email'        => $guestEmail,
                    'guest_phone'        => $guestPhone,
                    'check_in_date'      => $checkIn,
                    'check_out_date'     => $checkOut,
                    'number_of_guests'   => $guestsCnt,
                    'payment_method'     => $payment,
                    'total_amount'       => $total,
                    'amount_paid'        => $amountPaid,
                    'reservation_status' => $status,
                    'payment_status'     => $payStatus,
                    'created_by'         => $isAdmin ? 'admin' : 'guest',
                    'data'               => $data !== null ? json_encode($data) : null,
                ]);
                $newId = (int)$pdo->lastInsertId();

                // A reservation always gets a matching payments row (per the ERD).
                $stmt = $pdo->prepare(
                    'INSERT INTO payments (reservation_id, payment_method, reference_number, amount, payment_status, payment_date)
                     VALUES (:reservation_id, :payment_method, :reference_number, :amount, :payment_status, :payment_date)'
                );
                $stmt->execute([
                    'reservation_id'   => $newId,
                    'payment_method'   => $payment,
                    'reference_number' => $code,
                    'amount'           => $amountPaid,
                    'payment_status'   => $payStatus,
                    'payment_date'     => $amountPaid > 0 ? date('Y-m-d H:i:s') : null,
                ]);

                $pdo->commit();
            } catch (PDOException $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Could not save the reservation. Please try again.']);
                break;
            }

            if ($isAdmin) {
                if ($userIdForRow) {
                    addNotification($pdo, $userIdForRow, 'guest', 'confirmation', 'Reservation Added', 'A reservation was created for you by Camp Mayagay staff.', $newId);
                }
            } else {
                addNotification($pdo, null, 'admin', 'booking', 'New booking received', $guestName . ' booked ' . $cabinName . '.', $newId);
                addNotification($pdo, $user['id'], 'guest', 'confirmation', 'Reservation Confirmation', 'Your reservation has been received and is pending confirmation.', $newId);
                addNotification($pdo, $user['id'], 'guest', 'payment', 'Payment Reminder', 'Your payment has been recorded.', $newId);
            }

            $stmt = $pdo->prepare(RESERVATION_SELECT . ' WHERE r.reservation_id = :id');
            $stmt->execute(['id' => $newId]);
            echo json_encode(['success' => true, 'reservation' => reservationRow($stmt->fetch())]);
            break;

        case 'reservations_update_status':
            requireModuleAccess($pdo, $user, 'reservation');
            $id     = (int)($input['id'] ?? 0);
            $status = (string)($input['status'] ?? '');
            $allowed = ['pending', 'confirmed', 'declined', 'cancelled', 'completed'];
            if (!$id || !in_array($status, $allowed, true)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Invalid id or status.']);
                break;
            }
            $pdo->prepare('UPDATE reservations SET reservation_status = :status WHERE reservation_id = :id')
                ->execute(['status' => $status, 'id' => $id]);

            // Payment status is no longer flipped to 'paid' just because a booking
            // is confirmed - it follows the amount actually paid (see payments_record).
            if ($status === 'declined' || $status === 'cancelled') {
                $pdo->prepare("UPDATE payments SET payment_status = 'refunded' WHERE reservation_id = :id")
                    ->execute(['id' => $id]);
                $pdo->prepare("UPDATE reservations SET payment_status = 'refunded' WHERE reservation_id = :id")
                    ->execute(['id' => $id]);
            }

            $stmt = $pdo->prepare(RESERVATION_SELECT . ' WHERE r.reservation_id = :id');
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();
            if ($row && $row['user_id']) {
                addNotification($pdo, (int)$row['user_id'], 'guest', 'confirmation', 'Reservation ' . ucfirst($status), 'Your reservation ' . $row['code'] . ' is now ' . $status . '.', $id);
            }
            echo json_encode(['success' => true, 'reservation' => $row ? reservationRow($row) : null]);
            break;

        case 'reservations_update':
            requireModuleAccess($pdo, $user, 'reservation');
            $id = (int)($input['id'] ?? 0);
            if (!$id) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Missing id.']); break; }

            $map = [
                'guest_name'     => 'guest_name',
                'guest_email'    => 'guest_email',
                'guest_phone'    => 'guest_phone',
                'check_in'       => 'check_in_date',
                'check_out'      => 'check_out_date',
                'payment_method' => 'payment_method',
            ];
            $fields = [];
            $params = ['id' => $id];
            foreach ($map as $inKey => $col) {
                if (isset($input[$inKey])) { $fields[] = "$col = :$col"; $params[$col] = $input[$inKey]; }
            }
            if (isset($input['guests_count'])) { $fields[] = 'number_of_guests = :number_of_guests'; $params['number_of_guests'] = (int)$input['guests_count']; }
            if (isset($input['total_amount'])) { $fields[] = 'total_amount = :total_amount'; $params['total_amount'] = (float)$input['total_amount']; }
            if (empty($fields)) { echo json_encode(['success' => false, 'message' => 'Nothing to update.']); break; }

            $sql = 'UPDATE reservations SET ' . implode(', ', $fields) . ' WHERE reservation_id = :id';
            $pdo->prepare($sql)->execute($params);

            $stmt = $pdo->prepare(RESERVATION_SELECT . ' WHERE r.reservation_id = :id');
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();
            if ($row && $row['user_id']) {
                addNotification($pdo, (int)$row['user_id'], 'guest', 'announcement', 'Reservation Updated', 'Your reservation ' . $row['code'] . ' details were updated.', $id);
            }
            echo json_encode(['success' => true, 'reservation' => $row ? reservationRow($row) : null]);
            break;

        case 'reservations_cancel':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'reservation');
            $id = (int)($input['id'] ?? 0);
            $reason = trim((string)($input['reason'] ?? ''));
            $stmt = $pdo->prepare('SELECT * FROM reservations WHERE reservation_id = :id');
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();
            if (!$row || ((int)$row['user_id'] !== $user['id'] && !isStaffOrAdmin($user))) {
                deny('Reservation not found.', 404);
            }
            if (in_array($row['reservation_status'], ['cancelled', 'declined', 'completed'], true)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'This reservation can no longer be cancelled.']);
                break;
            }
            if ($reason === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Please tell us why you want to cancel.']);
                break;
            }
            $pdo->prepare("UPDATE reservations SET cancel_requested = 1, cancel_reason = :reason WHERE reservation_id = :id")
                ->execute(['reason' => $reason, 'id' => $id]);
            addNotification($pdo, null, 'admin', 'booking', 'Cancellation requested', $row['guest_name'] . ' requested to cancel reservation ' . $row['code'] . '. Reason: ' . $reason, $id);
            $stmt = $pdo->prepare(RESERVATION_SELECT . ' WHERE r.reservation_id = :id');
            $stmt->execute(['id' => $id]);
            echo json_encode(['success' => true, 'reservation' => reservationRow($stmt->fetch())]);
            break;

        case 'reservations_approve_cancel':
            requireModuleAccess($pdo, $user, 'reservation');
            $id = (int)($input['id'] ?? 0);
            $stmt = $pdo->prepare('SELECT * FROM reservations WHERE reservation_id = :id');
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();
            if (!$row || !$row['cancel_requested']) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'No pending cancellation request for this reservation.']);
                break;
            }
            $pdo->prepare("UPDATE reservations SET reservation_status = 'cancelled', cancel_requested = 0 WHERE reservation_id = :id")->execute(['id' => $id]);
            $pdo->prepare("UPDATE payments SET payment_status = 'refunded' WHERE reservation_id = :id")->execute(['id' => $id]);
            $pdo->prepare("UPDATE reservations SET payment_status = 'refunded' WHERE reservation_id = :id")->execute(['id' => $id]);
            if ($row['user_id']) {
                addNotification($pdo, (int)$row['user_id'], 'guest', 'confirmation', 'Cancellation approved', 'Your reservation ' . $row['code'] . ' has been cancelled and your payment will be refunded.', $id);
            }
            $stmt = $pdo->prepare(RESERVATION_SELECT . ' WHERE r.reservation_id = :id');
            $stmt->execute(['id' => $id]);
            echo json_encode(['success' => true, 'reservation' => reservationRow($stmt->fetch())]);
            break;
            
        case 'reservations_reject_cancel':
            requireModuleAccess($pdo, $user, 'reservation');
            $id = (int)($input['id'] ?? 0);
            $stmt = $pdo->prepare('SELECT * FROM reservations WHERE reservation_id = :id');
            $stmt->execute(['id' => $id]);
            $row = $stmt->fetch();
            if (!$row || !$row['cancel_requested']) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'No pending cancellation request for this reservation.']);
                break;
            }
            $pdo->prepare("UPDATE reservations SET cancel_requested = 0, cancel_reason = NULL WHERE reservation_id = :id")->execute(['id' => $id]);
            if ($row['user_id']) {
                addNotification($pdo, (int)$row['user_id'], 'guest', 'announcement', 'Cancellation request declined', 'Your request to cancel reservation ' . $row['code'] . ' was declined. Your booking is still active.', $id);
            }
            $stmt = $pdo->prepare(RESERVATION_SELECT . ' WHERE r.reservation_id = :id');
            $stmt->execute(['id' => $id]);
            echo json_encode(['success' => true, 'reservation' => reservationRow($stmt->fetch())]);
            break;

        case 'reservations_delete':
            requireAdmin($user);
            $id = (int)($input['id'] ?? 0);
            $pdo->prepare('DELETE FROM reservations WHERE reservation_id = :id')->execute(['id' => $id]);
            echo json_encode(['success' => true]);
            break;

        /* ------------------------------------------------------------
           PAYMENTS
        ------------------------------------------------------------ */
        case 'payments_list':
            requireLogin($user);
            if (!isStaffOrAdmin($user)) deny('Admins and staff only.', 403);
            requireModuleAccess($pdo, $user, 'payments');
            ensureAmountPaidColumn($pdo);
            // One row per reservation: how much it costs, how much was paid,
            // and the balance. (The heavy `data` JSON / receipt image is not sent.)
            $stmt = $pdo->query(
                "SELECT r.reservation_id, r.code, r.guest_name, r.guest_email, r.guest_phone,
                        a.accommodation_name, r.check_in_date, r.check_out_date,
                        r.payment_method, r.total_amount, r.amount_paid, r.payment_status,
                        r.reservation_status, r.created_by, r.created_at,
                        (SELECT MAX(p.payment_date) FROM payments p WHERE p.reservation_id = r.reservation_id) AS last_payment_date
                 FROM reservations r
                 JOIN accommodations a ON a.accommodation_id = r.accommodation_id
                 ORDER BY r.created_at DESC"
            );
            $rows = array_map(function ($r) {
                $total = (float)$r['total_amount'];
                $paid  = (float)$r['amount_paid'];
                return [
                    'id'               => (int)$r['reservation_id'],
                    'code'             => $r['code'],
                    'guest_name'       => $r['guest_name'],
                    'guest_email'      => $r['guest_email'],
                    'cabin_name'       => $r['accommodation_name'],
                    'check_in'         => $r['check_in_date'],
                    'check_out'        => $r['check_out_date'],
                    'payment_method'   => $r['payment_method'],
                    'total_amount'     => $total,
                    'amount_paid'      => $paid,
                    'balance'          => $r['payment_status'] === 'refunded' ? 0.0 : max(0.0, $total - $paid),
                    'payment_status'   => $r['payment_status'],
                    'reservation_status' => $r['reservation_status'],
                    'source'           => $r['created_by'] === 'admin' ? 'walk-in' : 'website',
                    'last_payment_date'=> $r['last_payment_date'],
                    'created_at'       => $r['created_at'],
                ];
            }, $stmt->fetchAll());
            echo json_encode(['success' => true, 'payments' => $rows]);
            break;

        /** Staff/admin records money received for a reservation.
         *  Input: id + either `add_amount` (adds to what was paid),
         *  `amount_paid` (sets the total paid), or `mark_paid` = true (pays the balance in full). */
        case 'payments_record':
            requireLogin($user);
            if (!isStaffOrAdmin($user)) deny('Admins and staff only.', 403);
            requireModuleAccess($pdo, $user, 'payments');
            ensureAmountPaidColumn($pdo);
            $id = (int)($input['id'] ?? 0);
            $stmt = $pdo->prepare('SELECT reservation_id, total_amount, amount_paid, payment_status, payment_method, code FROM reservations WHERE reservation_id = :id');
            $stmt->execute(['id' => $id]);
            $res = $stmt->fetch();
            if (!$res) deny('Reservation not found.', 404);
            if ($res['payment_status'] === 'refunded') deny('This reservation was refunded; payments cannot be recorded.', 422);
            $total = (float)$res['total_amount'];
            $paid  = (float)$res['amount_paid'];
            if (!empty($input['mark_paid'])) {
                $newPaid = $total;
            } elseif (isset($input['add_amount'])) {
                $add = (float)$input['add_amount'];
                if ($add <= 0) deny('Enter an amount greater than 0.', 422);
                $newPaid = $paid + $add;
            } elseif (isset($input['amount_paid'])) {
                $newPaid = (float)$input['amount_paid'];
            } else {
                deny('Nothing to record.', 422);
            }
            if ($newPaid < 0) deny('Amount cannot be negative.', 422);
            if ($newPaid > $total + 0.004) deny('Amount exceeds the total of ' . number_format($total, 2) . '.', 422);
            $newPaid = min($newPaid, $total);
            $newStatus = paymentStatusFor($total, $newPaid);

            $pdo->beginTransaction();
            try {
                $pdo->prepare('UPDATE reservations SET amount_paid = :p, payment_status = :s WHERE reservation_id = :id')
                    ->execute(['p' => $newPaid, 's' => $newStatus, 'id' => $id]);
                $upd = $pdo->prepare('UPDATE payments SET amount = :p, payment_status = :s, payment_date = IF(:p2 > 0, NOW(), NULL) WHERE reservation_id = :id');
                $upd->execute(['p' => $newPaid, 's' => $newStatus, 'p2' => $newPaid, 'id' => $id]);
                if ($upd->rowCount() === 0) {
                    $chk = $pdo->prepare('SELECT COUNT(*) FROM payments WHERE reservation_id = :id');
                    $chk->execute(['id' => $id]);
                    if ((int)$chk->fetchColumn() === 0) {
                        $pdo->prepare('INSERT INTO payments (reservation_id, payment_method, reference_number, amount, payment_status, payment_date)
                                       VALUES (:id, :m, :c, :p, :s, IF(:p2 > 0, NOW(), NULL))')
                            ->execute(['id' => $id, 'm' => $res['payment_method'], 'c' => $res['code'], 'p' => $newPaid, 's' => $newStatus, 'p2' => $newPaid]);
                    }
                }
                $pdo->commit();
            } catch (PDOException $e) {
                $pdo->rollBack();
                deny('Could not record the payment.', 500);
            }
            echo json_encode([
                'success' => true,
                'id' => $id,
                'amount_paid' => $newPaid,
                'balance' => max(0.0, $total - $newPaid),
                'payment_status' => $newStatus,
            ]);
            break;

        /* ------------------------------------------------------------
           NOTIFICATIONS
        ------------------------------------------------------------ */
        case 'notifications_list':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'notifications');
            if (isStaffOrAdmin($user)) {
                $stmt = $pdo->query("SELECT * FROM notifications WHERE audience = 'admin' ORDER BY created_at DESC LIMIT 100");
            } else {
                $stmt = $pdo->prepare("SELECT * FROM notifications WHERE audience = 'guest' AND user_id = :uid ORDER BY created_at DESC LIMIT 100");
                $stmt->execute(['uid' => $user['id']]);
            }
            $rows = array_map(function ($n) {
                $n['id']          = (int)$n['notification_id'];
                $n['type']        = $n['notification_type'];
                $n['description'] = $n['message'];
                $n['is_read']     = $n['status'] === 'read' ? 1 : 0;
                $n['recipient']   = $n['recipient_email'];
                return $n;
            }, $stmt->fetchAll());
            echo json_encode(['success' => true, 'notifications' => $rows]);
            break;

        /** Admin composes a message from the "Add Message" button and sends
         *  it to all guests with a reservation, all staff accounts, a
         *  specific registered account, a specific reservation, or a custom
         *  email address. Creates a notification row for each recipient and
         *  emails them via mailer.php. */
        case 'notifications_send':
            requireModuleAccess($pdo, $user, 'notifications');
            $title = trim((string)($input['title'] ?? ''));
            $message = trim((string)($input['message'] ?? ''));
            $recipientType = (string)($input['recipient_type'] ?? '');
            if ($title === '' || $message === '') {
                deny('Title and message are required.', 422);
            }
            if ($recipientType === '') {
                deny('Please choose a recipient.', 422);
            }

            $targets = [];

            if ($recipientType === 'all') {
                $stmt = $pdo->query(
                    "SELECT DISTINCT r.user_id, r.guest_email, r.reservation_id
                     FROM reservations r WHERE r.guest_email IS NOT NULL AND r.guest_email <> ''"
                );
                $targets = $stmt->fetchAll();
            } elseif ($recipientType === 'all_staff') {
                $stmt = $pdo->query("SELECT user_id, email AS guest_email FROM users WHERE role = 'staff' AND email IS NOT NULL AND email <> ''");
                $targets = $stmt->fetchAll();
            } elseif ($recipientType === 'user') {
                $userId = (int)($input['user_id'] ?? 0);
                $stmt = $pdo->prepare('SELECT user_id, email AS guest_email FROM users WHERE user_id = :id LIMIT 1');
                $stmt->execute(['id' => $userId]);
                $u = $stmt->fetch();
                if (!$u) {
                    deny('That user could not be found.', 404);
                }
                $targets = [$u];
            } elseif ($recipientType === 'reservation') {
                $reservationId = (int)($input['reservation_id'] ?? 0);
                $stmt = $pdo->prepare(
                    'SELECT user_id, guest_email, reservation_id FROM reservations WHERE reservation_id = :id LIMIT 1'
                );
                $stmt->execute(['id' => $reservationId]);
                $targets = $stmt->fetchAll();
                if (!$targets) {
                    deny('That reservation could not be found.', 404);
                }
            } elseif ($recipientType === 'email') {
                $customEmail = trim((string)($input['custom_email'] ?? ''));
                if ($customEmail === '' || !filter_var($customEmail, FILTER_VALIDATE_EMAIL)) {
                    deny('Enter a valid email address.', 422);
                }
                $targets = [['user_id' => null, 'guest_email' => $customEmail, 'reservation_id' => null]];
            } else {
                deny('Please choose a recipient.', 422);
            }

            $queued = [];
            foreach ($targets as $t) {
                $notifId = addNotification(
                    $pdo,
                    isset($t['user_id']) && $t['user_id'] !== null ? (int)$t['user_id'] : null,
                    'guest',
                    'announcement',
                    $title,
                    $message,
                    isset($t['reservation_id']) && $t['reservation_id'] !== null ? (int)$t['reservation_id'] : null,
                    $t['guest_email'] ?? null
                );
                $queued[] = ['notification_id' => $notifId, 'email' => $t['guest_email'] ?? null];
            }

            addNotification(
                $pdo,
                null,
                'admin',
                'announcement',
                $title,
                $message . ' (Sent to ' . count($targets) . ' recipient' . (count($targets) === 1 ? '' : 's') . ')'
            );

            respondNow(['success' => true, 'queued' => count($targets)]);

            require_once __DIR__ . '/mailer.php';
            foreach ($queued as $q) {
                $status = 'failed';
                if (!empty($q['email'])) {
                    $mailError = null;
                    if (sendNotificationEmail($q['email'], $title, $message, $mailError)) {
                        $status = 'sent';
                    } else {
                        error_log('notifications_send mail error: ' . $mailError);
                    }
                }
                $pdo->prepare('UPDATE notifications SET email_status = :status WHERE notification_id = :id')
                    ->execute(['status' => $status, 'id' => $q['notification_id']]);
            }
            break;

        case 'notifications_mark_read':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'notifications');
            $ids = $input['ids'] ?? null;
            if (isStaffOrAdmin($user)) {
                if ($ids) {
                    $in = implode(',', array_fill(0, count($ids), '?'));
                    $pdo->prepare("UPDATE notifications SET status = 'read' WHERE audience = 'admin' AND notification_id IN ($in)")->execute(array_map('intval', $ids));
                } else {
                    $pdo->exec("UPDATE notifications SET status = 'read' WHERE audience = 'admin'");
                }
            } else {
                if ($ids) {
                    $in = implode(',', array_fill(0, count($ids), '?'));
                    $params = array_merge(array_map('intval', $ids), [$user['id']]);
                    $pdo->prepare("UPDATE notifications SET status = 'read' WHERE audience = 'guest' AND notification_id IN ($in) AND user_id = ?")->execute($params);
                } else {
                    $pdo->prepare("UPDATE notifications SET status = 'read' WHERE audience = 'guest' AND user_id = ?")->execute([$user['id']]);
                }
            }
            echo json_encode(['success' => true]);
            break;

        case 'notifications_mark_unread':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'notifications');
            $ids = $input['ids'] ?? null;
            if ($ids && is_array($ids)) {
                $in = implode(',', array_fill(0, count($ids), '?'));
                if (isStaffOrAdmin($user)) {
                    $pdo->prepare("UPDATE notifications SET status = 'unread' WHERE audience = 'admin' AND notification_id IN ($in)")->execute(array_map('intval', $ids));
                } else {
                    $params = array_merge(array_map('intval', $ids), [$user['id']]);
                    $pdo->prepare("UPDATE notifications SET status = 'unread' WHERE audience = 'guest' AND notification_id IN ($in) AND user_id = ?")->execute($params);
                }
            }
            echo json_encode(['success' => true]);
            break;

        case 'notifications_delete':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'notifications');
            $ids = $input['ids'] ?? null;
            // Staff share the admin notifications, so only an admin may wipe them all at once.
            if ((!$ids || !is_array($ids)) && $user['role'] === 'staff') {
                deny('Only an admin can delete all notifications at once.', 403);
            }
            if (isStaffOrAdmin($user)) {
                if ($ids) {
                    $in = implode(',', array_fill(0, count($ids), '?'));
                    $pdo->prepare("DELETE FROM notifications WHERE audience = 'admin' AND notification_id IN ($in)")->execute(array_map('intval', $ids));
                } else {
                    $pdo->exec("DELETE FROM notifications WHERE audience = 'admin'");
                }
            } else {
                if ($ids) {
                    $in = implode(',', array_fill(0, count($ids), '?'));
                    $params = array_merge(array_map('intval', $ids), [$user['id']]);
                    $pdo->prepare("DELETE FROM notifications WHERE audience = 'guest' AND notification_id IN ($in) AND user_id = ?")->execute($params);
                } else {
                    $pdo->prepare("DELETE FROM notifications WHERE audience = 'guest' AND user_id = ?")->execute([$user['id']]);
                }
            }
            echo json_encode(['success' => true]);
            break;

        /* ------------------------------------------------------------
           FEEDBACK / CONCERNS
        ------------------------------------------------------------ */
        case 'feedback_list':
            requireLogin($user);
            $seeAllFeedback = $user['role'] === 'admin'
                || ($user['role'] === 'staff' && !empty(getPermissionsForRole($pdo, 'staff')['feedback']));
            if ($seeAllFeedback) {
                $stmt = $pdo->query(
                    "SELECT fc.*, a.accommodation_name
                     FROM feedback_concerns fc
                     LEFT JOIN accommodations a ON a.accommodation_id = fc.accommodation_id
                     ORDER BY fc.submitted_at DESC"
                );
            } else {
                $stmt = $pdo->prepare(
                    "SELECT fc.*, a.accommodation_name
                     FROM feedback_concerns fc
                     LEFT JOIN accommodations a ON a.accommodation_id = fc.accommodation_id
                     WHERE fc.user_id = :uid ORDER BY fc.submitted_at DESC"
                );
                $stmt->execute(['uid' => $user['id']]);
            }
            echo json_encode(['success' => true, 'feedback' => $stmt->fetchAll()]);
            break;

        /** Admin/staff view of everything sent to guests: replies to their
         *  feedback and messages from the "Add Message" composer. */
        case 'sent_messages_list':
            requireLogin($user);
            requireModuleAccess($pdo, $user, 'feedback');
            $stmt = $pdo->query(
                "SELECT n.notification_id, n.user_id, n.title, n.message, n.notification_type,
                        n.recipient_email, n.email_status, n.status, n.created_at,
                        TRIM(CONCAT(u.firstname, ' ', u.lastname)) AS guest_name,
                        u.email AS user_email
                 FROM notifications n
                 LEFT JOIN users u ON u.user_id = n.user_id
                 WHERE n.audience = 'guest' AND n.notification_type IN ('announcement', 'feedback')
                 ORDER BY n.created_at DESC, n.notification_id DESC
                 LIMIT 300"
            );
            $rows = array_map(function ($n) {
                return [
                    'id'          => (int)$n['notification_id'],
                    'guest_name'  => $n['guest_name'] ?: 'Guest',
                    'email'       => $n['recipient_email'] ?: ($n['user_email'] ?? ''),
                    'kind'        => $n['notification_type'] === 'feedback' ? 'reply' : 'message',
                    'title'       => $n['title'],
                    'message'     => $n['message'],
                    'email_status'=> $n['email_status'],
                    'seen'        => $n['status'] === 'read',
                    'created_at'  => $n['created_at'],
                ];
            }, $stmt->fetchAll());
            echo json_encode(['success' => true, 'messages' => $rows]);
            break;

        case 'feedback_public_list':
            // Public-facing reviews feed - any logged-in guest/staff/admin can
            // see what OTHER guests said about their stay. Only approved
            // "feedback" entries are shown here (not private "concern"
            // reports), and the guest's name is shortened to first name +
            // last initial for privacy.
            requireLogin($user);
            $stmt = $pdo->query(
                "SELECT fc.feedback_id, fc.rating, fc.message, fc.submitted_at, fc.guest_name,
                        fc.accommodation_id, a.accommodation_name
                 FROM feedback_concerns fc
                 LEFT JOIN accommodations a ON a.accommodation_id = fc.accommodation_id
                 WHERE fc.category = 'feedback'
                 ORDER BY fc.submitted_at DESC
                 LIMIT 100"
            );
            $rows = $stmt->fetchAll();
            foreach ($rows as &$row) {
                $nameParts = preg_split('/\s+/', trim((string)$row['guest_name']));
                $first = $nameParts[0] ?? 'Guest';
                $lastInitial = isset($nameParts[1]) && $nameParts[1] !== '' ? strtoupper($nameParts[1][0]) . '.' : '';
                $row['guest_display_name'] = trim($first . ' ' . $lastInitial);
                unset($row['guest_name']);
            }
            unset($row);
            echo json_encode(['success' => true, 'feedback' => $rows]);
            break;

        case 'feedback_create':
            requireLogin($user);
            $rating   = max(1, min(5, (int)($input['rating'] ?? 5)));
            $message  = trim((string)($input['message'] ?? ''));
            $subject  = trim((string)($input['subject'] ?? 'Guest feedback'));
            $categoryInput = (string)($input['category'] ?? 'feedback');
            $category = in_array($categoryInput, ['feedback', 'concern'], true) ? $categoryInput : 'feedback';
            $accommodationId = isset($input['accommodation_id']) && $input['accommodation_id'] !== '' ? (int)$input['accommodation_id'] : null;
            if ($message === '') { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Message is required.']); break; }
            $guestName = trim((string)($user['firstname'] ?? '') . ' ' . (string)($user['lastname'] ?? ''));
            if ($guestName === '') $guestName = $user['username'] ?? 'Guest';
            $accommodationName = null;
            if ($accommodationId) {
                try {
                    $accStmt = $pdo->prepare('SELECT accommodation_name FROM accommodations WHERE accommodation_id = :id');
                    $accStmt->execute(['id' => $accommodationId]);
                    $accommodationName = $accStmt->fetchColumn() ?: null;
                    if (!$accommodationName) $accommodationId = null; // ignore unknown/stale ids
                } catch (\Throwable $e) {
                    error_log('[camp-mayagay/api.php] feedback_create accommodation lookup failed: ' . $e->getMessage());
                    $accommodationId = null;
                    $accommodationName = null;
                }
            }
            // Ito ang pangunahing pag-save ng feedback - dapat gumana ito
            // kahit mabigo ang notification sa ibaba, kaya hiwalay ito sa
            // try/catch ng addNotification() (hindi dapat ma-block ang
            // pag-save ng feedback dahil lang sa hindi pag-send ng
            // notification sa admin).
            $stmt = $pdo->prepare(
                'INSERT INTO feedback_concerns (user_id, accommodation_id, guest_name, subject, message, category, rating)
                 VALUES (:uid, :accommodation_id, :name, :subject, :message, :category, :rating)'
            );
            $stmt->execute([
                'uid' => $user['id'],
                'accommodation_id' => $accommodationId,
                'name' => $guestName,
                'subject' => $subject,
                'message' => $message,
                'category' => $category,
                'rating' => $rating
            ]);
            try {
                $notifMessage = $guestName . ' left a ' . $rating . '-star review' . ($accommodationName ? ' for ' . $accommodationName : '') . '.';
                addNotification($pdo, null, 'admin', 'feedback', 'New feedback received', $notifMessage);
            } catch (\Throwable $e) {
                // Huwag hayaang mabigo ang feedback save kung may problema
                // lang sa notifications table (hal. hindi pa na-import ang
                // migration na nagdaragdag ng recipient_email/email_status
                // na column) - naka-save na ang feedback bago pa man dito.
                error_log('[camp-mayagay/api.php] feedback_create addNotification failed: ' . $e->getMessage());
                try {
                    // Ayusin ang table kung lumang bersyon (ENUM) ang notification_type, tapos ulitin
                    $pdo->exec("ALTER TABLE notifications MODIFY notification_type VARCHAR(30) NOT NULL DEFAULT 'announcement'");
                    addNotification($pdo, null, 'admin', 'feedback', 'New feedback received', $notifMessage);
                } catch (\Throwable $e2) {
                    error_log('[camp-mayagay/api.php] feedback_create retry failed: ' . $e2->getMessage());
                    // Huling backup: type na 'announcement' para siguradong dumating
                    try {
                        $pdo->prepare("INSERT INTO notifications (user_id, audience, notification_type, title, message) VALUES (NULL, 'admin', 'announcement', 'New feedback received', :m)")
                            ->execute(['m' => $notifMessage]);
                    } catch (\Throwable $e3) {
                        error_log('[camp-mayagay/api.php] feedback_create last backup failed: ' . $e3->getMessage());
                    }
                }
            }
            echo json_encode(['success' => true]);
            break;

        case 'feedback_respond':
            requireModuleAccess($pdo, $user, 'feedback');
            $id       = (int)($input['id'] ?? 0);
            $response = trim((string)($input['response'] ?? ''));
            if (!$id) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Missing id.']); break; }

            $pdo->prepare("UPDATE feedback_concerns SET response = :response, status = 'closed' WHERE feedback_id = :id")
                ->execute(['response' => $response, 'id' => $id]);

            // Tell the guest a response has arrived - without this, the
            // reply only ever sat in the database and the guest had no
            // way of knowing it exists.
            $fbStmt = $pdo->prepare(
                'SELECT fc.user_id, fc.subject, u.email
                 FROM feedback_concerns fc
                 LEFT JOIN users u ON u.user_id = fc.user_id
                 WHERE fc.feedback_id = :id LIMIT 1'
            );
            $fbStmt->execute(['id' => $id]);
            $fbRow = $fbStmt->fetch();

            if ($fbRow && $fbRow['user_id']) {
                addNotification(
                    $pdo,
                    (int)$fbRow['user_id'],
                    'guest',
                    'feedback',
                    'Response to your feedback',
                    $response !== '' ? $response : 'Camp Mayagay has responded to your feedback.'
                );

                if (!empty($fbRow['email'])) {
                    require_once __DIR__ . '/mailer.php';
                    $mailError = null;
                    sendNotificationEmail(
                        $fbRow['email'],
                        'Response to your feedback: ' . ($fbRow['subject'] ?: 'Camp Mayagay'),
                        $response,
                        $mailError
                    );
                }
            }

            echo json_encode(['success' => true]);
            break;

        case 'feedback_delete':
            requireAdmin($user);
            $id = (int)($input['id'] ?? 0);
            $pdo->prepare('DELETE FROM feedback_concerns WHERE feedback_id = :id')->execute(['id' => $id]);
            echo json_encode(['success' => true]);
            break;

        /* ------------------------------------------------------------
           REPORTS
        ------------------------------------------------------------ */
        case 'reports_list':
            requireModuleAccess($pdo, $user, 'reports');
            $stmt = $pdo->query('SELECT * FROM reports ORDER BY created_at DESC');
            echo json_encode(['success' => true, 'reports' => $stmt->fetchAll()]);
            break;

        case 'reports_create':
            requireModuleAccess($pdo, $user, 'reports');
            $type = trim((string)($input['report_type'] ?? 'summary'));
            $desc = trim((string)($input['description'] ?? ''));
            $stmt = $pdo->prepare(
                'INSERT INTO reports (user_id, report_type, generated_date, description)
                 VALUES (:uid, :type, CURDATE(), :desc)'
            );
            $stmt->execute(['uid' => $user['id'], 'type' => $type, 'desc' => $desc]);
            echo json_encode(['success' => true, 'report_id' => (int)$pdo->lastInsertId()]);
            break;

        /** Logged automatically whenever the Reports page finishes
         *  building the Detailed Reports summary, so there's a saved
         *  history AND an admin notification for every report generated. */
        case 'reports_generate':
            requireModuleAccess($pdo, $user, 'reports');
            $totalReservations  = (int)($input['total_reservations'] ?? 0);
            $totalRevenue       = (float)($input['total_revenue'] ?? 0);
            $totalFeedback      = (int)($input['total_feedback'] ?? 0);
            $accommodationCount = (int)($input['accommodation_count'] ?? 0);

            $description = 'Reservations: ' . $totalReservations
                . ', Revenue: ₱' . number_format($totalRevenue, 2)
                . ', Accommodations: ' . $accommodationCount
                . ', Feedback entries: ' . $totalFeedback;

            $stmt = $pdo->prepare(
                'INSERT INTO reports (user_id, report_type, generated_date, description)
                 VALUES (:uid, :type, CURDATE(), :desc)'
            );
            $stmt->execute(['uid' => $user['id'], 'type' => 'Detailed Summary', 'desc' => $description]);

            addNotification($pdo, null, 'admin', 'announcement', 'Detailed Report Generated', $description);

            echo json_encode(['success' => true]);
            break;

        /* ------------------------------------------------------------
           SECURITY LOGS
        ------------------------------------------------------------ */
        case 'security_logs_list':
            requireAdmin($user);
            $stmt = $pdo->query(
                "SELECT sl.*, u.username,
                        TRIM(CONCAT(u.firstname, ' ', u.lastname)) AS full_name,
                        u.role AS user_role
                 FROM security_logs sl
                 LEFT JOIN users u ON u.user_id = sl.user_id
                 ORDER BY sl.log_id DESC LIMIT 200"
            );
            $rows = $stmt->fetchAll();
            $logs = array_map(function ($row) {
                return [
                    'log_id'      => (int)$row['log_id'],
                    'login_id'    => 'LOG-' . str_pad((string)$row['log_id'], 4, '0', STR_PAD_LEFT),
                    'user_id'     => $row['user_id'] !== null ? (int)$row['user_id'] : null,
                    'user'        => $row['full_name'] ?: 'Unknown User',
                    'username'    => $row['username'],
                    'role'        => $row['user_role'] ? ucfirst($row['user_role']) : 'Unknown',
                    'activity'    => $row['activity'],
                    'status'      => $row['status'],
                    'device'      => $row['device_info'] ?: 'Unknown Device',
                    'location'    => (($row['location'] ?? '') !== '' && $row['location'] !== 'Unknown') ? $row['location'] : (!empty($row['ip_address']) ? 'IP ' . $row['ip_address'] : 'Unknown'),
                    'location_lat' => $row['location_lat'] !== null ? (float)$row['location_lat'] : null,
                    'location_lng' => $row['location_lng'] !== null ? (float)$row['location_lng'] : null,
                    'ip_address'  => $row['ip_address'],
                    'login_time'  => $row['login_time'],
                    'created_at'  => $row['created_at'],
                ];
            }, $rows);
            echo json_encode(['success' => true, 'logs' => $logs]);
            break;

        /* ------------------------------------------------------------
           GUEST RECORDS (aggregated from reservations + users)
        ------------------------------------------------------------ */
        case 'guests_list':
            requireModuleAccess($pdo, $user, 'guest_record');
            $stmt = $pdo->query(
                "SELECT
                    COALESCE(r.user_id, 0)                AS user_id,
                    r.guest_name                            AS guest_name,
                    COALESCE(r.guest_email, '')             AS guest_email,
                    COUNT(*)                                AS total_bookings,
                    MAX(r.check_in_date)                    AS last_reservation,
                    u.status                                AS account_status
                 FROM reservations r
                 LEFT JOIN users u ON u.user_id = r.user_id
                 GROUP BY COALESCE(r.user_id, 0), r.guest_name, r.guest_email, u.status
                 ORDER BY last_reservation DESC"
            );
            $rows = $stmt->fetchAll();
            $guests = array_map(function ($g, $i) {
                return [
                    'guest_id'         => 'GST-' . str_pad((string)($i + 1), 4, '0', STR_PAD_LEFT),
                    'user_id'          => (int)$g['user_id'],
                    'guest_name'       => $g['guest_name'],
                    'guest_email'      => $g['guest_email'],
                    'total_bookings'   => (int)$g['total_bookings'],
                    'last_reservation' => $g['last_reservation'],
                    'status'           => $g['account_status'] === 'disabled' ? 'inactive' : 'active',
                ];
            }, $rows, array_keys($rows));
            echo json_encode(['success' => true, 'guests' => $guests]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Unknown action.']);
    }
} catch (PDOException $e) {
    error_log('[camp-mayagay/api.php] action=' . $action . ' PDOException: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
