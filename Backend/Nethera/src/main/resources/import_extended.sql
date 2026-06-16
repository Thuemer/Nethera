-- Minimal seed data for Nethera
-- Hibernate creates the schema from JPA entities (drop-and-create).
-- Live data (devices, speed_stat, dns_stat, activity_log) is populated by RouterSyncScheduler.

-- Router — required so the scheduler has a valid entity to reference on first run
INSERT INTO router (name, model, firmware, is_online, last_seen) VALUES
    ('Nethera Router', 'Unbekannt', 'Unbekannt', FALSE, CURRENT_TIMESTAMP);

-- Blocklisten fuer einfache Presets
INSERT INTO blocklists (routerid, name, sourcetype, urlpattern) VALUES
    (1, 'Kinder Schutz', 'PRESET', 'adult|gambling|violence'),
    (1, 'Social Media Pause', 'PRESET', 'tiktok.com|instagram.com|snapchat.com'),
    (1, 'Lernen / Hausaufgaben', 'PRESET', 'youtube.com|twitch.tv|discord.com'),
    (1, 'Werbung & Tracker', 'DNS', 'ads.example.net|tracker.example.com');

-- Geraetegruppen und Presets (keine Geraete-FKs)
INSERT INTO device_group (name, description, blocklist_id, color) VALUES
    ('Kinder', 'Handy, Tablet und Laptop mit Abendruhe und Jugendschutz', 1, '#2fb09a'),
    ('Arbeit & Schule', 'Geraete mit Fokus-Regeln waehrend Lernzeiten', 3, '#4f8cff'),
    ('Smart Home', 'Drucker, Lautsprecher und NAS ohne strenge Sperren', 4, '#f59e0b');

INSERT INTO security_preset (name, description, blocklist_id, time_limit_minutes, blocked_from, blocked_until, parental_mode, priority_mode) VALUES
    ('Schultag', 'Lernen priorisieren, Social Media blockieren, nachts sperren', 3, 180, '21:00', '07:00', true, false),
    ('Abendruhe', 'Alle Unterhaltungsseiten ueber Nacht blockieren', 2, 120, '20:30', '06:30', true, false),
    ('Gaming erlaubt', 'Gaming-PC mit Prioritaet, aber ohne Nachtfreigabe', 2, 240, '23:00', '08:00', false, true),
    ('Nur Schutzfilter', 'Keine Zeitgrenze, aber Werbung und Tracker reduzieren', 4, null, null, null, false, false);

-- User-/UI-Einstellungen
INSERT INTO user_setting (setting_key, setting_value) VALUES
    ('account.displayName', 'Deniz'),
    ('account.compactMode', 'true'),
    ('account.defaultPage', 'Dashboard'),
    ('account.routerSync', 'manual'),
    ('account.theme', 'dark'),
    ('account.language', 'de'),
    ('account.showHelp', 'true'),
    ('configuration.autoUpdates', 'true'),
    ('configuration.securityMode', 'Normal'),
    ('configuration.guestPasswordRotation', 'weekly');
