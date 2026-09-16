ALTER TABLE users
ADD COLUMN IF NOT EXISTS code_id VARCHAR(32) NULL AFTER id;

UPDATE users
SET code_id = CONCAT('SPN-', LPAD(CAST(id AS CHAR), 3, '0'))
WHERE code_id IS NULL OR code_id = '';
