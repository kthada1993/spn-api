SET @add_name_prefix_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'name_prefix'
  ),
  'SELECT 1',
  "ALTER TABLE user_screenings ADD COLUMN name_prefix VARCHAR(32) NULL AFTER full_name"
);
PREPARE stmt_add_name_prefix FROM @add_name_prefix_sql;
EXECUTE stmt_add_name_prefix;
DEALLOCATE PREPARE stmt_add_name_prefix;

SET @add_first_name_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'first_name'
  ),
  'SELECT 1',
  "ALTER TABLE user_screenings ADD COLUMN first_name VARCHAR(100) NULL AFTER name_prefix"
);
PREPARE stmt_add_first_name FROM @add_first_name_sql;
EXECUTE stmt_add_first_name;
DEALLOCATE PREPARE stmt_add_first_name;

SET @add_last_name_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'last_name'
  ),
  'SELECT 1',
  "ALTER TABLE user_screenings ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name"
);
PREPARE stmt_add_last_name FROM @add_last_name_sql;
EXECUTE stmt_add_last_name;
DEALLOCATE PREPARE stmt_add_last_name;
