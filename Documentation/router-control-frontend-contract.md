# Routersteuerung: Übergabe für Backend und Cudy

Stand: 15. November 2026. Dieses Dokument beschreibt den Vertrag der neuen Frontend-Oberfläche. Die Änderungen in diesem Arbeitsstand betreffen **nur das Frontend**. Weder Routerbefehle noch Backend-Endpunkte wurden implementiert oder am Cudy getestet.

## Bereits vorhandene Schreibwege

| Funktion | Vorhandener API-Schreibweg | Was er heute belegt |
| --- | --- | --- |
| Werbeschutz | `PUT /api/configs/{id}` mit `dnsBlocking` | Gewünschte Einstellung in PostgreSQL |
| Priorität | `POST /api/security/presets`, danach `PUT /api/security/devices/{deviceId}/preset/{presetId}` | Preset und Gerätezuweisung |
| Websites | `POST /api/security/blocklists`, ggf. Gruppen-/Preset-Zuweisung | Domainliste und Geltungsbereich |
| Internetzeiten | `PUT`/`DELETE /api/device-time-limits/{deviceId}` | Zeitregel in PostgreSQL |

Ein HTTP-200 dieser Endpunkte **ist keine Routerbestätigung**. Die Oberfläche zeigt deshalb bis zum Hardware-Nachweis „Nur gespeichert“.

## Neuer Lese-Endpunkt

`GET /api/router-control/status` muss authentifiziert sein und nur den Router des angemeldeten Nutzers betreffen. Eine mögliche Antwort:

```json
{
  "connection": "online",
  "checkedAt": "2026-11-15T13:00:00Z",
  "capabilities": { "adblockInstall": true },
  "adblock": { "installed": true, "enabled": true, "applied": true },
  "priority": { "12": { "mode": "high", "applied": true } },
  "blocklists": { "4": { "applied": true } },
  "timeLimits": { "12": { "applied": true, "blockedNow": false } }
}
```

- `connection`: `online`, `offline` oder `unknown`. `checkedAt` ist der Zeitpunkt eines **frischen Router-Readbacks**, nicht der DB-Speicherung.
- Das Frontend zeigt eine Routerbestätigung nur bei `connection: "online"` und passendem `applied: true`. Ein alter Einzelstatus bei Offline-Verbindung gilt nicht als Nachweis.
- `applied: true` darf nur gesetzt werden, wenn die **aktuelle gespeicherte Version** der jeweiligen Einstellung am Router nachgelesen wurde. Ein früherer Erfolg oder eine gesendete Nachricht genügt nicht. Bei ausstehendem Sync `applied: false` verwenden; bei Fehler optional `error` ergänzen.
- Die Schlüssel unter `priority` und `timeLimits` sind Geräte-IDs, die unter `blocklists` Blocklisten-IDs. `mode` ist `high` oder `normal`; `blockedNow` darf nur eine vom Router bestätigte aktuelle Wirkung beschreiben.
- Bei fehlendem Endpunkt (`404`/`501`) zeigt das Frontend ausdrücklich „Routerbestätigung noch nicht verfügbar“. Netzwerk-/Auth-Fehler dürfen nicht als Erfolg kaschiert werden.
- Nach jedem relevanten Schreibvorgang sollte das Backend die Konfiguration anwenden und den Status aktualisieren. Das Frontend fragt nach dem Speichern erneut ab; „Status prüfen“ erlaubt einen weiteren Abruf.
- Für langlebige und asynchrone Übernahmen sollte das Backend pro Regel einen gewünschten Versionswert und eine zuletzt bestätigte Version führen. `applied` ist nur bei Übereinstimmung wahr. Nur dieser boolesche Vergleich gelangt an die UI.

## Adblock-Installation

`POST /api/router-control/adblock/install` wird vom Frontend nur angeboten, wenn `capabilities.adblockInstall === true` und `adblock.installed === false`. Die Antwort bestätigt zunächst nur die Annahme des Auftrags. Installiert/aktiv ist Adblock erst nach dem neuen Readback aus `GET /api/router-control/status`.

