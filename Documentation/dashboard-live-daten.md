# Dashboard Live-Daten

## Überblick

Das Nethera-Dashboard zeigt Live-Daten vom Router. Diese werden **nicht** bei jedem HTTP-Request abgefragt, sondern von einem Hintergrund-Scheduler alle 60 Sekunden automatisch aktualisiert und in der Datenbank gespeichert. Das Frontend liest ausschließlich aus der Datenbank – keine direkte SSH-Verbindung pro Request.

---

## Scheduler

**Klasse:** `at.htlleonding.services.RouterSyncScheduler`  
**Intervall:** 60 Sekunden (konfigurierbar via `nethera.sync.interval` in `application.properties`)  
**Reihenfolge pro Zyklus:**
1. Router-Metadaten (`syncRouterMetadata`)
2. Geschwindigkeit (`syncSpeed`)
3. DNS-Statistiken (`syncDnsStats`)
4. Verbundene Geräte / Activity Log (`syncDhcpLeases`)

Schlägt eine Methode fehl (z.B. Router nicht erreichbar), laufen die übrigen trotzdem weiter.

---

## Datenquellen im Detail

### Geschwindigkeit (Speed Card)

**Klasse:** `RouterMetricsSyncService.syncSpeed()`  
**Quelle:** `/proc/net/dev` auf dem Router (via SSH)  
**Berechnung:**
- Zwei Messungen des WAN-Interface-Bytezählers im Abstand von 2 Sekunden
- Formel: `(Bytes_t2 − Bytes_t1) / 2 / 125000` → Ergebnis in Mb/s
- Download = empfangene Bytes (RX), Upload = gesendete Bytes (TX)
- Werte werden auf eine Dezimalstelle gerundet

**Gespeichert in:** Tabelle `speed_stat`  
**Aktualisierung:** Alle 60 Sekunden, ein neuer Datensatz pro Zyklus

---

### DNS-Statistiken (DNS Card)

**Klasse:** `RouterMetricsSyncService.syncDnsStats()`  
**Quelle:** dnsmasq-Statistiken aus `/var/log/messages` (via SSH)  
**Berechnung:**
- Pro Zyklus wird `kill -USR1 $(pidof dnsmasq)` gesendet → dnsmasq schreibt aktuelle Zähler ins Syslog
- Ausgelesen werden `queries forwarded` (an Upstream-DNS weitergeleitet) und `queries answered locally` (lokal beantwortet, z.B. blockierte Domains via `address=`)
- Gespeichert wird die **Differenz** zum vorherigen Zyklus (Delta), nicht der kumulative Wert
- `total_queries = forwarded_delta + answered_locally_delta`
- `blocked_queries = answered_locally_delta` (Domains, die per `address=.../0.0.0.0` blockiert sind, werden lokal beantwortet)
- `trackers_detected` = immer 0 (ohne per-Query-Logging nicht ermittelbar)

**Erster Zyklus nach Start:** Kein Datensatz – dient als Baseline für den nächsten Delta.  
**Neustart des Routers:** Zähler fallen auf 0 → negativer Delta wird erkannt und übersprungen, neue Baseline gesetzt.  
**Voraussetzung:** Der Router muss als DNS-Server für die Clients konfiguriert sein (DHCP-Option 6). Ohne das sieht dnsmasq keine Anfragen und alle Werte bleiben 0.

**Gespeichert in:** Tabelle `dns_stat`  
**Aktualisierung:** Alle 60 Sekunden (ab dem zweiten Zyklus nach Start)

---

### Router-Metadaten (Router Card)

**Klasse:** `RouterMetricsSyncService.syncRouterMetadata()`  
**Quelle:** `ubus call system board` auf dem Router (via SSH)  
**Felder:**
- `model` → Gerätebezeichnung (z.B. `Comtime LAN/WAN Router Board`)
- `firmware` → `release.description` aus dem ubus-JSON (z.B. `OpenWrt 22.03.7 based, advanced`)
- `isOnline` → `true` bei erfolgreicher SSH-Verbindung, `false` bei Fehler
- `lastSeen` → Zeitstempel des letzten erfolgreichen Zyklus

**Gespeichert in:** Tabelle `router` (Update, kein neuer Datensatz)  
**Aktualisierung:** Alle 60 Sekunden

---

### Verbundene Geräte & Activity Log (Clients Card)

**Klasse:** `RouterSyncService.syncDhcpLeases()`  
**Quelle:** `/tmp/dhcp.leases` und `/proc/net/arp` und `iw dev` (alle via SSH)  
**Berechnung:**
- DHCP-Leases liefern MAC, IP und Hostname aller bekannten Geräte
- ARP-Tabelle (nach Ping aller Geräte) bestimmt, welche Geräte aktuell **online** sind
- `iw dev <interface> station dump` liefert die MACs aller **WLAN-Clients** → Rest = LAN
- Verbindungstyp: `WIFI` oder `LAN`

**Activity Log:**  
Ändert sich der Online-Status eines Geräts zwischen zwei Zyklen, wird automatisch ein Eintrag geschrieben:
- Gerät war offline → jetzt online: `CONNECTED`
- Gerät war online → jetzt offline: `DISCONNECTED`
- Neues Gerät (noch nicht in DB): `CONNECTED`

**Gespeichert in:** Tabellen `device` (Upsert) und `activity_log` (neue Zeilen bei Statusänderung)  
**Aktualisierung:** Alle 60 Sekunden

---

## Konfiguration

| Property | Standardwert | Beschreibung |
|---|---|---|
| `nethera.router.ip` | `192.168.1.1` | IP-Adresse des Routers |
| `nethera.router.ssh-key-path` | – | Pfad zum SSH-Private-Key |
| `nethera.router.wan-interface` | `wan` | Name des WAN-Interfaces in `/proc/net/dev` |
| `nethera.sync.interval` | `60s` | Scheduler-Intervall |

Alle Properties in `Backend/Nethera/src/main/resources/application.properties`.

---

## Fehlerverhalten

- Ist der Router nicht erreichbar, schlägt `syncRouterMetadata` fehl → `isOnline = false`, die übrigen Sync-Methoden versuchen es trotzdem
- Jede Sync-Methode fängt Exceptions intern ab und loggt eine Warnung – der Scheduler läuft beim nächsten Zyklus weiter
- Bei `drop-and-create` (Entwicklungsmodus) werden alle historischen Daten gelöscht; der erste Neustart beginnt mit leeren Tabellen

---

## Relevante Klassen

| Klasse | Paket | Funktion |
|---|---|---|
| `RouterSyncScheduler` | `services` | Einstiegspunkt, orchestriert alle Sync-Methoden |
| `RouterMetricsSyncService` | `services` | Speed, DNS, Router-Metadaten |
| `RouterSyncService` | `services` | DHCP-Leases, Online-Status, Activity Log |
| `ConnectedDevicesRepository` | `repository` | Gerät-Upsert inkl. `isOnline` und `connectionType` |
