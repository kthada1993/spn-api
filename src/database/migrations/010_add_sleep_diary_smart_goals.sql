CREATE TABLE IF NOT EXISTS sleep_diary_smart_goals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  sleep_hours_target DECIMAL(4,2) NOT NULL,
  night_shift_nap_minutes_target INT UNSIGNED NOT NULL DEFAULT 0,
  breathing_frequency_days TINYINT UNSIGNED NOT NULL,
  breathing_time TIME NOT NULL,
  caffeine_cutoff_hours DECIMAL(4,2) NOT NULL,
  bedroom_adjustment_plan TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sleep_diary_smart_goal_session (session_id),
  KEY idx_sleep_diary_smart_goal_user (user_id),
  CONSTRAINT fk_sleep_diary_smart_goal_session FOREIGN KEY (session_id) REFERENCES sleep_diary_sessions(id),
  CONSTRAINT fk_sleep_diary_smart_goal_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @add_breathing_time_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sleep_diary_records'
      AND COLUMN_NAME = 'breathing_478_time'
  ),
  'SELECT 1',
  'ALTER TABLE sleep_diary_records ADD COLUMN breathing_478_time TIME NULL AFTER breathing_478'
);
PREPARE stmt_add_breathing_time FROM @add_breathing_time_sql;
EXECUTE stmt_add_breathing_time;
DEALLOCATE PREPARE stmt_add_breathing_time;

SET @add_last_caffeine_time_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sleep_diary_records'
      AND COLUMN_NAME = 'last_caffeine_time'
  ),
  'SELECT 1',
  'ALTER TABLE sleep_diary_records ADD COLUMN last_caffeine_time TIME NULL AFTER phone_before_bed_minutes'
);
PREPARE stmt_add_last_caffeine_time FROM @add_last_caffeine_time_sql;
EXECUTE stmt_add_last_caffeine_time;
DEALLOCATE PREPARE stmt_add_last_caffeine_time;

SET @add_bedroom_adjustment_done_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sleep_diary_records'
      AND COLUMN_NAME = 'bedroom_adjustment_done'
  ),
  'SELECT 1',
  'ALTER TABLE sleep_diary_records ADD COLUMN bedroom_adjustment_done TINYINT(1) NOT NULL DEFAULT 0 AFTER last_caffeine_time'
);
PREPARE stmt_add_bedroom_adjustment_done FROM @add_bedroom_adjustment_done_sql;
EXECUTE stmt_add_bedroom_adjustment_done;
DEALLOCATE PREPARE stmt_add_bedroom_adjustment_done;
