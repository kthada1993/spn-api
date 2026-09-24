CREATE TABLE IF NOT EXISTS master_hospitals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_master_hospitals_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS master_departments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_master_departments_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO master_hospitals (id, name, is_active)
VALUES
  (1, 'โรงพยาบาลกาฬสินธุ์', 1),
  (2, 'โรงพยาบาลยางตลาด', 1),
  (3, 'โรงพยาบาลกมลาไสย', 1),
  (4, 'โรงพยาบาลสมเด็จ', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO master_departments (id, name, is_active)
VALUES
  (1, 'อายุรกรรม', 1),
  (2, 'ศัลยกรรม', 1),
  (3, 'กุมารเวชกรรม', 1),
  (4, 'สูตินรีเวชกรรม', 1),
  (5, 'หอผู้ป่วยวิกฤต ICU', 1),
  (6, 'อุบัติเหตุฉุกเฉิน', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;
