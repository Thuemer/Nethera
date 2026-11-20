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

Der aktuelle lokale Frontend-Stand vom **19. November 2026** ist in der
[Präsentationsprüfung](Documentation/frontend-presentation-check.md) dokumentiert,
einschließlich Vorschau, Änderungen, Tests und noch offener manueller Abnahme.
Die Überarbeitung auf `fix/frontend-presentation-polish` wurde für einen reinen
Frontend-Rollout freigegeben. Der tatsächliche Release-Stand wird im
[Deployment-Protokoll](deploy/leocloud/README.md) festgehalten.
Die [Klassisch-/Baum-Topologie](openspec/changes/topology-visual-refresh/verification.md)
setzt Manuels Entwurf mit gemerkter Auswahl und gemeinsamen Routerdaten um.
Der [OpenSpec-Change](openspec/changes/frontend-presentation-polish/proposal.md)
verknüpft die Umsetzung mit den Qualitätsanforderungen der
[MetaSpec](Documentation/meta-spec.md).

Die [Projektpräsentation vom 11. Oktober](Documentation/revealjs/nethera-projektpraesentation.html)
beschreibt den Stand vom **11. Oktober 2026** auf Basis von `df170e7`: Website,
Login, Anwendung, Datenhaltung, LeoCloud, lokale Docker-Umgebung, MQTT und die
noch offenen Routerfunktionen. Sie verwendet wie die bisherigen Präsentationen
Reveal.js. Zum Öffnen im Browser werden die Reveal.js-Dateien vom CDN geladen.

Die Oberfläche umfasst Geräte, Gruppen, Domainsperren, Vorlagen, Internetzeiten,
Werbeschutz und Prioritäten. Unter **Schutz** werden Änderungen derzeit als
lokale Entwürfe im Browser-Tab bearbeitet, nicht an Backend oder Router gesendet.
Bestätigte Routerwerte werden davon getrennt angezeigt. Internetzeiten und
Routerkonfiguration haben eigene Speicherpfade; eine erfolgreiche Speicherung
belegt allein noch keine Routerwirkung. Dashboard-Bereiche und Layout bleiben
anpassbar, Website und App unterstützen mobile Ansichten.

**Gespeichert ist nicht automatisch am Router aktiv:** Maßgeblich ist die
ausgewiesene Routerbestätigung. Feste Mbit/s-/Prozentanteile sind keine fertige
Funktion. Live-Werte stammen aus den als Routerdaten gekennzeichneten
API-Antworten. Bei bestätigtem Offline-Modus verwendet das Frontend getrennte
Beispieldaten; Verbindungs- oder Anmeldefehler werden nicht als Demo kaschiert.
Das Demo-Konto kann zusätzlich eine ausdrücklich gekennzeichnete temporäre
Vorschau einschalten. Fehlende Live-Daten werden nicht mit Beispielen aufgefüllt.

Die [Abschlusspräsentation 2025/26](Documentation/revealjs/nethera-abschlusspraesentation.html)
bleibt als historischer Rückblick erhalten. Ihre früheren Kennzahlen sind keine
aktuelle Erhebung; unbelegte Live-/Testaussagen sind als offene Nachweise
gekennzeichnet. Für eine aktuelle Vorführung zusätzlich die Präsentationsprüfung
und den tatsächlich bestätigten Funktionsstand beachten.

Die Regeltests lassen sich ohne laufendes Backend ausführen:

```bash
node --test Applikation/tests/rules.test.cjs
```

Bekannte Grenzen: Das tägliche Datenvolumen wird ohne kumulierten Zähler als
unbekannt angezeigt, nicht mehr aus Geschwindigkeiten abgeleitet. Die Bedeutung
der DNS-Zähler muss mit dem jeweiligen Router-Datenlieferanten abgeglichen
werden; eine UI-Anzeige allein ist kein Wirksamkeitsnachweis.
Die direkte Backend-Entwicklungskonfiguration nutzt `drop-and-create`.
Vor `./mvnw quarkus:dev` deshalb eine isolierte Entwicklungsdatenbank verwenden
oder die Datenbank sichern und die ORM-Konfiguration prüfen. Compose und
LeoCloud überschreiben dies bereits mit `update` und `no-file`.

Ein Git-Push aktualisiert LeoCloud nicht automatisch. Dafür Images neu bauen,
in GHCR veröffentlichen, die Image-Versionen im Deployment aktualisieren und
den Rollout prüfen; siehe [LeoCloud-Anleitung](deploy/leocloud/README.md).
Lokale und Cloud-Datenbanken sowie Keycloak-Konten bleiben voneinander getrennt.

## Frontend ohne Container lokal starten

Wenn Backend und Keycloak bereits laufen, kann die aktuelle Website und App direkt aus dem Arbeitsordner gestartet werden:

```bash
python3 scripts/serve-local.py
```

- Website: http://localhost:5500/
- App mit Anmeldung: http://localhost:5500/index.html?entry=website

Der Server bildet die URL-Pfade des Frontend-Containers nach. Port `5500` ist für Keycloak-Weiterleitungen und Backend-CORS freigegeben. Backend und Keycloak müssen auf `8080` bzw. `8081` laufen. Der Frontend-Container darf währenddessen Port `5500` nicht belegen. Mit `Ctrl+C` wird der lokale Webserver beendet.

Ein neu angelegtes Keycloak-Konto liegt in der lokalen Datenbank und wird nicht durch einen Git-Push übertragen. Die Demo-Zugangsdaten oben gelten für eine frische Installation; bestehende Datenbanken behalten ihre bisherigen Konten.

## Farbpalette
- \#001818
- \#144659
- \#E5EBE7
- \#63E5C5
- \#212121 

Website und Applikation verwenden die gemeinsamen Farbvariablen aus [`Website/css/palette.css`](Website/css/palette.css). Transparente Flächen werden daraus abgeleitet; Rot und Gelb bleiben für Fehler- und Warnzustände erhalten.

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
