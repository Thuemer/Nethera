BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive; no existing DNS state, device preset or router settings are modified.
CREATE TABLE IF NOT EXISTS priority_control_state (
    router_id BIGINT PRIMARY KEY REFERENCES router(id),
    desired_version BIGINT,
    desired_content TEXT,
    applied_version BIGINT,
    applied BOOLEAN,
    reported_devices TEXT,
    error TEXT,
    checked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS device_priority (
    device_id BIGINT PRIMARY KEY REFERENCES device(id) ON DELETE CASCADE,
    mode VARCHAR(255) NOT NULL CHECK (mode IN ('high', 'normal'))
);
COMMIT;
