<?php

declare(strict_types=1);


function detectDeviceInfo(string $userAgent): string
{
    if ($userAgent === '') {
        return 'Unknown Device';
    }

    if (preg_match('/Android/i', $userAgent)) {
        $os = 'Android';
    } elseif (preg_match('/iPhone/i', $userAgent)) {
        $os = 'iPhone';
    } elseif (preg_match('/iPad/i', $userAgent)) {
        $os = 'iPad';
    } elseif (preg_match('/Macintosh|Mac OS X/i', $userAgent)) {
        $os = 'Mac';
    } elseif (preg_match('/Windows/i', $userAgent)) {
        $os = 'Windows';
    } elseif (preg_match('/Linux/i', $userAgent)) {
        $os = 'Linux';
    } else {
        $os = 'Unknown OS';
    }

    if (preg_match('/Edg\//i', $userAgent)) {
        $browser = 'Edge';
    } elseif (preg_match('/OPR\/|Opera/i', $userAgent)) {
        $browser = 'Opera';
    } elseif (preg_match('/Chrome\//i', $userAgent) && !preg_match('/Chromium/i', $userAgent)) {
        $browser = 'Chrome';
    } elseif (preg_match('/CriOS/i', $userAgent)) {
        $browser = 'Chrome';
    } elseif (preg_match('/Firefox\//i', $userAgent)) {
        $browser = 'Firefox';
    } elseif (preg_match('/Safari\//i', $userAgent)) {
        $browser = 'Safari';
    } else {
        $browser = 'Unknown Browser';
    }

    return $os . '/' . $browser;
}


function validatePasswordPolicy(string $password, bool $policyEnabled): ?string
{
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (!$policyEnabled) {
        return null;
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must include at least one uppercase letter.';
    }
    if (!preg_match('/[a-z]/', $password)) {
        return 'Password must include at least one lowercase letter.';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'Password must include at least one number.';
    }
    return null;
}

function getSystemSettings(PDO $pdo): array
{
    $defaults = [
        'two_factor_enabled'       => '1',
        'activity_logging_enabled' => '1',
        'password_policy_enabled'  => '1',
        'session_timeout_minutes'  => '30',
        'login_attempt_limit'      => '5',
    ];
    try {
        $stmt = $pdo->query('SELECT setting_key, setting_value FROM system_settings');
        foreach ($stmt->fetchAll() as $row) {
            $defaults[$row['setting_key']] = $row['setting_value'];
        }
    } catch (PDOException $e) {
        // Table not migrated yet on this DB - just use the defaults above.
    }
    return $defaults;
}


function detectLoginLocation(?string $ip): array
{
    if (!$ip) {
        return ['label' => 'Unknown', 'lat' => null, 'lng' => null];
    }
    $isPrivate = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false
        || (bool)preg_match('/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./', $ip);
    if (in_array($ip, ['127.0.0.1', '::1'], true) || $isPrivate) {

        $area = lookupIpArea('');
        if ($area) {
            $area['label'] = 'Local Network - ' . $area['label'];
            return $area;
        }
        return ['label' => 'Local Network (IP ' . $ip . ')', 'lat' => null, 'lng' => null];
    }

    $area = lookupIpArea($ip);
    // If every lookup fails, show the IP address itself instead of "Unknown".
    return $area ?: ['label' => 'IP ' . $ip, 'lat' => null, 'lng' => null];
}


function lookupIpArea(string $ip): ?array
{
    $context = stream_context_create(['http' => ['timeout' => 2]]);
    $response = @file_get_contents(
        'http://ip-api.com/json/' . urlencode($ip) . '?fields=status,city,regionName,country,lat,lon',
        false,
        $context
    );
    $data = $response !== false ? json_decode($response, true) : null;
    if (!is_array($data) || ($data['status'] ?? '') !== 'success') {
        // Backup provider (HTTPS) when ip-api is down, rate-limited or blocked.
        $r2 = @file_get_contents('https://ipwho.is/' . urlencode($ip), false, $context);
        $d2 = $r2 !== false ? json_decode($r2, true) : null;
        if (!is_array($d2) || empty($d2['success'])) {
            return null;
        }
        $parts = array_filter([$d2['city'] ?? '', $d2['region'] ?? '', $d2['country'] ?? '']);
        return [
            'label' => $parts ? implode(', ', $parts) : 'Unknown',
            'lat'   => isset($d2['latitude']) ? round((float)$d2['latitude'], 2) : null,
            'lng'   => isset($d2['longitude']) ? round((float)$d2['longitude'], 2) : null,
        ];
    }

    $parts = array_filter([$data['city'] ?? '', $data['regionName'] ?? '', $data['country'] ?? '']);
    return [
        'label' => $parts ? implode(', ', $parts) : 'Unknown',
        'lat'   => isset($data['lat']) ? round((float)$data['lat'], 2) : null,
        'lng'   => isset($data['lon']) ? round((float)$data['lon'], 2) : null,
    ];
}

function resolveClientLocation(array $input): ?array
{
    $lat = $input['client_lat'] ?? null;
    $lng = $input['client_lng'] ?? null;
    if (!is_numeric($lat) || !is_numeric($lng)) return null;
    $lat = round((float)$lat, 2);
    $lng = round((float)$lng, 2);
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) return null;

    $label = null;
    $ctx = stream_context_create(['http' => [
        'timeout' => 3,
        'header'  => "User-Agent: CampMayagay/1.0\r\n",
    ]]);
    $json = @file_get_contents(
        'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=en&lat=' . $lat . '&lon=' . $lng,
        false,
        $ctx
    );
    if ($json !== false) {
        $d = json_decode($json, true);
        $a = is_array($d) ? ($d['address'] ?? []) : [];
        $parts = array_filter([
            $a['city'] ?? ($a['town'] ?? ($a['municipality'] ?? ($a['suburb'] ?? ''))),
            $a['state'] ?? ($a['region'] ?? ''),
            $a['country'] ?? '',
        ]);
        if ($parts) $label = implode(', ', array_unique($parts));
    }
    if (!$label) $label = 'Near ' . $lat . ', ' . $lng;

    return ['label' => $label, 'lat' => $lat, 'lng' => $lng];
}
