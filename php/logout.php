<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

if (isLoggedIn()) {
    // Reuse the device/location of this user's latest login so the logout
    // row isn't shown as "Unknown Device / Unknown".
    $last = $pdo->prepare(
        "SELECT device_info, location, location_lat, location_lng FROM security_logs
         WHERE user_id = :uid AND activity IN ('login', 'signup')
         ORDER BY log_id DESC LIMIT 1"
    );
    $last->execute(['uid' => $_SESSION['user_id']]);
    $prev = $last->fetch() ?: [];
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $pdo->prepare(
        "INSERT INTO security_logs (user_id, activity, ip_address, device_info, location, location_lat, location_lng, logout_time, status)
         VALUES (:uid, 'logout', :ip, :device, :location, :lat, :lng, NOW(), 'success')"
    )->execute([
        'uid'      => $_SESSION['user_id'],
        'ip'       => $ip,
        'device'   => $prev['device_info'] ?? null,
        'location' => ($prev['location'] ?? null) ?: ($ip ? 'IP ' . $ip : null),
        'lat'      => $prev['location_lat'] ?? null,
        'lng'      => $prev['location_lng'] ?? null,
    ]);
}

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly']
    );
}

session_destroy();

header('Location: ../Login.html');       
exit;
