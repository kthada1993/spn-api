SET @add_underlying_disease_type_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'underlying_disease_type'
  ),
  'SELECT 1',
  'ALTER TABLE user_screenings ADD COLUMN underlying_disease_type VARCHAR(64) NULL AFTER has_underlying_disease'
);
PREPARE stmt_add_underlying_disease_type FROM @add_underlying_disease_type_sql;
EXECUTE stmt_add_underlying_disease_type;
DEALLOCATE PREPARE stmt_add_underlying_disease_type;