Das Backend muss Paketmanager und Firmware des konkreten Cudy erkennen, Installationsfehler zurückgeben und die Aktion idempotent machen. Aktivieren/Deaktivieren folgt weiterhin der gewünschten Einstellung `dnsBlocking`; der Routerstatus muss den tatsächlichen Dienstzustand separat ausweisen. Keine Zugangsdaten oder Shell-Befehle aus dem Browser an den Router weiterreichen.

## Aufgaben pro Issue

- **#23 AdBlocker:** Paket/Firmware-Kompatibilität prüfen, Paket installieren, DNS-Filter anwenden, Dienststatus und tatsächliche DNS-Filterwirkung am Router auslesen. `dnsBlocking` aus der DB allein beweist keine Aktivierung.
- **#24 Priorisierung:** Gerät anhand seiner MAC-Adresse auf dem Router zuordnen, priorisierte QoS-Regel anwenden und am Router nachlesen. `mode: high` allein beweist keine Bandbreitenwirkung. Normale Priorität muss die alte Regel zuverlässig entfernen.
- **#25 Websites sperren:** `NETWORK`, `GROUP`, `DEVICE` und `DNS` getrennt auflösen. Domain-Eingaben serverseitig validieren, Duplikate vermeiden, Änderungen am Router anwenden und per DNS-/Firewall-Test aus einem betroffenen sowie einem nicht betroffenen Gerät prüfen. Kategorien wie `adult` sind bisher nur Tokens; sie benötigen eine tatsächliche Domainquelle oder müssen als nicht unterstützt ausgewiesen werden. Die bestehende DB-Spalte `BlockList.urlPattern` ist standardmäßig kurz und sollte für echte Listen als Textspalte migriert werden.
- **Router-Zuordnung:** Das bestehende Frontend schreibt für neue Blocklisten noch `routerId: 1`; die vorhandenen State- und Schreibendpunkte liefern keine nutzerbezogene Router-Zuordnung. Vor Multi-Router-Betrieb muss das Backend den Router aus dem angemeldeten Konto ableiten und die ID serverseitig validieren, statt einem Browserwert zu vertrauen.
- **#27 Zeitlimits:** Zeitfenster und Pausenstatus pro Geräte-MAC auf dem Router umsetzen, einschließlich Mitternachtsübergang, Neustart und Zeitzone. Das Tagesbudget benötigt einen vom Router gemessenen Nutzungszähler; `usedMinutesToday` aus dem Browser ist kein Nachweis. Löschen und Ausschalten müssen alte Regeln am Router entfernen.

## Abnahme am echten Router

Der Cudy ist von diesem Entwicklungsrechner momentan nicht erreichbar. Vor „fertig“ für diese Issues sind daher noch Hardware-Tests nötig:

1. Auf dem Cudy Paket-/Dienststatus vor und nach Installation/Aktivierung prüfen; DNS-Anfragen einer betroffenen Station testen.
2. Ein Gerät priorisieren und die QoS-Regel am Router nachlesen; auf `normal` zurückstellen und Entfernung prüfen.
3. Eine Testdomain für Netzwerk, Gruppe und Einzelgerät sperren; Gegenprobe mit nicht betroffenem Gerät; danach Eintrag bearbeiten/entfernen und Wirkung erneut prüfen.
4. Ein Zeitfenster inklusive Mitternacht testen, Regel pausieren/löschen und Router-Neustart prüfen. Tagesbudget erst als wirksam markieren, wenn ein echter Routerzähler vorliegt.
5. Backend-/Router-Verbindungsfehler simulieren: UI muss „nicht bestätigt“ anzeigen und bereits gespeicherte Regeln dürfen nicht verschwinden.

Keine Änderung aus diesem Dokument ohne gesonderten Review in LeoCloud oder auf den echten Router ausrollen.

## Sichtprüfung und Abnahmestand

Die lokale Anmeldung und die Datenansichten wurden im Browser geprüft. Die lokale Datenbank enthält Demo-/Bestandsdaten; der laufende Backend-Container ist nicht der neu gebaute aktuelle Quellstand. Ein UI-Test gegen diesen Container ersetzt deshalb keinen Integrationstest des finalen Backend-Images.

