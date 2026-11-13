-- Removes the Valid ID and Favorites features from the database.
--
-- !! RUN THIS ONLY AFTER the updated code is deployed (the old code still
-- !! selects these columns, so dropping them first would break login).
-- !! This permanently deletes data. Take a backup/export first.
--
-- Run once, in Railway's MySQL > Data/Query tab (or any MySQL client).

ALTER TABLE users
    DROP COLUMN valid_id_image,
    DROP COLUMN id_verification_status;

DROP TABLE IF EXISTS accommodation_favorites;
