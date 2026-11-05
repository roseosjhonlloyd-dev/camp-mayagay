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
        header('Location: ../index.html');
        exit;
    }
}

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