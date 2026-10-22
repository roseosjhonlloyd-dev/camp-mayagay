<?php
/**
 * mailer.php
 * Sends transactional email through the Brevo HTTPS API (port 443).
 *
 * Bakit hindi na SMTP: naka-block ang outbound SMTP (ports 25/465/587)
 * sa Railway Hobby/Trial plan, kaya nagti-timeout ang Gmail SMTP.
 * Gumagana ang HTTPS API kahit sa free plan.
 *
 * Environment variables (set sa Railway -> web service -> Variables):
 *   BREVO_API_KEY   - API key galing sa Brevo (SMTP & API -> API Keys)
 *   MAIL_FROM       - sender email na na-verify mo sa Brevo (Senders & IP)
 *   MAIL_FROM_NAME  - optional, default "Camp Mayagay"
 *
 * Huwag ilagay ang API key sa code o sa GitHub.
 */

declare(strict_types=1);

require_once __DIR__ . '/../PHPMailer/src/Exception.php';
require_once __DIR__ . '/../PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/../PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

// MAIL_DRIVER: "smtp" (default, Gmail SMTP) or "brevo" (HTTPS API).
// Gmail SMTP env vars: MAIL_USERNAME, MAIL_PASSWORD (App Password),
// MAIL_FROM (optional, defaults to MAIL_USERNAME), MAIL_PORT (default 587).
define('MAIL_DRIVER', strtolower(getenv('MAIL_DRIVER') ?: 'smtp'));
define('MAIL_USERNAME', getenv('MAIL_USERNAME') ?: '');
define('MAIL_PASSWORD', getenv('MAIL_PASSWORD') ?: '');
define('MAIL_PORT', (int)(getenv('MAIL_PORT') ?: 587));
const MAIL_HOST = 'smtp.gmail.com';

define('BREVO_API_KEY', getenv('BREVO_API_KEY') ?: '');
define('MAIL_FROM', getenv('MAIL_FROM') ?: (getenv('MAIL_USERNAME') ?: ''));
define('MAIL_FROM_NAME', getenv('MAIL_FROM_NAME') ?: 'Camp Mayagay');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Gmail SMTP sender (PHPMailer). NOTE: Railway blocks outbound SMTP on
 * non-Pro plans, so this times out there unless the plan allows SMTP.
 */
function smtpSend(string $toEmail, string $subject, string $html, string $text, ?string &$errorOut = null): bool
{
    if (MAIL_USERNAME === '' || MAIL_PASSWORD === '') {
        $errorOut = 'Email is not configured: set MAIL_USERNAME and MAIL_PASSWORD in the environment.';
        return false;
    }
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = MAIL_PORT === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = MAIL_PORT;
        $mail->Timeout    = 10;

        $mail->setFrom(MAIL_FROM !== '' ? MAIL_FROM : MAIL_USERNAME, MAIL_FROM_NAME);
        $mail->addReplyTo(MAIL_FROM !== '' ? MAIL_FROM : MAIL_USERNAME, MAIL_FROM_NAME);
        $mail->addAddress($toEmail);
        $mail->CharSet = 'UTF-8';
        $mail->XMailer = ' ';
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $html;
        $mail->AltBody = $text;
        $mail->send();
        return true;
    } catch (PHPMailerException $e) {
        $errorOut = $mail->ErrorInfo;
        return false;
    }
}

/** Picks the transport based on MAIL_DRIVER (default: smtp). */
function sendMailMessage(string $toEmail, string $subject, string $html, string $text, ?string &$errorOut = null): bool
{
    if (MAIL_DRIVER === 'brevo') {
        return brevoSend($toEmail, $subject, $html, $text, $errorOut);
    }
    return smtpSend($toEmail, $subject, $html, $text, $errorOut);
}

/**
 * Low-level sender used by the two public helpers below.
 *
 * @param string      $toEmail
 * @param string      $subject
 * @param string      $html      HTML body
 * @param string      $text      Plain-text body
 * @param string|null $errorOut  Reason for failure (server-side logging only)
 */
function brevoSend(string $toEmail, string $subject, string $html, string $text, ?string &$errorOut = null): bool
{
    if (BREVO_API_KEY === '' || MAIL_FROM === '') {
        $errorOut = 'Email is not configured: set BREVO_API_KEY and MAIL_FROM in the environment.';
        return false;
    }

    $payload = json_encode([
        'sender'      => ['name' => MAIL_FROM_NAME, 'email' => MAIL_FROM],
        'to'          => [['email' => $toEmail]],
        'replyTo'     => ['name' => MAIL_FROM_NAME, 'email' => MAIL_FROM],
        'subject'     => $subject,
        'htmlContent' => $html,
        'textContent' => $text,
    ], JSON_UNESCAPED_UNICODE);

    if ($payload === false) {
        $errorOut = 'Could not encode the email payload.';
        return false;
    }

    $headers = [
        'accept: application/json',
        'content-type: application/json',
        'api-key: ' . BREVO_API_KEY,
    ];

    $status   = 0;
    $response = '';

    if (function_exists('curl_init')) {
        $ch = curl_init(BREVO_API_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 20,
        ]);
        $result = curl_exec($ch);
        if ($result === false) {
            $errorOut = 'HTTP request failed: ' . curl_error($ch);
            curl_close($ch);
            return false;
        }
        $response = (string)$result;
        $status   = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method'        => 'POST',
                'header'        => implode("\r\n", $headers),
                'content'       => $payload,
                'timeout'       => 20,
                'ignore_errors' => true,
            ],
        ]);
        $result = @file_get_contents(BREVO_API_URL, false, $context);
        if ($result === false) {
            $errorOut = 'HTTP request failed (no curl, stream fallback).';
            return false;
        }
        $response = (string)$result;
        if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) {
            $status = (int)$m[1];
        }
    }

    if ($status >= 200 && $status < 300) {
        return true;
    }

    $errorOut = 'Brevo API error (HTTP ' . $status . '): ' . substr($response, 0, 500);
    return false;
}

/**
 * Sends the 6-digit verification code to the given email address.
 * Same signature as before, so login.php / forgot-password.php are unchanged.
 */
function sendVerificationEmail(string $toEmail, string $code, ?string &$errorOut = null): bool
{
    $html =
        '<p>You requested to reset your Camp Mayagay password.</p>' .
        '<p>Your verification code is:</p>' .
        '<h2 style="letter-spacing:6px;">' . htmlspecialchars($code) . '</h2>' .
        '<p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>';
    $text = "Your Camp Mayagay verification code is: {$code}\nThis code expires in 10 minutes.";

    return sendMailMessage($toEmail, 'Camp Mayagay - Password Reset Code', $html, $text, $errorOut);
}

/**
 * Sends a general-purpose notification email (used by the admin
 * "Add Message" composer and reservation notifications).
 */
function sendNotificationEmail(string $toEmail, string $subject, string $message, ?string &$errorOut = null): bool
{
    $html =
        '<p>' . nl2br(htmlspecialchars($message)) . '</p>' .
        '<p style="color:#888; font-size:12px; margin-top:24px;">This message was sent by Camp Mayagay.</p>';

    return sendMailMessage($toEmail, $subject, $html, $message, $errorOut);
}
