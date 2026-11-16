-- Router control for adblock and blocked websites (#23, #25).
-- Additive only. Back up first; run before deploying the matching backend, never with drop-and-create.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Per router: the settings version the backend wants and the one the router confirmed
CREATE TABLE IF NOT EXISTS router_control_state (
    router_id bigint NOT NULL PRIMARY KEY,
    desired_version bigint,
    desired_content text,
    desired_adblock boolean,
    applied_version bigint,
    applied boolean,
    adblock_installed boolean,
    adblock_enabled boolean,
    error text,
    checked_at timestamp(6) with time zone
);

-- Real domain lists are longer than 255 characters
ALTER TABLE blocklists ALTER COLUMN urlpattern TYPE text;

-- The adblock switch needs one settings row; off until the user turns it on
INSERT INTO config (router_name, mode, updates, dns_blocking, lan_ip, gateway_ip, guest_network, profiling)
SELECT 'Nethera Router', 'Router', true, false, '192.168.1.1', '192.168.1.1', false, false
WHERE NOT EXISTS (SELECT 1 FROM config);
COMMIT;
