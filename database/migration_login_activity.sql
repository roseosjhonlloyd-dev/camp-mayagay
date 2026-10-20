-- Run this once on an EXISTING camp_mayagay database (created before this
-- update). If you are setting up the database fresh from erd_schema.sql,
-- you do NOT need this file -- the columns are already included there.

USE camp_mayagay;

ALTER TABLE security_logs
    ADD COLUMN location_lat DECIMAL(9,6) NULL AFTER location,
    ADD COLUMN location_lng DECIMAL(9,6) NULL AFTER location_lat;

ALTER TABLE notifications
    ADD COLUMN recipient_email VARCHAR(150) NULL AFTER reservation_id,
    ADD COLUMN email_status ENUM('sent','failed','not_applicable') NOT NULL DEFAULT 'not_applicable' AFTER recipient_email;
