<?php

declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/**
 * Sends the JSON response to the browser right away, then lets the
 * script keep running afterward (e.g. to send a slow SMTP email)
 * without the browser waiting for that part. This is what makes the
 * 2FA code send and Verify/Reject notifications feel instant instead
 * of taking several seconds. Also releases the session file lock so
 * other requests from the same tab aren't blocked meanwhile.
 */
function respondNow(array $payload): void
{
    if (ob_get_level() === 0) {
        ob_start();
    }
    echo json_encode($payload);
    $size = ob_get_length();
    header('Content-Length: ' . $size);
    header('Connection: close');
    ignore_user_abort(true);
    ob_end_flush();
    flush();
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }
}

function isLoggedIn(): bool
{
    if (!isset($_SESSION['user_id'], $_SESSION['role'])) {
        return false;
    }

    // Enforce the "Session Timeout" Account Security setting: auto
    // logout after N minutes of inactivity. Falls back to 30 minutes
    // if the setting can't be read (e.g. DB not reachable here).
    $timeoutMinutes = 30;
    if (isset($GLOBALS['pdo'])) {
        try {
            $stmt = $GLOBALS['pdo']->prepare('SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1');
            $stmt->execute(['k' => 'session_timeout_minutes']);
            $val = $stmt->fetchColumn();
            if ($val !== false && (int)$val > 0) {
                $timeoutMinutes = (int)$val;
            }
        } catch (\Throwable $e) {
            // ignore - use default above
        }
    }

    $lastActivity = $_SESSION['last_activity'] ?? null;
    if ($lastActivity && (time() - $lastActivity) > ($timeoutMinutes * 60)) {
        $_SESSION = [];
        session_destroy();
        return false;
    }

    $_SESSION['last_activity'] = time();
    return true;
}

function requireRole(string $role): void
{
    if (!isLoggedIn() || $_SESSION['role'] !== $role) {
        header('Location: ../Login.html');
        exit;
    }
}

/**
 * Basic info about the logged-in user, straight from the session
 * (no DB hit). Returns null if nobody is logged in.
 */
function currentUser(): ?array
{
    if (!isLoggedIn()) {
        return null;
    }
    return [
        'id'             => (int)$_SESSION['user_id'],
        'role'           => $_SESSION['role'],
        'username'       => $_SESSION['username'] ?? '',
        'firstname'      => $_SESSION['firstname'] ?? '',
        'lastname'       => $_SESSION['lastname'] ?? '',
        'email'          => $_SESSION['email'] ?? '',
        'contact_number' => $_SESSION['contact_number'] ?? '',
        'address'        => $_SESSION['address'] ?? '',
        'profile_image'  => $_SESSION['profile_image'] ?? null,
        'valid_id_image' => $_SESSION['valid_id_image'] ?? null,
        'id_verification_status' => $_SESSION['id_verification_status'] ?? 'not_submitted',
    ];
}