| Story | Was die Oberfläche heute auslöst | Noch offen vor Abnahme |
| --- | --- | --- |
| #17 Anmeldung | Keycloak-Login und Rückleitung in die App | Rollen-/Zugriffsprüfung und Abmelden/Sitzungsablauf in der finalen Zielumgebung |
| #23 AdBlocker | Speichert `dnsBlocking`; Installationsaufruf ist vorbereitet und bis zur Backend-Freigabe deaktiviert | Installation, Dienststeuerung und DNS-Wirkung am Router |
| #24 Priorisierung | Speichert ein Geräte-Preset mit `priorityMode` und weist es dem Gerät zu | QoS-Anwendung, Bestätigung und Gegenprobe auf normale Priorität |
| #25 Websites | Speichert Domainlisten und Geräte-/Gruppenzuordnungen | DNS-/Firewall-Anwendung einschließlich nicht betroffener Geräte |
| #27 Zeitlimits | Speichert tägliche Sperrzeit, Tagesbudget und Pausenstatus | Router-Scheduler, Zeitzone und echter Nutzungszähler |
| #29 Alles funktioniert | Frontend-Regressionsprüfungen sind vorhanden | End-to-End-Abnahme mit finalem Backend, Router, Neustart und Verbindungsabbruch |

Keine dieser Router-Stories wurde durch die Frontend-Arbeit als vollständig abgeschlossen markiert.

## Topologie und Schutz-Navigation

Die Topologie liest ausschließlich `GET /api/routers/list` und `GET /api/security/state` mit dem bestehenden Auth-Header. Sie schreibt keine Regeln und benötigt keine Neo4j-Datenbank. Cytoscape übernimmt Graphdarstellung, Zoom und Touch-Interaktion; die Bibliothek wird lokal mitgeliefert.

- Gruppenzuordnung: `members[].deviceId/groupId` mit `groups[].id/name`, getrennt von `devices[].connectionType`.
- Vorlagen: `assignments[].deviceId/presetId/status` mit `presets[]`. Eine pausierte Zuweisung wird als pausiert dargestellt, nie als aktiver Schutz.
- Zeitregeln: `timeLimits[]` mit Geräte-ID, Sperrzeiten, Tagesbudget und Status.
- Nur Geräte des angezeigten Routers werden übernommen; Regeln anderer Geräte erzeugen keine zusätzlichen Graphknoten.
- Fehlende Schutzdaten ergeben „nicht verfügbar“, nicht „keine Regeln“. Gruppenzuordnung und Vorlagen bleiben gespeicherte Daten, keine bestätigte Routerwirkung.
- Legendenfilter und Suche verändern nur die Ansicht. „Anordnung zurücksetzen“ stellt das anfängliche Layout wieder her, ohne Konfiguration zu schreiben.

Die sechs Schutzbereiche stehen direkt unter dem Seitentitel. Die Tab-Navigation unterstützt Pfeiltasten, Pos1/Ende und die Zuordnung von Tabs zu Panels per ARIA.

Lokal geprüft: Desktop (1440 × 1000) und Handybreite (390 × 844), Gruppenfilter, Suche ohne Treffer, Geräteauswahl inklusive Vorlage, Verbindungsansicht, Zoom, Verschieben und Zurücksetzen sowie Tastaturbedienung der Schutz-Tabs. Dabei wurden keine Regeln oder Routereinstellungen verändert. Die Graphansicht ersetzt keine Live-Abnahme am Cudy.

Zusätzlicher Befund: `Connection.download`/`upload` besitzen keinen dokumentierten kumulativen Tageszähler. Die frühere Umrechnung ihrer Summe in GB wurde im Frontend entfernt. Das Backend-Team muss für „Datenvolumen heute“ Zählertyp, Einheit, Tagesgrenze und Zeitstempel definieren. Historische Demo-Werte und `isOnline` aus gespeicherten Routerdaten sind kein Live-Nachweis.
