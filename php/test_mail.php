<?php
/**
 * test_mail.php
 * TEMPORARY debug file lang ito - para makita ang totoong SMTP error.
 * I-DELETE mo ito pagkatapos ng testing, huwag itong iwan sa server.
 */

declare(strict_types=1);

require_once __DIR__ . '/mailer.php';

// PALITAN mo ito ng email address na gusto mong padalhan ng test code
$testEmail = 'anesjhonlloyd@gmail.com';

$errorOut = null;
$result = sendVerificationEmail($testEmail, '123456', $errorOut);

echo '<h2>Test Result</h2>';
if ($result) {
    echo '<p style="color:green;">SUCCESS - Tumuloy ang email. I-check mo ang inbox (o Spam folder) ng ' . htmlspecialchars($testEmail) . '</p>';
} else {
    echo '<p style="color:red;">FAILED. Eto ang eksaktong error:</p>';
    echo '<pre>' . htmlspecialchars((string)$errorOut) . '</pre>';
}