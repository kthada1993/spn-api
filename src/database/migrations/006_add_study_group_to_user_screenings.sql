SET @add_study_group_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'study_group'
  ),
  'SELECT 1',
  'ALTER TABLE user_screenings ADD COLUMN study_group TINYINT UNSIGNED NULL AFTER department_id'
);
PREPARE stmt_add_study_group FROM @add_study_group_sql;
EXECUTE stmt_add_study_group;
DEALLOCATE PREPARE stmt_add_study_group;
