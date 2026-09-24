SET @add_children_count_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'children_count'
  ),
  'SELECT 1',
  'ALTER TABLE user_screenings ADD COLUMN children_count INT UNSIGNED NULL AFTER has_children'
);
PREPARE stmt_add_children_count FROM @add_children_count_sql;
EXECUTE stmt_add_children_count;
DEALLOCATE PREPARE stmt_add_children_count;

SET @add_current_position_months_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'current_position_months'
  ),
  'SELECT 1',
  'ALTER TABLE user_screenings ADD COLUMN current_position_months TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER current_position_years'
);
PREPARE stmt_add_current_position_months FROM @add_current_position_months_sql;
EXECUTE stmt_add_current_position_months;
DEALLOCATE PREPARE stmt_add_current_position_months;

SET @add_shift_work_months_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'shift_work_months'
  ),
  'SELECT 1',
  'ALTER TABLE user_screenings ADD COLUMN shift_work_months TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER shift_work_years'
);
PREPARE stmt_add_shift_work_months FROM @add_shift_work_months_sql;
EXECUTE stmt_add_shift_work_months;
DEALLOCATE PREPARE stmt_add_shift_work_months;