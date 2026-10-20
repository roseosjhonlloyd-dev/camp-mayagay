-- Adds a "location" (address) field to guest/staff/admin profiles.
-- Run this once against an existing database that was created before
-- this column was added to erd_schema.sql.

ALTER TABLE users
  ADD COLUMN address VARCHAR(150) NULL AFTER contact_number;
