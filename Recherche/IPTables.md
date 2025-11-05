# Was ist IPTABLES?

	Ein Linux-Tool, dass bestimmt, welche 	Netzwerkpakete blockiert oder umgeleitet 	werden.

### Features, die wir damit abdecken:

* DNS-Adblocker
* Webseiten- oder Geräte-Sperren
* Zeitliche WLAN-Begrenzungen
* WLAN-Priorisierung / QoS (Quality Of Service)

###
---
###

>DNS-Adblocker:
Leitet DNS-Anfragen um

>Zeitliche WLAN-Sperren:
Schaltet Regeln zeitgesteuert ein/aus

>WLAN-Priorisierung: Setzt Markierungen oder Bandbreitenlimits pro Gerät oder Port 

>Webseiten blockieren: Blockiert Verbindungen zu bestimmten Domains/IPs oder Ports

>Protokollierung:
Loggt, welche Pakete oder Anfragen blockiert wurden.

###
---
###

Erklärung zur Verwendung von IPTABLES:

Jede Regel sagt im Prinzip:

"Wenn ein Paket diese Eigenschaften hat -> mache das damit."

Aufbau eines iptables-Befehls:

iptables [Tabelle] [Option] [Chain] [Match] [Ziel]

[Tabelle]:

filter: Erlauben/blockieren von Datenverkehr (Webseiten sperren, Geräte blockieren)

nat: Internet-Freigabe, DNS-Umleitung, Portweiterleitung

> mangle: QoS, Bandbreitensteuerung, Markierungen **für** Priorisierung

[Option]:

# Chain:

| Chain                                 | Wann sie greift                                         | Typische Nutzung                                           |
| ------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| **INPUT**                             | Wenn ein Paket **an den Router selbst** geht            | Zugriff auf den Router (z. B. SSH, Webinterface)           |
| **OUTPUT**                            | Wenn ein Paket **vom Router selbst** gesendet wird      | Router sendet Updates, Ping, etc.                          |
| **FORWARD**                           | Wenn ein Paket **durch den Router weitergeleitet** wird | Daten von Geräten im WLAN ins Internet (wichtig für euch!) |
| **PREROUTING** *(nur in nat/mangle)*  | Bevor entschieden wird, wohin das Paket geht            | DNS-Umleitungen oder Traffic-Umschreibungen                |
| **POSTROUTING** *(nur in nat/mangle)* | Nachdem entschieden wurde, wohin das Paket geht         | NAT, Internetfreigabe (Masquerading)                       |


INPUT:	
-> 

OUTPUT:

FORWARD:

PREROUTING:

POSTROUTING:

