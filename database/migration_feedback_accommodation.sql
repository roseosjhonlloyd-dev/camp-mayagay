-- Lets a guest tag feedback/ratings to a specific room/accommodation
-- (Feedback & Concern page: "Which room are you rating?"). Run this once
-- against an existing database that was created before this update. Fresh
-- installs from erd_schema.sql already include this column.

USE camp_mayagay;

ALTER TABLE feedback_concerns
    ADD COLUMN accommodation_id INT UNSIGNED NULL AFTER user_id,
    ADD CONSTRAINT fk_feedback_accommodation
        FOREIGN KEY (accommodation_id) REFERENCES accommodations(accommodation_id) ON DELETE SET NULL;
