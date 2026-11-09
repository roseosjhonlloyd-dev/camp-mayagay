<?php
// Router for the PHP built-in server: pages, scripts and styles are always re-checked by the
// browser, so a new deploy shows up right away instead of an old cached copy.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
if ($path === '/') $path = '/index.html';
$file = realpath(__DIR__ . $path);
if ($file !== false && strpos($file, __DIR__ . DIRECTORY_SEPARATOR) === 0 && is_file($file)
    && preg_match('/\.(html|js|css)$/i', $file, $m)) {
    $types = ['html' => 'text/html; charset=utf-8', 'js' => 'application/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8'];
    header('Content-Type: ' . $types[strtolower($m[1])]);
    header('Cache-Control: no-cache, must-revalidate');
    readfile($file);
    return true;
}
return false;   // everything else (PHP files, images, uploads) is handled normally
