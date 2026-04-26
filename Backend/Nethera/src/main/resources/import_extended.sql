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
    ('2026-04-26 10:05:00', 59.4, 12.9, 1);

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
