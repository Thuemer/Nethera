-- Keine CREATE TABLE-Statements – Hibernate erstellt die Tabellen automatisch basierend auf den JPA-Entities

-- Daten für Router einfügen
INSERT INTO router (name, model, firmware, is_online, last_seen) VALUES
    ('Nethera Router', 'CT-Router NG LAN', '1.07.21', TRUE, CURRENT_TIMESTAMP);

-- Daten für Device (ConnectedDevice) einfügen
INSERT INTO device (mac_address, ip_address, hostname, connection_type, router_id, last_seen) VALUES
                                                                                                  ('AA:BB:CC:DD:EE:01', '192.168.0.10', 'Helmut-iPhone', 'wifi', 1, '2026-02-02 10:02:00'),
                                                                                                  ('AA:BB:CC:DD:EE:02', '192.168.0.11', 'Jakobs-Laptop', 'wifi', 1, '2026-02-02 10:01:30'),
                                                                                                  ('AA:BB:CC:DD:EE:03', '192.168.0.12', 'SmartTV', 'lan', 1, '2026-02-02 09:59:45');

-- Daten für ActivityLog einfügen
INSERT INTO activity_log (timestamp, event_type, details, router_id, device_id) VALUES
                                                                                    ('2026-02-02 10:00:10', 'CONNECTED', 'Helmut-iPhone connected to network', 1, 1),
                                                                                    ('2026-02-02 10:01:15', 'DISCONNECTED', 'Jakobs-Laptop left the network', 1, 2),
                                                                                    ('2026-02-02 10:02:20', 'BLOCKED_URL', 'Blocked access to example.com', 1, NULL);

-- Daten für SpeedStat einfügen (mit Dezimalwerten für Double)
INSERT INTO speed_stat (timestamp, download_speed, upload_speed, router_id) VALUES
                                                                                ('2026-02-02 10:00:00', 45.2, 10.5, 1),
                                                                                ('2026-02-02 10:01:00', 47.8, 11.0, 1),
                                                                                ('2026-02-02 10:02:00', 50.1, 9.8, 1);

-- Daten für DnsStat einfügen
INSERT INTO dns_stat (timestamp, total_queries, blocked_queries, trackers_detected, router_id) VALUES
                                                                                                   ('2026-02-02 10:00:00', 1500, 120, 45, 1),
                                                                                                   ('2026-02-02 10:01:00', 1600, 140, 50, 1),
                                                                                                   ('2026-02-02 10:02:00', 1450, 100, 40, 1);