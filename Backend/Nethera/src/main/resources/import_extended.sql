-- Erweiterte Demo-Daten für Nethera
-- Keine CREATE TABLE-Statements: Hibernate erstellt die Tabellen aus deinen JPA-Entities.

-- Router
INSERT INTO router (name, model, firmware, is_online, last_seen) VALUES
    ('Nethera Router', 'CT-Router NG LAN', '1.08.03', TRUE, CURRENT_TIMESTAMP);

-- Devices / ConnectedDevice
INSERT INTO device (mac_address, ip_address, hostname, connection_type, router_id, last_seen) VALUES
    ('AA:BB:CC:DD:EE:01', '192.168.0.10', 'Helmut-iPhone', 'wifi', 1, '2026-04-26 10:02:00'),
    ('AA:BB:CC:DD:EE:02', '192.168.0.11', 'Jakobs-Laptop', 'wifi', 1, '2026-04-26 10:01:30'),
    ('AA:BB:CC:DD:EE:03', '192.168.0.12', 'SmartTV', 'lan', 1, '2026-04-26 09:59:45'),
    ('AA:BB:CC:DD:EE:04', '192.168.0.13', 'Nethera-Tablet', 'wifi', 1, '2026-04-26 10:03:10'),
    ('AA:BB:CC:DD:EE:05', '192.168.0.20', 'Gaming-PC', 'lan', 1, '2026-04-26 10:04:05'),
    ('AA:BB:CC:DD:EE:06', '192.168.0.21', 'HomePod-Kueche', 'wifi', 1, '2026-04-26 09:55:30'),
    ('AA:BB:CC:DD:EE:07', '192.168.0.22', 'Drucker-Buero', 'wifi', 1, '2026-04-26 09:44:00'),
    ('AA:BB:CC:DD:EE:08', '192.168.0.30', 'NAS-Storage', 'lan', 1, '2026-04-26 10:05:00');

-- Zeitlimits fuer WLAN-Geraete
INSERT INTO device_time_limit (device_id, daily_limit_minutes, used_minutes_today, blocked_from, blocked_until, status, note) VALUES
    (1, 120, 35, '21:00', '07:00', 'active', 'Handy: nachts gesperrt'),
    (2, 180, 95, '22:00', '06:30', 'active', 'Laptop: nachts gesperrt'),
    (4, 60, 10, '20:00', '08:00', 'paused', 'Tablet-Sperre ist gerade pausiert');

-- Blocklisten fuer einfache Presets
INSERT INTO blocklists (routerid, name, sourcetype, urlpattern) VALUES
    (1, 'Kinder Schutz', 'PRESET', 'adult|gambling|violence'),
    (1, 'Social Media Pause', 'PRESET', 'tiktok.com|instagram.com|snapchat.com'),
    (1, 'Lernen / Hausaufgaben', 'PRESET', 'youtube.com|twitch.tv|discord.com'),
    (1, 'Werbung & Tracker', 'DNS', 'ads.example.net|tracker.example.com');

-- Geraetegruppen, Presets und Zuweisungen fuer Router-Verarbeitung
INSERT INTO device_group (name, description, blocklist_id, color) VALUES
    ('Kinder', 'Handy, Tablet und Laptop mit Abendruhe und Jugendschutz', 1, '#2fb09a'),
    ('Arbeit & Schule', 'Geraete mit Fokus-Regeln waehrend Lernzeiten', 3, '#4f8cff'),
    ('Smart Home', 'Drucker, Lautsprecher und NAS ohne strenge Sperren', 4, '#f59e0b');

INSERT INTO device_group_member (group_id, device_id) VALUES
    (1, 1),
    (1, 4),
    (2, 2),
    (2, 5),
    (3, 6),
    (3, 7),
    (3, 8);

INSERT INTO security_preset (name, description, blocklist_id, time_limit_minutes, blocked_from, blocked_until, parental_mode, priority_mode) VALUES
    ('Schultag', 'Lernen priorisieren, Social Media blockieren, nachts sperren', 3, 180, '21:00', '07:00', true, false),
    ('Abendruhe', 'Alle Unterhaltungsseiten ueber Nacht blockieren', 2, 120, '20:30', '06:30', true, false),
    ('Gaming erlaubt', 'Gaming-PC mit Prioritaet, aber ohne Nachtfreigabe', 2, 240, '23:00', '08:00', false, true),
    ('Nur Schutzfilter', 'Keine Zeitgrenze, aber Werbung und Tracker reduzieren', 4, null, null, null, false, false);

INSERT INTO device_preset_assignment (device_id, preset_id, status) VALUES
    (1, 2, 'active'),
    (2, 1, 'active'),
    (4, 2, 'paused'),
    (5, 3, 'active'),
    (6, 4, 'active');

