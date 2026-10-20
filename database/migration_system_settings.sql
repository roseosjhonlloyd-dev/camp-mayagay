-- Adds the system_settings key/value table used by the
-- "Account Security" panel in Security Management (2FA, activity
-- logging, password policy, session timeout, login attempt limit).
-- Run this once against an existing database that was created before
-- this table was added to erd_schema.sql.

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key   VARCHAR(60) PRIMARY KEY,
    setting_value VARCHAR(60) NOT NULL,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
    ('two_factor_enabled',      '1'),
    ('activity_logging_enabled','1'),
    ('password_policy_enabled', '1'),
    ('session_timeout_minutes', '30'),
    ('login_attempt_limit',     '5');
