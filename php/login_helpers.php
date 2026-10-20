<?php

declare(strict_types=1);

/** Turns a raw User-Agent string into a short "OS/Browser" label,
 *  e.g. "Windows/Chrome", "Android/Chrome", "iPhone/Safari". */
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

/** Validates a password against the "Password Policy" Account Security
 *  setting. When the policy is on, requires 8+ chars with at least one
 *  uppercase letter, one lowercase letter, and one number. Returns null
 *  when valid, or an error message string when invalid. */
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

/** Reads every row from system_settings into an assoc array with sane
 *  defaults, so callers never have to worry about a missing table/row
 *  (e.g. before the migration has been run). */
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

/** Best-effort IP -> city/region/coordinates lookup using the free
 *  ip-api.com service. Falls back gracefully (never throws) so login
 *  never breaks if the lookup fails or the server has no outbound
 *  internet access.
 *
 *  Returns ['label' => string, 'lat' => ?float, 'lng' => ?float].
 *  'lat'/'lng' are null whenever a real position can't be determined
 *  (e.g. on localhost/LAN, or if the lookup fails) - the admin UI
 *  shows "No location on file" for the map in that case instead of
 *  plotting a wrong point. */
function detectLoginLocation(?string $ip): array
{
    if (!$ip) {
        return ['label' => 'Unknown', 'lat' => null, 'lng' => null];
    }
    if (in_array($ip, ['127.0.0.1', '::1'], true) || strpos($ip, '192.168.') === 0 || strpos($ip, '10.') === 0) {
        // Localhost/LAN: the browser's own IP is private, so ask ip-api
        // about the server's PUBLIC IP instead (empty IP = caller's IP).
        // That gives the general area (city level) of the network.
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

/** ip-api lookup helper. Coordinates are rounded to 2 decimals (~1 km)
 *  so the pin only shows the general area, never an exact address. */
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

/** Uses the position the browser shared (GPS/Wi-Fi, with the user's
 *  permission) instead of the IP-based guess. Coordinates are rounded to
 *  2 decimals (~1 km) so only the general area is stored, never an exact
 *  address. The place name comes from OpenStreetMap's reverse lookup at
 *  city/barangay level. Returns null when no valid position was sent. */
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