-- ActivityLog
INSERT INTO activity_log (timestamp, event_type, details, router_id, device_id) VALUES
    ('2026-04-26 09:58:10', 'CONNECTED', 'Helmut-iPhone connected to network', 1, 1),
    ('2026-04-26 09:59:15', 'CONNECTED', 'SmartTV connected via LAN', 1, 3),
    ('2026-04-26 10:00:20', 'BLOCKED_URL', 'Blocked access to tracker.example.com', 1, NULL),
    ('2026-04-26 10:01:15', 'DISCONNECTED', 'Jakobs-Laptop left the network', 1, 2),
    ('2026-04-26 10:02:45', 'CONNECTED', 'Nethera-Tablet connected to WiFi', 1, 4),
    ('2026-04-26 10:03:12', 'BLOCKED_URL', 'Blocked access to ads.example.net', 1, NULL),
    ('2026-04-26 10:04:33', 'CONNECTED', 'Gaming-PC connected via LAN', 1, 5),
    ('2026-04-26 10:05:40', 'CONNECTED', 'NAS-Storage connected via LAN', 1, 8);

-- SpeedStat
INSERT INTO speed_stat (timestamp, download_speed, upload_speed, router_id) VALUES
    ('2026-04-26 09:55:00', 36.4, 8.4, 1),
    ('2026-04-26 09:56:00', 42.1, 9.0, 1),
    ('2026-04-26 09:57:00', 45.2, 10.5, 1),
    ('2026-04-26 09:58:00', 44.9, 10.1, 1),
    ('2026-04-26 09:59:00', 47.8, 11.0, 1),
    ('2026-04-26 10:00:00', 50.1, 9.8, 1),
    ('2026-04-26 10:01:00', 54.7, 12.4, 1),
    ('2026-04-26 10:02:00', 51.3, 11.8, 1),
    ('2026-04-26 10:03:00', 57.2, 13.1, 1),
    ('2026-04-26 10:04:00', 62.6, 14.2, 1),
    ('2026-04-26 10:05:00', 59.4, 12.9, 1),
    ('2026-04-26 10:06:00', 72.8, 15.1, 1),
    ('2026-04-26 10:07:00', 68.2, 13.7, 1),
    ('2026-04-26 10:08:00', 81.6, 18.4, 1),
    ('2026-04-26 10:09:00', 77.9, 16.8, 1),
    ('2026-04-26 10:10:00', 64.3, 12.2, 1),
    ('2026-04-26 10:11:00', 91.5, 20.3, 1),
    ('2026-04-26 10:12:00', 88.1, 19.6, 1),
    ('2026-04-26 10:13:00', 73.2, 14.9, 1),
    ('2026-04-26 10:14:00', 66.7, 13.4, 1),
    ('2026-04-26 10:15:00', 84.9, 17.2, 1);

-- DnsStat
INSERT INTO dns_stat (timestamp, total_queries, blocked_queries, trackers_detected, router_id) VALUES
    ('2026-04-26 09:55:00', 1200, 80, 30, 1),
    ('2026-04-26 09:56:00', 1320, 92, 34, 1),
    ('2026-04-26 09:57:00', 1500, 120, 45, 1),
    ('2026-04-26 09:58:00', 1480, 110, 41, 1),
    ('2026-04-26 09:59:00', 1600, 140, 50, 1),
    ('2026-04-26 10:00:00', 1450, 100, 40, 1),
    ('2026-04-26 10:01:00', 1720, 160, 55, 1),
    ('2026-04-26 10:02:00', 1880, 190, 63, 1),
    ('2026-04-26 10:03:00', 1810, 175, 60, 1),
    ('2026-04-26 10:04:00', 1940, 220, 72, 1),
    ('2026-04-26 10:05:00', 2010, 240, 77, 1);

-- Account rows are created on first login via Keycloak OIDC; no seed data needed.
-- Config
INSERT INTO Config (router_name, mode, updates, dns_blocking, lan_ip, gateway_ip, guest_network, profiling) VALUES
                                                                                                                ('Edge-Router-01', 'GATEWAY', true, true, '192.168.1.1', '10.0.0.1', true, true),
                                                                                                                ('Home-Box-V2', 'REPEATER', true, false, '192.168.1.2', '192.168.1.1', false, false),
                                                                                                                ('Lab-Router', 'BRIDGE', false, false, '10.0.5.1', '10.0.5.254', false, true);
-- Connection
INSERT INTO Connection (client, ip, protocol, download, upload) VALUES
                                                                    ('Jakobs-Laptop', '192.168.0.11', 'HTTPS', 842.4, 96.3),
                                                                    ('Gaming-PC', '192.168.0.20', 'Steam / UDP', 1250.5, 450.2),
                                                                    ('SmartTV', '192.168.0.12', 'Streaming', 1940.0, 35.5),
                                                                    ('Helmut-iPhone', '192.168.0.10', 'HTTPS', 326.8, 44.1),
                                                                    ('NAS-Storage', '192.168.0.30', 'SMB', 510.2, 380.4),
                                                                    ('HomePod-Kueche', '192.168.0.21', 'mDNS', 28.2, 12.5),
                                                                    ('Drucker-Buero', '192.168.0.22', 'IPP', 8.6, 2.1);

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
