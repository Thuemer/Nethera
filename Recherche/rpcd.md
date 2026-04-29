# rpcd (OpenWrt) – Übersicht und Nutzung

## 1. Was ist rpcd?

**rpcd** (Remote Procedure Call Daemon) ist ein Backend-Dienst in OpenWrt.

Er stellt eine Schnittstelle bereit, um über das **ubus-System (Message Bus)** mit dem Router zu kommunizieren.

Ziel:
- Systemfunktionen steuern
- Konfiguration ändern
- Statusdaten abrufen

rpcd wird häufig als Backend für Webinterfaces (z. B. LuCI) oder APIs verwendet.

---

## 2. Rolle im System

rpcd ist **kein Netzwerkdienst** wie DNS oder DHCP.

Stattdessen:
- steuert Dienste wie dnsmasq oder Firewall
- vermittelt zwischen externen Clients und internen Prozessen

Beispiel:

Cloud / Client  
→ rpcd  
→ ubus  
→ Dienste (dnsmasq, network, firewall)

---

## 3. Voraussetzungen für Nutzung

- OpenWrt Router mit aktivem rpcd
- Netzwerkzugriff (lokal oder über VPN)
- Authentifizierung (Session / Token)

Optional:
- Zugriff über HTTPS (empfohlen)
- Firewall-Regeln für Zugriffsbeschränkung

---

## 4. Zugriffsmöglichkeiten

### 4.1 Über ubus (lokal, CLI)

Direkt auf dem Router:

    ubus list
    ubus call system board
    ubus call network.interface.lan status

→ Gut für Tests und Debugging

---

### 4.2 Über RPC (remote)

Über HTTP/HTTPS API:

- JSON-RPC Requests
- Authentifizierung erforderlich
- Zugriff über VPN empfohlen

---

## 5. Typische Anwendungsfälle

### Daten abrufen
- Systeminformationen (CPU, RAM)
- Netzwerkstatus
- verbundene Clients
- DHCP-Leases

### Konfiguration ändern
- Netzwerkinterfaces
- Firewall-Regeln
- DNS-Einstellungen

### Dienste steuern
- Neustarten von dnsmasq
- Netzwerk neu laden
- Firewall reload

---

## 6. Beispiel: Dienst neu starten

Logik:
- Konfiguration ändern
- Dienst neu laden

CLI (lokal):

    /etc/init.d/dnsmasq restart

Über ubus:

    ubus call service restart '{"name":"dnsmasq"}'

---

## 7. Blocklist-Steuerung (DNS)

Typischer Ablauf:
1. Blocklist in dnsmasq konfigurieren
2. Neue Einträge setzen oder Datei aktualisieren
3. dnsmasq neu laden

rpcd übernimmt:
- Auslösen der Änderungen
- Steuerung des Dienstes

---

## 8. Sicherheit

Wichtige Punkte:

- Zugriff nur über VPN erlauben
- Authentifizierung aktivieren
- Keine öffentliche Freigabe ins Internet
- Firewall strikt konfigurieren

Risiko:
→ Vollständige Kontrolle über den Router bei Fehlkonfiguration

---

## 9. Einschränkungen

- Kein direkter Ersatz für SSH
- Kein vollständiger Shell-Zugriff
- Fokus auf strukturierte API-Aufrufe

Für komplexe Befehle:
→ SSH verwenden

---

## 10. Fazit

rpcd ist eine **API-Schicht zur Steuerung des Routers**.

Geeignet für:
- Remote-Management
- Automatisierung
- Integration in eigene Systeme (z. B. Cloud-Backend)

Nicht geeignet als:
- DNS-Server
- DHCP-Server
- Shell-Ersatz

---

## 11. Einordnung in Architektur

Empfohlene Struktur:

Client / Cloud  
→ RPC (rpcd)  
→ Router (OpenWrt)  
→ Dienste (dnsmasq, firewall, network)

Trennung:
- Control Plane → rpcd / Cloud
- Data Plane → Router-Dienste
