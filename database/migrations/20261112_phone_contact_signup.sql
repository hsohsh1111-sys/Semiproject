-- Approved additive contact data change. No phone ownership verification.
-- Execute only missing column statements after checking the target schema.
ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN sms_marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN sms_marketing_consented_at DATETIME NULL;
