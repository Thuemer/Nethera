# 🧠 Lernzusammenfassung: OpenWrt – Systembasis (Phase 1)

> Ziel: Verstehen, wie OpenWrt als eingebettetes Linux-System funktioniert  
> und wie man es über SSH, CLI und LuCI kontrolliert.

---

## 🔍 Was ist OpenWrt?

OpenWrt ist ein **Linux-basiertes Betriebssystem für Router**.  
Es ersetzt die Hersteller-Firmware (z. B. AVM, TP-Link, Netgear) durch ein offenes, modulares System mit vollständigem Zugriff auf:
- Netzwerkverwaltung (IP, DHCP, Firewall, QoS)
- Paketinstallation
- Systemskripte und Automatisierung
- REST-/RPC-Schnittstellen (über `ubus`)
- eigene Softwaremodule (z. B. Nethera)

---

## ⚙️ Aufbau des Systems

OpenWrt besteht aus mehreren zentralen Komponenten:

| Komponente | Beschreibung | Beispielbefehl |
|-------------|---------------|----------------|
| **UCI** (Unified Configuration Interface) | Zentrales Konfigurationssystem, verwaltet alles in `/etc/config/` | `uci show network` |
| **OPKG** | Paketmanager (ähnlich `apt` bei Debian) | `opkg install luci` |
| **UBUS** | Interprozess-Kommunikation & API-System | `ubus call system board` |
| **LuCI** | Webinterface (optional) | `http://192.168.1.1` |
| **Init-Skripte** | Start/Stop von Diensten | `/etc/init.d/network restart` |

---

## 📂 Dateisystemstruktur

| Pfad | Funktion |
|------|-----------|
| `/etc/config/` | Alle Konfigurationsdateien (z. B. `network`, `firewall`, `wireless`) |
| `/usr/bin/` | Benutzerprogramme & eigene Skripte |
| `/etc/init.d/` | Dienststeuerung |
| `/var/log/` | Systemlogs |
| `/tmp/` | Temporäre Dateien (nicht persistent) |

---

## 💡 Grundlegende Befehle

### Verbindung herstellen
```bash
ssh root@192.168.1.1
