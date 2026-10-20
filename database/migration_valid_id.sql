USE camp_mayagay;

ALTER TABLE users
    ADD COLUMN valid_id_image VARCHAR(255) NULL AFTER profile_image,
    ADD COLUMN id_verification_status ENUM('not_submitted','pending','verified','rejected') NOT NULL DEFAULT 'not_submitted' AFTER valid_id_image;