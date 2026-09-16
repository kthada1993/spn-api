CREATE TABLE IF NOT EXISTS learning_intro_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  watched_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  unlocked TINYINT(1) NOT NULL DEFAULT 0,
  last_watched_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_intro_progress_user (user_id),
  CONSTRAINT fk_learning_intro_progress_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS learning_lesson_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  lesson_key VARCHAR(32) NOT NULL,
  video_watched_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  video_completed TINYINT(1) NOT NULL DEFAULT 0,
  video_completed_at TIMESTAMP NULL DEFAULT NULL,
  pdf_opened TINYINT(1) NOT NULL DEFAULT 0,
  pdf_opened_at TIMESTAMP NULL DEFAULT NULL,
  is_completed TINYINT(1) NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_lesson_progress_user_lesson (user_id, lesson_key),
  KEY idx_learning_lesson_progress_user (user_id),
  CONSTRAINT fk_learning_lesson_progress_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
