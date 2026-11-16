-- Router ownership (openspec change router-ownership).
-- Additive only. Back up first; run before deploying the matching backend, never with drop-and-create.
-- Existing groups, presets and configs predate multi-router support and belong to the oldest router.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE router ADD COLUMN IF NOT EXISTS owner_account_id bigint UNIQUE REFERENCES account (id);
ALTER TABLE router ADD COLUMN IF NOT EXISTS pairing_code varchar(255) UNIQUE;

ALTER TABLE device_group ADD COLUMN IF NOT EXISTS router_id bigint;
ALTER TABLE security_preset ADD COLUMN IF NOT EXISTS router_id bigint;
ALTER TABLE config ADD COLUMN IF NOT EXISTS router_id bigint UNIQUE;

UPDATE device_group SET router_id = (SELECT min(id) FROM router) WHERE router_id IS NULL;
UPDATE security_preset SET router_id = (SELECT min(id) FROM router) WHERE router_id IS NULL;
-- config.router_id is unique: only the oldest config row is attached, any others stay unscoped
UPDATE config SET router_id = (SELECT min(id) FROM router)
 WHERE id = (SELECT min(id) FROM config)
   AND NOT EXISTS (SELECT 1 FROM config WHERE router_id IS NOT NULL);
COMMIT;
