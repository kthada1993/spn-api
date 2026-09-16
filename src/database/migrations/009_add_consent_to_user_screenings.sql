SET @add_consent_accepted_at_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'consent_accepted_at'
  ),
  'SELECT 1',
  'ALTER TABLE user_screenings ADD COLUMN consent_accepted_at DATETIME NULL AFTER screening_result'
);
PREPARE stmt_add_consent_accepted_at FROM @add_consent_accepted_at_sql;
EXECUTE stmt_add_consent_accepted_at;
DEALLOCATE PREPARE stmt_add_consent_accepted_at;

SET @add_consent_version_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'consent_version'
  ),
  'SELECT 1',
  'ALTER TABLE user_screenings ADD COLUMN consent_version VARCHAR(32) NULL AFTER consent_accepted_at'
);
PREPARE stmt_add_consent_version FROM @add_consent_version_sql;
EXECUTE stmt_add_consent_version;
DEALLOCATE PREPARE stmt_add_consent_version;
