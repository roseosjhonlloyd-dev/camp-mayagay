<?php
/**
 * verify_signup_email.php - opened from the "Verify my email" button in the
 * sign-up email. Marks the email as verified; the Sign Up page (still open in
 * the guest's browser) notices this on its own and turns green.
 */
declare(strict_types=1);
ini_set('display_errors', '0');

require_once __DIR__ . '/db.php';

$token = (string)($_GET['token'] ?? '');
$ok = false;
if (preg_match('/^[a-f0-9]{48}$/', $token)) {
    try {
        $st = $pdo->prepare('SELECT id, verified_at FROM signup_email_verifications WHERE token_hash = :h AND expires_at > NOW() LIMIT 1');
        $st->execute(['h' => hash('sha256', $token)]);
        $row = $st->fetch();
        if ($row) {
            if ($row['verified_at'] === null) {
                $pdo->prepare('UPDATE signup_email_verifications SET verified_at = NOW() WHERE id = :id')
                    ->execute(['id' => (int)$row['id']]);
            }
            $ok = true;
        }
    } catch (Throwable $e) {
        $ok = false;
    }
}

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store');
$title = $ok ? 'Email verified' : 'Link not valid';
$text  = $ok
    ? 'Your email is verified. Go back to the Sign Up page &mdash; it will update by itself and you can finish creating your account.'
    : 'This verification link is invalid or has expired. Go back to the Sign Up page and press Verify again to get a new email.';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= $title ?> | Camp Mayagay</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: 'Inter', Arial, sans-serif; background: #1F5E37; color: #fff; }
  .card { max-width: 380px; width: 100%; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.2); border-radius: 22px; padding: 34px 26px; text-align: center; }
  .icon { width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: <?= $ok ? 'rgba(76,217,123,0.3)' : 'rgba(255,82,82,0.3)' ?>; }
  h1 { margin: 0 0 10px; font-size: 1.5rem; }
  p { margin: 0 0 22px; line-height: 1.5; color: rgba(255,255,255,0.8); font-size: 0.95rem; }
  a { display: inline-block; padding: 12px 22px; border-radius: 10px; background: #fff; color: #1F5E37; text-decoration: none; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon"><?= $ok ? '&#10003;' : '!' ?></div>
    <h1><?= $title ?></h1>
    <p><?= $text ?></p>
    <a href="../register.html">Back to Sign Up</a>
  </div>
</body>
</html>
