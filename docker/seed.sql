-- Demo records are inserted only into an empty table. Existing user data is never replaced.
BEGIN;

INSERT INTO router (name, model, firmware, is_online, last_seen)
SELECT 'Nethera Router', 'CT-Router NG LAN', '1.08.03', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM router);

INSERT INTO blocklists (routerid, name, sourcetype, urlpattern)
SELECT r.id, v.name, v.source_type, v.pattern
FROM router r
CROSS JOIN (VALUES
  ('Kinder Schutz', 'PRESET', 'adult|gambling|violence'),
  ('Social Media Pause', 'PRESET', 'tiktok.com|instagram.com|snapchat.com'),
  ('Lernen / Hausaufgaben', 'PRESET', 'youtube.com|twitch.tv|discord.com'),
  ('Werbung & Tracker', 'DNS', 'ads.example.net|tracker.example.com')
) AS v(name, source_type, pattern)
WHERE r.id = (SELECT min(id) FROM router)
  AND NOT EXISTS (SELECT 1 FROM blocklists);

INSERT INTO device_group (name, description, blocklist_id, color)
SELECT v.name, v.description, b.blocklistid, v.color
FROM (VALUES
  ('Kinder', 'Geraete mit Abendruhe und Jugendschutz', 'Kinder Schutz', '#2fb09a'),
  ('Arbeit & Schule', 'Fokus-Regeln waehrend Lernzeiten', 'Lernen / Hausaufgaben', '#4f8cff'),
  ('Smart Home', 'Geraete ohne strenge Sperren', 'Werbung & Tracker', '#f59e0b')
) AS v(name, description, blocklist_name, color)
JOIN blocklists b ON b.name = v.blocklist_name
WHERE NOT EXISTS (SELECT 1 FROM device_group);

INSERT INTO security_preset
  (name, description, blocklist_id, time_limit_minutes, blocked_from, blocked_until, parental_mode, priority_mode)
SELECT v.name, v.description, b.blocklistid, v.minutes, v.blocked_from, v.blocked_until, v.parental, v.priority
FROM (VALUES
  ('Schultag', 'Lernen priorisieren und nachts sperren', 'Lernen / Hausaufgaben', 180, '21:00', '07:00', true, false),
  ('Abendruhe', 'Unterhaltungsseiten ueber Nacht blockieren', 'Social Media Pause', 120, '20:30', '06:30', true, false),
  ('Gaming erlaubt', 'Gaming-PC mit Prioritaet', 'Social Media Pause', 240, '23:00', '08:00', false, true)
) AS v(name, description, blocklist_name, minutes, blocked_from, blocked_until, parental, priority)
JOIN blocklists b ON b.name = v.blocklist_name
WHERE NOT EXISTS (SELECT 1 FROM security_preset);

INSERT INTO device (router_id, mac_address, ip_address, hostname, connection_type, is_online, last_seen)
SELECT r.id, v.mac, v.ip, v.hostname, v.connection_type, true, CURRENT_TIMESTAMP
FROM router r
CROSS JOIN (VALUES
  ('AA:BB:CC:DD:EE:01', '192.168.0.10', 'Helmut-iPhone', 'wifi'),
  ('AA:BB:CC:DD:EE:02', '192.168.0.11', 'Jakobs-Laptop', 'wifi'),
  ('AA:BB:CC:DD:EE:03', '192.168.0.12', 'SmartTV', 'lan'),
  ('AA:BB:CC:DD:EE:04', '192.168.0.13', 'Nethera-Tablet', 'wifi'),
  ('AA:BB:CC:DD:EE:05', '192.168.0.20', 'Gaming-PC', 'lan'),
  ('AA:BB:CC:DD:EE:06', '192.168.0.21', 'HomePod-Kueche', 'wifi'),
  ('AA:BB:CC:DD:EE:07', '192.168.0.22', 'Drucker-Buero', 'wifi'),
  ('AA:BB:CC:DD:EE:08', '192.168.0.30', 'NAS-Storage', 'lan')
) AS v(mac, ip, hostname, connection_type)
WHERE r.id = (SELECT min(id) FROM router)
  AND NOT EXISTS (SELECT 1 FROM device);

INSERT INTO speed_stat (router_id, timestamp, download_speed, upload_speed)
SELECT r.id, CURRENT_TIMESTAMP - (v.minute_offset * INTERVAL '1 minute'), v.download, v.upload
FROM router r
CROSS JOIN (VALUES
  (20, 38.0, 8.0), (18, 45.0, 10.0), (16, 51.0, 11.0),
  (14, 49.0, 9.0), (12, 62.0, 14.0), (10, 58.0, 12.0),
  (8, 74.0, 16.0), (6, 68.0, 13.0), (4, 81.0, 20.0),
  (2, 71.0, 15.0), (0, 84.9, 17.2)
) AS v(minute_offset, download, upload)
WHERE r.id = (SELECT min(id) FROM router)
  AND NOT EXISTS (SELECT 1 FROM speed_stat);

INSERT INTO dns_stat (router_id, timestamp, total_queries, blocked_queries, trackers_detected)
SELECT r.id, CURRENT_TIMESTAMP, 17910, 1627, 567
FROM router r
WHERE r.id = (SELECT min(id) FROM router)
  AND NOT EXISTS (SELECT 1 FROM dns_stat);

INSERT INTO activity_log (router_id, device_id, timestamp, event_type, details)
SELECT r.id, d.id, CURRENT_TIMESTAMP, 'connected', d.hostname || ' connected via ' || upper(d.connection_type)
FROM router r
JOIN device d ON d.router_id = r.id
WHERE r.id = (SELECT min(id) FROM router)
  AND d.hostname IN ('NAS-Storage', 'Gaming-PC')
  AND NOT EXISTS (SELECT 1 FROM activity_log);

COMMIT;
