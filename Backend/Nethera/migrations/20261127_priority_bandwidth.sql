BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS priority_bandwidth (
    router_id BIGINT PRIMARY KEY REFERENCES router(id),
    enabled BOOLEAN NOT NULL,
    download_kbit INTEGER NOT NULL,
    upload_kbit INTEGER NOT NULL,
    CHECK ((enabled AND download_kbit BETWEEN 128 AND 1000000 AND upload_kbit BETWEEN 128 AND 1000000)
        OR (NOT enabled AND download_kbit = 0 AND upload_kbit = 0))
);
ALTER TABLE priority_control_state ADD COLUMN IF NOT EXISTS reported_bandwidth TEXT;
COMMIT;
