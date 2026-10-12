# Nethera

<!-- Logo -->
<p align="center">
  <img src="./Documentation/nethera_logo.png" alt="Nethera Logo" width="200"/>
</p>

## Kurzbeschreibung

Willkommen beim Nethera-Projekt. Dieses Repository enthält die Implementierung und Dokumentation unseres Projektteils im Rahmen des ITP-Kurses. Ziel ist es, eine Web-Anwendung und Handy-App zur Verwaltung des Heimnetzwerks zu entwickeln.

## Features

- Klassische Routereinstellungen
- AdBlocker
- Priorisierung
- Zeitbeschränkung
- Kindersicherung (Seiten sperren)
- Erweiterte Routereinstellungen

## Schnellstart

Die gehostete Demo-Instanz und Hinweise zu privaten Images, Zugangsdaten und
Updates stehen in [deploy/leocloud/README.md](deploy/leocloud/README.md).

Docker Desktop starten, dann im Projekt-Hauptordner ausfuehren:

```bash
docker compose up -d --build
```

Danach [Nethera im Browser](http://localhost:5500/index.html) oeffnen. Beim ersten Start kann Keycloak etwa eine Minute brauchen. Das lokale Demo-Login lautet `demo` / `nethera-demo`. Der Keycloak-Adminbereich liegt auf [localhost:8081](http://localhost:8081), die API auf `http://localhost:8080`.

Ein Compose-Befehl startet Frontend, Backend, Keycloak, den MQTT-Broker (Mosquitto) und zwei PostgreSQL-Datenbanken als zusammengehoerigen Stack. Die Daten liegen in Docker-Volumes und bleiben nach einem Neustart erhalten. Nur bei einer neuen Datenbank werden Beispieldaten angelegt; bestehende Daten werden nicht ueberschrieben. Die Routerwerte sind Demo-Daten, bis ein Router Telemetrie per MQTT sendet. Im Docker-Start laeuft das Backend im Modus `mqtt` (kein SSH, weil der SSH-Schluessel nur auf einem Entwicklerrechner existiert).

### Router-Telemetrie (MQTT)

Der Broker lauscht auf Port `1883`. Dieser Port ist bewusst im ganzen LAN erreichbar, weil der Router ihn erreichen muss. Ohne Router kann man Live-Daten simulieren:

```bash
scripts/mqtt-simulate-router.sh 1
```

Neue Passwoerter (nur Demo-Standardwerte, vor echtem Einsatz aendern):

- `NETHERA_MQTT_BACKEND_PASSWORD` (Standard `nethera-backend`)
- `NETHERA_MQTT_ROUTER1_PASSWORD` (Standard `nethera-router`)

Der Transport wird mit `nethera.telemetry.mode` gewaehlt: `auto` (Standard ausserhalb von Docker: MQTT, sonst Fallback auf SSH), `mqtt` oder `ssh`. Details stehen in `Backend/Nethera/README.md`.

Status und Logs:

```bash
docker compose ps
docker compose logs -f backend keycloak
```

Mit `docker compose stop` haeltst du die Dienste an; `docker compose up -d` startet sie wieder. **Nicht** `docker compose down -v` verwenden, wenn die Daten erhalten bleiben sollen. Die Standardpasswoerter und der Demo-Nutzer sind nur fuer eine lokale Vorfuehrung gedacht. Vor einem Einsatz im Netzwerk muessen sie geaendert und HTTPS eingerichtet werden.

## Online ausprobieren

Die gehostete Instanz ist unter
[it220208.cloud.htl-leonding.ac.at](https://it220208.cloud.htl-leonding.ac.at/)
erreichbar. Die Anmeldung erfolgt über Keycloak. Für das Team sind in der
LeoCloud-Instanz diese Benutzernamen angelegt:

| Benutzername | Zweck |
| --- | --- |
| `demo` | Vorführung |
| `nico` | Team-Account |
| `tobi` | Team-Account |
| `deniz` | Team-Account |
| `manu` | Team-Account |

Die **LeoCloud-Passwörter** werden nicht im Repository veröffentlicht. Bitte
privat beim jeweiligen Account-Inhaber erfragen und bei Bedarf in Keycloak
ändern. Die LeoCloud-Accounts und -Daten sind unabhängig von einer lokalen
Installation.

## Lokales Setup im Team

Für eine frische Installation das Repository klonen:

```bash
git clone https://github.com/Thuemer/Nethera.git
cd Nethera
```

Bei einem bestehenden Checkout stattdessen die Änderungen des Teams mit
`git pull` holen. Anschließend Docker Desktop starten und wie oben unter
"Schnellstart" `docker compose up -d --build` im Projekt-Hauptordner ausführen.
`compose.yaml` liegt direkt in diesem Ordner.

Beim ersten Start werden Images gebaut und Keycloak sowie die Datenbanken
initialisiert. Das kann einige Minuten dauern. Die oben genannten Team-Accounts
werden **nicht** in die lokale Keycloak-Datenbank importiert; für eine frische
lokale Installation gilt das Demo-Login aus dem Schnellstart.

| Dienst | Lokale Adresse | Aufgabe |
| --- | --- | --- |
| Web-App | [localhost:5500](http://localhost:5500/) | Oberfläche |
| Keycloak | [localhost:8081](http://localhost:8081/) | Anmeldung |
| Backend | `http://localhost:8080` | API |
| MQTT-Broker | `localhost:1883` | Router-Telemetrie |

Die lokale Installation und LeoCloud synchronisieren ihre Daten nicht
automatisch. Die gehostete Version nutzt derzeit Demo-Daten; die lokale
Router-Telemetrie per MQTT ist im Schnellstart beschrieben.

Beim Öffnen von `http://localhost:5500/` erscheint zuerst die öffentliche
Website. Über "Anmelden" gelangst du zu Keycloak und danach zur Anwendung unter
`http://localhost:5500/index.html`. Auf LeoCloud funktioniert derselbe Ablauf
unter der oben verlinkten Adresse.

## Projektpräsentation und Funktionsstand

Die [aktuelle Projektpräsentation](Documentation/revealjs/nethera-projektpraesentation.html)
beschreibt den Stand vom **11. Oktober 2026** auf Basis von `df170e7`: Website,
Login, Anwendung, Datenhaltung, LeoCloud, lokale Docker-Umgebung, MQTT und die
noch offenen Routerfunktionen. Sie verwendet wie die bisherigen Präsentationen
Reveal.js. Zum Öffnen im Browser werden die Reveal.js-Dateien vom CDN geladen.

Bereits in Oberfläche und Backend verwaltbar sind Geräte, Gruppen mit
Umbenennen und Zuweisung, Domainsperren für Geräte/Gruppen/das gesamte Netzwerk,
Presets mit optionalen Internetzeiten, tägliche Sperrfenster, optionale
Tagesbudgets sowie gespeicherte Werbeschutz- und Prioritätsoptionen.
Dashboard-Bereiche und Layout sind weiterhin anpassbar. Website und App wurden
für mobile Ansichten überarbeitet.

**Gespeichert ist nicht automatisch am Router aktiv:** DNS-Filter, Firewall-
Sperrzeiten, Werbefilter und QoS müssen noch mit bestätigter Routerwirkung
verbunden werden. Feste Mbit/s-/Prozentanteile und ein echter WLAN-Scan sind
keine fertigen Funktionen. Die Cloud-Demo nutzt gespeicherte Demo-/DB-Daten;
der lokale MQTT-Pfad ist davon getrennt.

Die [Abschlusspräsentation 2025/26](Documentation/revealjs/nethera-abschlusspraesentation.html)
bleibt als historischer Rückblick erhalten. Ihre früheren Kennzahlen sind keine
aktuelle Erhebung; unbelegte Live-/Testaussagen sind als offene Nachweise
gekennzeichnet. Für eine aktuelle Vorführung die Projektpräsentation verwenden.

Die Regeltests lassen sich ohne laufendes Backend ausführen:

```bash
node --test Applikation/tests/rules.test.cjs
```

Bekannte Grenzen: Das Datenvolumen in der Datenverkehrsansicht wird derzeit
fälschlich aus Geschwindigkeiten abgeleitet; DNS-Zähler unterscheiden lokal
beantwortete und tatsächlich blockierte Anfragen noch nicht zuverlässig.
Die direkte Backend-Entwicklungskonfiguration nutzt `drop-and-create`.
Vor `./mvnw quarkus:dev` deshalb eine isolierte Entwicklungsdatenbank verwenden
oder die Datenbank sichern und die ORM-Konfiguration prüfen. Compose und
LeoCloud überschreiben dies bereits mit `update` und `no-file`.

Ein Git-Push aktualisiert LeoCloud nicht automatisch. Dafür Images neu bauen,
in GHCR veröffentlichen, die Image-Versionen im Deployment aktualisieren und
den Rollout prüfen; siehe [LeoCloud-Anleitung](deploy/leocloud/README.md).
Lokale und Cloud-Datenbanken sowie Keycloak-Konten bleiben voneinander getrennt.

## Farbpalette
- \#001818
- \#144659
- \#E5EBE7
- \#63E5C5
- \#212121 

## Mitwirkende

- Deniz Bernecker
- Nico Hofer
- Tobi Huemer
- Manuel Freihaut
- Moritz Kapeller

## Links & Ressourcen

- Pinterest: https://pin.it/2GTQ6jTph
- Figma: https://www.figma.com/design/5G9cHovtzrnUnOK0Hz4hKx/Nethera-UI?node-id=0-1&m=dev&t=AvRlocKcx4yQaN3R-1
- Farbpalette: https://www.realtimecolors.com/?colors=E5EBE7-212121-144659-001818-63E5C5&fonts=Inter-Inter
