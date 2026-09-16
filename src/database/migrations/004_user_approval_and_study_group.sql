SET @add_approval_status_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'approval_status'
  ),
  'SELECT 1',
  "ALTER TABLE users ADD COLUMN approval_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' AFTER status"
);
PREPARE stmt_add_approval_status FROM @add_approval_status_sql;
EXECUTE stmt_add_approval_status;
DEALLOCATE PREPARE stmt_add_approval_status;

SET @needs_relax_screening_sql = (
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_screenings'
      AND COLUMN_NAME = 'age'
      AND IS_NULLABLE = 'NO'
  ) THEN 1 ELSE 0 END
);

SET @relax_screening_sql = IF(
  @needs_relax_screening_sql = 1,
  'ALTER TABLE user_screenings
      MODIFY age INT UNSIGNED NULL,
      MODIFY gender TINYINT UNSIGNED NULL,
      MODIFY marital_status TINYINT UNSIGNED NULL,
      MODIFY has_children TINYINT(1) NULL,
      MODIFY education TINYINT UNSIGNED NULL,
      MODIFY hospital_id INT UNSIGNED NULL,
      MODIFY department_id INT UNSIGNED NULL,
      MODIFY current_position_years DECIMAL(5,2) NULL,
      MODIFY shift_work_years DECIMAL(5,2) NULL,
      MODIFY night_shift_per_month INT UNSIGNED NULL,
      MODIFY working_hours_per_week DECIMAL(5,2) NULL,
      MODIFY weight_kg DECIMAL(5,2) NULL,
      MODIFY height_cm DECIMAL(5,2) NULL,
      MODIFY has_underlying_disease TINYINT(1) NULL,
      MODIFY phone VARCHAR(32) NULL,
      MODIFY inclusion_1 TINYINT(1) NULL,
      MODIFY inclusion_2 TINYINT(1) NULL,
      MODIFY inclusion_3 TINYINT(1) NULL,
      MODIFY inclusion_4 TINYINT(1) NULL,
      MODIFY inclusion_result TINYINT(1) NULL,
      MODIFY exclusion_result TINYINT(1) NULL,
      MODIFY screening_result TINYINT(1) NULL',
  'SELECT 1'
);
PREPARE stmt_relax_screening FROM @relax_screening_sql;
EXECUTE stmt_relax_screening;
DEALLOCATE PREPARE stmt_relax_screening;
