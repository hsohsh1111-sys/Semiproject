-- Initial signup agreement snapshot: server-issued version, timestamp, selections.
-- Existing members remain NULL; never invent retrospective consent.
ALTER TABLE users ADD COLUMN signup_consent JSON NULL;
