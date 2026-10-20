-- Run this once on an EXISTING camp_mayagay database to enable:
--   1) The "view on map" action for Login Activity (adds lat/lng columns
--      to security_logs, filled in automatically by the same IP lookup
--      that already fills in the `location` text column).
--   2) The admin "Add Message" notification composer, which now records
--      who a message was emailed to and whether the email actually sent.
--
-- If you are setting up the database fresh from erd_schema.sql, you do
-- NOT need this file -- the columns are already included there.

USE camp_mayagay;

ALTER TABLE security_logs
    ADD COLUMN location_lat DECIMAL(9,6) NULL AFTER location,
    ADD COLUMN location_lng DECIMAL(9,6) NULL AFTER location_lat;

ALTER TABLE notifications
    ADD COLUMN recipient_email VARCHAR(150) NULL AFTER reservation_id,
    ADD COLUMN email_status ENUM('sent','failed','not_applicable') NOT NULL DEFAULT 'not_applicable' AFTER recipient_email;
