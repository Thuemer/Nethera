-- Apply BEFORE starting the new backend. Additive and repeatable; no data deletion.
BEGIN;
ALTER TABLE device_time_limit ADD COLUMN IF NOT EXISTS router_enforcement boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS time_control_state (
    router_id bigint PRIMARY KEY REFERENCES router(id),
    desired_version bigint,
    desired_content text,
    applied_version bigint,
    applied boolean,
    clock_synced boolean,
    checked_at timestamptz,
    error text,
    report text
);
COMMIT;
-- Legacy time rules stay saved but are not sent until explicitly re-saved.
-- used_minutes_today remains for compatibility, but is never trusted as usage.
