CREATE DATABASE IF NOT EXISTS camp_mayagay
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE camp_mayagay;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS security_logs;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS feedback_concerns;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS accommodations;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS feedback;    
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    user_id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    firstname       VARCHAR(100) NOT NULL,
    lastname        VARCHAR(100) NOT NULL,
    username        VARCHAR(50)  NOT NULL,
    email           VARCHAR(150) NOT NULL,
    contact_number  VARCHAR(20)  NULL,
    address         VARCHAR(150) NULL,
    password        VARCHAR(255) NOT NULL,
    role            ENUM('guest','staff','admin') NOT NULL DEFAULT 'guest',
    profile_image   VARCHAR(255) NULL,
    valid_id_image  VARCHAR(255) NULL,
    id_verification_status ENUM('not_submitted','pending','verified','rejected') NOT NULL DEFAULT 'not_submitted',
    status          ENUM('active','disabled') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE login_attempts (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    identifier   VARCHAR(150) NOT NULL,
    ip_address   VARCHAR(45)  NULL,
    success      TINYINT(1)   NOT NULL DEFAULT 0,
    attempted_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE system_settings (
    setting_key   VARCHAR(60) PRIMARY KEY,
    setting_value VARCHAR(60) NOT NULL,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('two_factor_enabled',      '1'),
    ('activity_logging_enabled','1'),
    ('password_policy_enabled', '1'),
    ('session_timeout_minutes', '30'),
    ('login_attempt_limit',     '5');

CREATE TABLE role_permissions (
    permission_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    module_key    VARCHAR(50) NOT NULL,
    role          ENUM('admin','staff','guest') NOT NULL,
    allowed       TINYINT(1) NOT NULL DEFAULT 1,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_module_role (module_key, role)
) ENGINE=InnoDB;

INSERT INTO role_permissions (module_key, role, allowed) VALUES
    ('dashboard',     'admin', 1), ('dashboard',     'staff', 1), ('dashboard',     'guest', 0),
    ('reservation',   'admin', 1), ('reservation',   'staff', 1), ('reservation',   'guest', 1),
    ('accommodation', 'admin', 1), ('accommodation', 'staff', 1), ('accommodation', 'guest', 1),
    ('guest_record',  'admin', 1), ('guest_record',  'staff', 1), ('guest_record',  'guest', 0),
    ('notifications', 'admin', 1), ('notifications', 'staff', 1), ('notifications', 'guest', 1),
    ('feedback',      'admin', 1), ('feedback',      'staff', 1), ('feedback',      'guest', 1),
    ('reports',       'admin', 1), ('reports',       'staff', 1), ('reports',       'guest', 0),
    ('user_account',  'admin', 1), ('user_account',  'staff', 0), ('user_account',  'guest', 0),
    ('settings',      'admin', 1), ('settings',      'staff', 0), ('settings',      'guest', 0);

CREATE TABLE accommodations (
    accommodation_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug                VARCHAR(50) NOT NULL,
    accommodation_name  VARCHAR(150) NOT NULL,
    description          VARCHAR(255) NULL,
    type                ENUM('room','cabin','nipa','tent area') NOT NULL DEFAULT 'cabin',
    capacity            VARCHAR(100) NULL,
    price               DECIMAL(10,2) NOT NULL DEFAULT 0,
    status              ENUM('available','unavailable') NOT NULL DEFAULT 'available',
    image               VARCHAR(255) NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_accommodations_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE reservations (
    reservation_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id          INT UNSIGNED NULL,
    accommodation_id INT UNSIGNED NOT NULL,
    code             VARCHAR(50)  NOT NULL,
    guest_name       VARCHAR(150) NOT NULL,
    guest_email      VARCHAR(150) NULL,
    guest_phone      VARCHAR(30)  NULL,
    check_in_date    DATETIME     NOT NULL,
    check_out_date   DATETIME     NOT NULL,
    number_of_guests INT UNSIGNED NOT NULL DEFAULT 1,
    total_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
    reservation_status ENUM('pending','confirmed','declined','cancelled','completed') NOT NULL DEFAULT 'pending',
    payment_status   ENUM('unpaid','partial','paid','refunded') NOT NULL DEFAULT 'unpaid',
    payment_method   VARCHAR(50)  NULL,
    cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
    cancel_reason    TEXT NULL,
    created_by       ENUM('guest','admin') NOT NULL DEFAULT 'guest',
    data             JSON NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (accommodation_id) REFERENCES accommodations(accommodation_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payments (
    payment_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reservation_id   INT UNSIGNED NOT NULL,
    payment_method   VARCHAR(50) NULL,
    reference_number VARCHAR(100) NULL,
    amount           DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_status   ENUM('unpaid','partial','paid','refunded') NOT NULL DEFAULT 'unpaid',
    payment_date     DATETIME NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id) ON DELETE CASCADE
) ENGINE=InnoDB;


CREATE TABLE notifications (
    notification_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id          INT UNSIGNED NULL,
    audience         ENUM('guest','admin') NOT NULL DEFAULT 'guest',
    title            VARCHAR(150) NOT NULL,
    message          VARCHAR(255) NOT NULL,
    notification_type VARCHAR(30) NOT NULL DEFAULT 'announcement',
    reservation_id   INT UNSIGNED NULL,
    recipient_email  VARCHAR(150) NULL,
    email_status     ENUM('sent','failed','not_applicable') NOT NULL DEFAULT 'not_applicable',
    status           ENUM('unread','read') NOT NULL DEFAULT 'unread',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id) ON DELETE SET NULL
) ENGINE=InnoDB;


CREATE TABLE accommodation_favorites (
    user_id          INT UNSIGNED NOT NULL,
    accommodation_id INT UNSIGNED NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, accommodation_id)
) ENGINE=InnoDB;

CREATE TABLE feedback_concerns (
    feedback_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED NULL,
    accommodation_id INT UNSIGNED NULL,
    guest_name    VARCHAR(150) NOT NULL,
    subject       VARCHAR(150) NOT NULL,
    message       TEXT NOT NULL,
    category      ENUM('feedback','concern') NOT NULL DEFAULT 'feedback',
    rating        TINYINT UNSIGNED NULL,
    response      TEXT NULL,
    status        ENUM('open','closed') NOT NULL DEFAULT 'open',
    submitted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (accommodation_id) REFERENCES accommodations(accommodation_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE reports (
    report_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NULL,
    report_type     VARCHAR(50) NOT NULL,
    generated_date  DATE NOT NULL,
    description     VARCHAR(255) NULL,
    file_path       VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE security_logs (
    log_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED NULL,
    activity     VARCHAR(100) NOT NULL,
    ip_address   VARCHAR(45) NULL,
    device_info  VARCHAR(150) NULL,
    location     VARCHAR(150) NULL,
    location_lat DECIMAL(9,6) NULL,
    location_lng DECIMAL(9,6) NULL,
    login_time   DATETIME NULL,
    logout_time  DATETIME NULL,
    status       ENUM('success','failed') NOT NULL DEFAULT 'success',
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;


INSERT INTO users (role, firstname, lastname, username, email, contact_number, password)
VALUES (
    'admin', 'Camp', 'Administrator', 'admin', 'admin@campmayagay.com', NULL,
    '$2y$10$Wp1v6z1s0m3B3fH0iM8u9OQwqzZ0kQeYb9r8n0eYy2xQmS7QwV1uK'
);


INSERT INTO accommodations (slug, accommodation_name, description, type, capacity, price, status, image) VALUES
('nipa1', 'Nipa Hut 1',  'Traditional nipa hut, good for 1-2 pax',        'nipa',       '1-2 pax',          2000.00, 'available', 'assets/images/nipa-hut.png'),
('nipa2', 'Nipa Hut 2',  'Traditional nipa hut, good for 1-2 pax',        'nipa',       '1-2 pax',          2000.00, 'available', 'assets/images/nipa-hut.png'),
('glass', 'Glass Door',  'Glass door cabin, good for 1-2 pax',            'cabin',      '1-2 pax',          2500.00, 'available', 'assets/images/glass-door.png'),
('tent',  'Tent Area',   'Open tent area, good for 1-2 pax',              'tent area',  '1-2 pax',          250.00,  'available', 'assets/images/tent-area.png'),
('big1',  'Big House 1', 'Big house, good for 1-2 pax per room',          'room',       '1-2 pax per room', 2500.00, 'available', 'assets/images/big-house.png'),
('big2',  'Big House 2', 'Big house, good for 1-2 pax per room',          'room',       '1-2 pax per room', 2500.00, 'available', 'assets/images/big-house.png');
