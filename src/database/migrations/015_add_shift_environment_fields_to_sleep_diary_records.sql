SET @add_nap_count_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sleep_diary_records'
      AND COLUMN_NAME = 'nap_count'
  ),
  'SELECT 1',
  'ALTER TABLE sleep_diary_records ADD COLUMN nap_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER sleep_efficiency'
);
PREPARE stmt_add_nap_count FROM @add_nap_count_sql;
EXECUTE stmt_add_nap_count;
DEALLOCATE PREPARE stmt_add_nap_count;

SET @add_ot_done_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sleep_diary_records'
      AND COLUMN_NAME = 'ot_done'
  ),
  'SELECT 1',
  'ALTER TABLE sleep_diary_records ADD COLUMN ot_done TINYINT(1) NOT NULL DEFAULT 0 AFTER work_stress'
);
PREPARE stmt_add_ot_done FROM @add_ot_done_sql;
EXECUTE stmt_add_ot_done;
DEALLOCATE PREPARE stmt_add_ot_done;

SET @add_sleep_medication_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sleep_diary_records'
      AND COLUMN_NAME = 'sleep_medication'
  ),
  'SELECT 1',
  'ALTER TABLE sleep_diary_records ADD COLUMN sleep_medication TINYINT(1) NOT NULL DEFAULT 0 AFTER ot_done'
);
PREPARE stmt_add_sleep_medication FROM @add_sleep_medication_sql;
EXECUTE stmt_add_sleep_medication;
DEALLOCATE PREPARE stmt_add_sleep_medication;
