CREATE TABLE IF NOT EXISTS learning_quiz_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  quiz_type ENUM('PRETEST', 'POSTTEST') NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  total_questions TINYINT UNSIGNED NOT NULL,
  percent DECIMAL(5,2) NOT NULL,
  answers_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_learning_quiz_user_type (user_id, quiz_type),
  KEY idx_learning_quiz_submitted_at (submitted_at),
  CONSTRAINT fk_learning_quiz_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
