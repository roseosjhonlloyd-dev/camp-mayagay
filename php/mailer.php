<?php
/**
 * mailer.php
 * Small helper that wraps PHPMailer to send the verification-code email
 * used by the Forgot Password flow (php/forgot-password.php).
 *
 * ---------------------------------------------------------------------
 * ONE-TIME SETUP (do this before Forgot Password will actually send email):
 *
 * 1. Download PHPMailer from:
 *      https://github.com/PHPMailer/PHPMailer/archive/refs/heads/master.zip
 *
 * 2. Extract the zip, then copy just the "src" folder into your project
 *    so you end up with exactly these 3 files:
 *      camp-mayagay/PHPMailer/src/Exception.php
 *      camp-mayagay/PHPMailer/src/PHPMailer.php
 *      camp-mayagay/PHPMailer/src/SMTP.php
 *
 * 3. Fill in MAIL_USERNAME / MAIL_PASSWORD / MAIL_FROM below with your own
 *    Gmail address and a Gmail "App Password" (NOT your normal Gmail
 *    login password). Generate one at:
 *      Google Account -> Security -> 2-Step Verification -> App Passwords
 * ---------------------------------------------------------------------
 */

declare(strict_types=1);

require_once __DIR__ . '/../PHPMailer/src/Exception.php';
require_once __DIR__ . '/../PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/../PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

// ---- Gmail SMTP settings: EDIT THESE 3 VALUES -------------------------
define('MAIL_USERNAME', getenv('MAIL_USERNAME') ?: '');
define('MAIL_PASSWORD', getenv('MAIL_PASSWORD') ?: '');
define('MAIL_FROM', getenv('MAIL_FROM') ?: (getenv('MAIL_USERNAME') ?: ''));
// -------------------------------------------------------------------------

const MAIL_HOST      = 'smtp.gmail.com';
const MAIL_PORT      = 587;
const MAIL_FROM_NAME = 'Camp Mayagay';

/**
 * Sends the 6-digit verification code to the given email address.
 *
 * @param string      $toEmail  Where to send the code
 * @param string      $code     The verification code to include
 * @param string|null $errorOut If sending fails, the reason is written here
 *                              (for server-side logging only - never show
 *                              this raw text to the guest).
 * @return bool true on success, false on failure
 */
function sendVerificationEmail(string $toEmail, string $code, ?string &$errorOut = null): bool
{
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = MAIL_PORT;
        $mail->Timeout    = 10; // fail fast instead of hanging for minutes on connection issues

        $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addReplyTo(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addAddress($toEmail);
        $mail->CharSet = 'UTF-8';
        $mail->XMailer = ' '; // blank this out - the default "PHPMailer" signature is a common spam trigger

        $mail->isHTML(true);
        $mail->Subject = 'Camp Mayagay - Password Reset Code';
        $mail->Body =
            '<p>You requested to reset your Camp Mayagay password.</p>' .
            '<p>Your verification code is:</p>' .
            '<h2 style="letter-spacing:6px;">' . htmlspecialchars($code) . '</h2>' .
            '<p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>';
        $mail->AltBody = "Your Camp Mayagay verification code is: {$code}\nThis code expires in 10 minutes.";

        $mail->send();

        return true;
    } catch (PHPMailerException $e) {
        $errorOut = $mail->ErrorInfo;

        return false;
    }
}

/**
 * Sends a general-purpose notification email (used by the admin
 * "Add Message" composer on the Notifications page).
 *
 * @param string      $toEmail   Recipient's email address
 * @param string      $subject   Email subject line (the notification title)
 * @param string      $message   Plain-text message body (will be escaped
 *                                and turned into simple HTML paragraphs)
 * @param string|null $errorOut  If sending fails, the reason is written
 *                                here (server-side logging only).
 * @return bool true on success, false on failure
 */
function sendNotificationEmail(string $toEmail, string $subject, string $message, ?string &$errorOut = null): bool
{
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = MAIL_PORT;

        $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addReplyTo(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addAddress($toEmail);
        $mail->CharSet = 'UTF-8';
        $mail->XMailer = ' '; // blank this out - the default "PHPMailer" signature is a common spam trigger

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body =
            '<p>' . nl2br(htmlspecialchars($message)) . '</p>' .
            '<p style="color:#888; font-size:12px; margin-top:24px;">This message was sent by Camp Mayagay.</p>';
        $mail->AltBody = $message;

        $mail->send();

        return true;
    } catch (PHPMailerException $e) {
        $errorOut = $mail->ErrorInfo;

        return false;
    }
}
