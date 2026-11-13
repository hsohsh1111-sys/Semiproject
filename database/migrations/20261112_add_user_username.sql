-- Additive migration: preserve existing members, emails, nicknames and passwords.
-- Existing users keep NULL username and can continue logging in with email.
-- Apply once after team review; schema.sql CREATE IF NOT EXISTS does not alter users.
-- TiDB requires the new column to be visible before adding its index.
ALTER TABLE users ADD COLUMN username VARCHAR(32) NULL;
ALTER TABLE users ADD UNIQUE INDEX uq_users_username (username);
