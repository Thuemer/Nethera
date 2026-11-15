# Routerdaten und Demo strikt trennen

Stand: lokal vorbereitet, nicht auf LeoCloud ausgerollt.

## Verhalten

- `live` / `online`: nur durch MQTT- oder SSH-Ingestoren als `ROUTER` markierte Telemetrie. Fehlende Streams bleiben leer; kein Auffuellen durch Demo-Werte.
- `demo` / `offline`: ausschliesslich separate, klar markierte Frontend-Beispiele. Negative Geraete-IDs und reservierte Dokumentationsadressen verhindern eine Verwechslung mit echten Datensaetzen. Keine Schreibaktionen.
- `unavailable` / `unknown`: keine Beispielwerte. Das gilt auch bei fehlenden Herkunftsfeldern, Authentifizierungsfehlern und API-Ausfaellen.
- Ein erreichbarer Router hat Vorrang vor einem getrennten Router in derselben Antwort. Gibt es nur unbekannte und getrennte Router, wird nicht automatisch eine Demo als gesicherter Gesamtstatus ausgegeben.
- Die sichtbare Seite prueft die Quelle alle 15 Sekunden; bei einem Moduswechsel wird die Darstellung ersetzt. Vor jeder schreibenden Aktion wird die Verbindung erneut geprueft.

## API und Persistenz

`GET /api/routers/list` behaelt die bestehenden Felder und ergaenzt pro Router:

```json
{ "dataMode": "live", "connection": "online", "checkedAt": "2026-11-15T18:00:00" }
```

`router`, `device`, `speed_stat`, `dns_stat` und `activity_log` erhalten `data_source` (`UNKNOWN` oder `ROUTER`). Bestehende Zeilen und SQL-Seeds bleiben unbekannt. Es wird weder anhand von Hostnamen/MAC-Adressen geraten noch pauschal die Historie zu echten Routerdaten erklaert. Kuenftige Telemetrie markiert ihre eigenen Datensaetze; alte unbekannte Messreihen werden nicht in Live-Diagramme gemischt.

`router.connection_checked_at` belegt einen geprueften Kontakt. `is_online` allein reicht nicht: auch alte Seeds setzen dieses Feld. Ein Kontakt ist standardmaessig 180 Sekunden frisch (`nethera.telemetry.live-max-age` / `NETHERA_TELEMETRY_LIVE_MAX_AGE`). Danach wird ohne Datenbank-Loeschung auf offline/Demo gewechselt. Retained MQTT-Metadaten allein bestaetigen keine aktuelle Verbindung. Modell/Firmware werden erst nach echtem Metadatenempfang angezeigt; eine erste Teilantwort uebernimmt keine unbekannten alten Firmwarewerte.

Offline- und Unknown-Antworten enthalten keine Telemetrie-Arrays mit alten echten oder Beispielwerten. Die Demo wird nur bei explizitem `demo` + `offline` oder einer erfolgreich geladenen leeren Routerliste im Frontend erzeugt. Die Demo erzeugt keine DB-Zeilen.

Schutz/Internetzeiten verwenden ausschliesslich Geraete aus dem ausgewaehlten Router-Snapshot, nicht die ungetrennte Geraeteliste aus `/api/security/state`. Zuordnungen und Zeitlimits anderer/alter Beispielgeraete bleiben verborgen. Gespeicherte Gruppen, Vorlagen und Sperrlisten bleiben Konfiguration, keine Bestaetigung der Routerwirkung; sie werden nicht geloescht.

## Noch nicht vorhandene Messungen

- WLAN-Analyse: die bisher fest eingebauten Netzwerke werden nur noch als ausdrueckliche Demo gezeigt. Live erwartet optional `wifiNetworks` im Router-Snapshot; bis es ein echtes Scan-Backend gibt, erscheint ein Leerzustand.
- `/api/connections/list` hat bisher keine Herkunft/Router-Zuordnung. Live werden nur Eintraege mit `dataSource: "ROUTER"` und passender `routerId` akzeptiert. Diese Erweiterung/Erfassung muss das Backend-Team fuer echte Einzelverbindungen liefern. Die Router-Gesamtgeschwindigkeit bleibt separat verfuegbar.
- Die konfigurierte Router-IP ist kein Messwert und wird nicht mehr als live ermittelte IP dargestellt. Fuer diese Anzeige ist ein vom Backend geliefertes `ipAddress` erforderlich.
- Installation/QoS/Filterdurchsetzung bleibt beim bisherigen Router-Control-Vertrag. Diese Aenderung implementiert keine dieser Routeraktionen.

## Sicherer spaeterer Rollout

1. Vor einem Produktions-Rollout Datenbank-Backup und Team-Abgleich durchfuehren.
2. `Backend/Nethera/migrations/20261115_telemetry_source.sql` vor dem neuen Backend ausfuehren. Das Skript fuegt nur Spalten hinzu; es loescht keine Zeilen, Tabellen, Konten oder Volumes. Es wurde in dieser Aufgabe nicht auf vorhandenen lokalen oder Cloud-Datenbanken ausgefuehrt.
3. Das Cloud-Backend mit `validate` betreiben, niemals mit `drop-and-create` gegen bestehende Daten. Neues Backend bauen und separat freigeben lassen; danach den frischen MQTT/SSH-Eingang pruefen. Die Strategie `Recreate` verhindert zwei gleichzeitige MQTT-Consumer mit derselben Client-ID; dabei ist die API kurz nicht erreichbar.
4. Frontend zusammen mit diesem API-Vertrag aktualisieren. Gegen ein altes Backend zeigt es absichtlich einen unbekannten Datenstatus statt ungetrennter Beispieldaten.
5. Live, fehlender Einzelstream, Disconnect, Reconnect und API-Fehler pruefen. Vor jedem Schreibtest sicherstellen, dass echte Geraete ausgewaehlt sind.

Nach dem ersten Update koennen historische Werte fehlen, bis neue echte Telemetrie eintrifft. Die alten Zeilen bleiben erhalten, sind aber nicht automatisch nachtraeglich verifizierbar.

## Tests

```sh
node --test Applikation/tests/*.test.cjs
```

Im Verzeichnis `Backend/Nethera`:

```sh
./mvnw -Dtest='*Test,!ExampleResourceTest' test
./mvnw -Dtest=RouterDataSourceIT,BackendFixesIT,DeviceIngestorIT test
```

Die Integrationstests verwenden einen eigenen kurzlebigen PostgreSQL-Container, deaktivieren MQTT/Scheduler und greifen nicht auf vorhandene Projekt-Datenbanken oder den echten Router zu. Sie pruefen die Trennung von Seed- und echten Test-Telemetriedaten, leere Live-Streams, Offline-Antworten sowie den Erhalt gespeicherter Zeilen. Der echte Cudy und LeoCloud wurden dabei nicht veraendert.
