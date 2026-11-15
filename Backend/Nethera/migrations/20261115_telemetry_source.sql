-- Additive only. Legacy data stays UNKNOWN until a real router updates it.
-- Back up first; run before deploying the matching backend, never with drop-and-create.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE router ADD COLUMN IF NOT EXISTS data_source varchar(16) DEFAULT 'UNKNOWN';
ALTER TABLE router ADD COLUMN IF NOT EXISTS connection_checked_at timestamp;
ALTER TABLE device ADD COLUMN IF NOT EXISTS data_source varchar(16) DEFAULT 'UNKNOWN';
ALTER TABLE speed_stat ADD COLUMN IF NOT EXISTS data_source varchar(16) DEFAULT 'UNKNOWN';
ALTER TABLE dns_stat ADD COLUMN IF NOT EXISTS data_source varchar(16) DEFAULT 'UNKNOWN';
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS data_source varchar(16) DEFAULT 'UNKNOWN';
COMMIT;
