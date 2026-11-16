# Routerdaten und Demo strikt trennen

Stand: am 15.11.2026 auf LeoCloud ausgerollt. Die Image-Digests stehen in `deploy/leocloud/stack.yaml`.

Frontend-Erweiterung vom 16.11.2026: Die Schutzseite bietet zusaetzlich editierbare,
rein browserlokale Entwuerfe ohne Backend-Schreibzugriffe. Die unten beschriebenen
Router-Herkunftsregeln bleiben dabei erhalten; lokale Entwuerfe sind keine
Live-Daten. Abgrenzung, Speicherung und Backend-Uebergabe:
[`security-local-preview.md`](security-local-preview.md). Als ausschliessliches
Frontend-Update auf LeoCloud ausgerollt; Backend und Router bleiben unveraendert.

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

Schutz/Internetzeiten verwenden ausschliesslich Geraete aus dem ausgewaehlten Router-Snapshot, nicht die ungetrennte Geraeteliste aus `/api/security/state`. Zuordnungen und Zeitlimits anderer/alter Beispielgeraete bleiben verborgen. Gespeicherte Gruppen, Vorlagen und Sperrlisten bleiben Konfiguration, keine Bestaetigung der Routerwirkung; sie werden nicht geloescht. Die folgende Frontend-Erweiterung blendet solche unbestaetigten Regeln auch aus der Live-Ansicht aus.

### Herkunft der Schutzregeln (Frontend ausgerollt, 16.11.2026)

Der bisherige `SecurityStateResource` liest Gruppen, Vorlagen, Blocklisten und
Zuweisungen aus der Datenbank ohne Herkunftsnachweis. `sourceType` beschreibt den
Filtertyp, nicht die Datenquelle. Eine passende Geraete-ID oder `routerId` und ein
Apply-ACK sind ebenfalls kein Beleg, dass diese Eintraege vom Router gelesen wurden.
`RouterControlResource` bestaetigt die Uebernahme einer Sollversion, liefert aber
keinen vollstaendigen Regel-Readback. Unmarkierte Geraete-/Gruppenzuweisungen bleiben
deshalb verborgen. Fuer netzweite DNS-Sperren gilt die folgende bestaetigte Ausnahme.
Es werden keine Datenbankzeilen geloescht oder umetikettiert.

#### Bestaetigte Netzwerksperren (Korrektur vom 16.11.2026)

Der erste Herkunftsfilter war zu streng: Eine gespeicherte Liste muss nicht vom
Router stammen, um nach bestaetigter Uebernahme dort aktiv zu sein. Das Frontend
laedt deshalb `/api/security/state` und `/api/router-control/status` zusammen:

- `NETWORK`-Listen des ausgewaehlten Routers werden bei `connection: "online"`,
  gueltigem `checkedAt` und `blocklists[id].applied: true` ohne Fehler angezeigt.
  Das Backend bestaetigt `applied` nur bei ACK der aktuellen Sollversion.
- `DNS`-Listen brauchen zusaetzlich `adblock.installed`, `enabled` und `applied`
  jeweils `true`. Sie erscheinen auch unter den gespeicherten Werbe-Domains.
- Die Legacy-Status-API steuert auf LeoCloud Router 1. Ohne `routerId` gilt ihr ACK
  ausschliesslich fuer diesen Router; kuenftige Multi-Router-Antworten muessen ihre
  passende `routerId` liefern. Ein alter ACK-Zeitpunkt allein wird nicht verworfen:
  aktuelle Verbindung und bestaetigte Sollversion sind entscheidend.
- Domain-Normalisierung entspricht `DnsDesiredState.domains`. Kategorie-Tokens
  wie `adult` und ungueltige Domains sind nicht Teil der effektiven DNS-Konfiguration.
  Namen oder beispielhaft aussehende Domains sind kein Herkunftskriterium.
- Solche Listen erhalten nur frontendseitig `confirmationSource: "ROUTER_ACK"`,
  nicht `dataSource: "ROUTER"`. Dies bestaetigt die Uebernahme, keinen unabhaengigen
  DNS-Funktionstest oder eine vollstaendige Inventarisierung des Routers.
- Ein pauschales ACK fuer `PRESET`/`GROUP`/`DEVICE` reicht nicht: Die derzeitige
  Status-API bestaetigt auch ungenutzte Listen. Diese bleiben ohne Readback verborgen.
  `rulesKnown` bleibt falsch, Regelbearbeitung bleibt bis zur vollstaendigen Sicht
  gesperrt. Status-Aktualisierung laedt Listen und Bestaetigung gemeinsam neu.

Frontend-Vertrag fuer eine spaetere Backend-Erweiterung von `GET /api/security/state`:

- Jede Blockliste, Gruppe, Vorlage, Mitgliedschaft und Vorlagenzuweisung braucht
  `dataSource: "ROUTER"` und die passende positive `routerId`. Erst ein echter,
  routerbezogener Readback darf diese Felder setzen, nicht SQL-Seeds oder ein
  pauschales Update bestehender Zeilen. Bei veralteten/ungeprueften Daten muss die
  API die Markierung entziehen bzw. die Zeilen weglassen.
- IDs entsprechen den vorhandenen DB-IDs (positive Ganzzahlen oder dezimale Strings).
  Gruppen/Vorlagen liefern `blocklistId: null` fuer bestaetigt keine Blockliste oder
  eine ID aus den verifizierten Blocklisten. Unvollstaendige Referenzen bleiben
  verborgen; Mitgliedschaften/Zuweisungen brauchen verifizierte Gruppen/Vorlagen
  und ein Geraet aus dem ausgewaehlten Router-Snapshot.
- Nur fuer einen **vollstaendigen** Readback setzt die Antwort zusaetzlich oben
  `dataSource: "ROUTER", routerId: 1, rulesComplete: true` und liefert alle fuenf
  Arrays (`blocklists`, `groups`, `presets`, `members`, `assignments`), auch leere.
  `1` ist nur ein Beispiel; es muss die ID des ausgewaehlten Routers sein.
  Erst dann darf das Frontend aus fehlenden Eintraegen "keine Zuweisung" ableiten.
  Gemischte oder unvollstaendige Antworten zeigen die verifizierten Eintraege,
  behandeln fehlende Angaben aber als unbekannt.
- Solange keine vollstaendige Sicht vorliegt, sind Regel-Schreibaktionen gesperrt,
  damit ausgeblendete bestehende Zuordnungen nicht versehentlich ueberschrieben
  werden. Dies gilt auch fuer Prioritaetsprofile und das Anwenden von Vorlagen.
  Adblock-Installation/-Aktivierung mit dem bestehenden Router-Control-Vertrag
  und unabhaengige Internetzeiten behalten ihren bisherigen Ablauf.
- Offline-Demo, Router-Telemetrie, Konten, Backend, Routereinstellungen und
  Datenbanken bleiben unveraendert. Die Herkunft ist von der Routerwirkung
  (`applied`) getrennt; eine gelesene Regel ist nicht automatisch aktiv.

Gegen das aktuell deployte Backend bleiben unbestaetigte Gruppen/Vorlagen und ihre
Zuweisungen vorerst leer. Das ist **kein Nachweis**, dass am Router keine Regeln
existieren. Topologie und Internetzeiten kennzeichnen fehlende Vorlagen als nicht
gemeldet. Bestaetigte NETWORK-/DNS-Listen sind von dieser Einschraenkung ausgenommen.
Die Korrektur ersetzt den zu strengen Filter aus `da36b43` (Image `20261116-131208`).
Die oben beschriebene Backend-Erweiterung fuer vollstaendigen Readback steht weiter aus.
Digest, Abnahme und Rollback sind in `deploy/leocloud/README.md` dokumentiert.

## Noch nicht vorhandene Messungen

### Vollstaendige Offline-Demo (lokale Erweiterung vom 16.11.2026)

Die Frontend-Fixtures in `Applikation/api.js` enthalten acht Geraete, drei Gruppen,
drei Vorlagen, vier Sperrlisten, vier zugewiesene Zeitplaene (davon einen pausierten),
WLAN-Beispiele, DNS-, Aktivitaets- und Geschwindigkeitsdaten sowie eine Beispiel-Konfiguration.
Schutz, Internetzeiten und Topologie verwenden dieselben Zuordnungen. Die Summe der
Beispiel-Geraeteraten stimmt mit dem letzten Netzwerk-Messpunkt ueberein.

Alle Beispiel-Entitaeten verwenden negative IDs. Demo-Daten werden weder aus der
Produktivdatenbank gelesen noch dorthin geschrieben. Die Konfigurations- und
Regel-Endpunkte werden offline nicht abgefragt. Beispiele sind nur zur Ansicht;
Installation, Speichern, Entfernen und Umschalten bleiben gesperrt. Suchfelder,
Filter und Detailansichten bleiben bedienbar. Es wird keine echte Routerwirkung
simuliert oder als bestaetigt dargestellt.

Die API-Herkunftsregeln bleiben unveraendert: Bei `live` werden keine leeren Streams
oder Regeln mit Beispielen aufgefuellt; bei unbekanntem Status und API-Fehlern gibt
es keine Demo. Die Erweiterung benoetigt keine Backend- oder Datenbankaenderung.
Die lokal gestartete und die spaeter ausgerollte Version verwenden denselben
Fixture-Code, unabhaengig von SQL-Seeds in der jeweiligen Datenbank.

### Ausstehende Live-Daten

- WLAN-Analyse: die bisher fest eingebauten Netzwerke werden nur noch als ausdrueckliche Demo gezeigt. Live erwartet optional `wifiNetworks` im Router-Snapshot; bis es ein echtes Scan-Backend gibt, erscheint ein Leerzustand.
- `/api/connections/list` hat bisher keine Herkunft/Router-Zuordnung. Live werden nur Eintraege mit `dataSource: "ROUTER"` und passender `routerId` akzeptiert. Diese Erweiterung/Erfassung muss das Backend-Team fuer echte Einzelverbindungen liefern. Die Router-Gesamtgeschwindigkeit bleibt separat verfuegbar.
- Die konfigurierte Router-IP ist kein Messwert und wird nicht mehr als live ermittelte IP dargestellt. Fuer diese Anzeige ist ein vom Backend geliefertes `ipAddress` erforderlich.
- Installation/QoS/Filterdurchsetzung bleibt beim bisherigen Router-Control-Vertrag. Diese Aenderung implementiert keine dieser Routeraktionen.

## Sicherer spaeterer Rollout

1. Vor einem Produktions-Rollout Datenbank-Backup und Team-Abgleich durchfuehren.
2. `Backend/Nethera/migrations/20261115_telemetry_source.sql` vor dem neuen Backend ausfuehren. Das Skript fuegt nur Spalten hinzu; es loescht keine Zeilen, Tabellen, Konten oder Volumes. Auf `student-it220208` wurde es am 15.11.2026 nach geprueftem Backup erfolgreich ausgefuehrt. Andere bestehende Installationen muessen die Migration separat anwenden.
3. Das Cloud-Backend mit `validate` betreiben, niemals mit `drop-and-create` gegen bestehende Daten. Neues Backend bauen und separat freigeben lassen; danach den frischen MQTT/SSH-Eingang pruefen. Die Strategie `Recreate` verhindert zwei gleichzeitige MQTT-Consumer mit derselben Client-ID; dabei ist die API kurz nicht erreichbar.
4. Frontend zusammen mit diesem API-Vertrag aktualisieren. Gegen ein altes Backend zeigt es absichtlich einen unbekannten Datenstatus statt ungetrennter Beispieldaten.
5. Live, fehlender Einzelstream, Disconnect, Reconnect und API-Fehler pruefen. Vor jedem Schreibtest sicherstellen, dass echte Geraete ausgewaehlt sind.

Nach dem ersten Update koennen historische Werte fehlen, bis neue echte Telemetrie eintrifft. Die alten Zeilen bleiben erhalten, sind aber nicht automatisch nachtraeglich verifizierbar.

## Rollout-Pruefung am 15.11.2026

- Quellstand: `5008dcf`; Backend und Frontend gezielt ausgetauscht, kein erneuter Seed-Job.
- Beide Datenbanken vorab als PostgreSQL-Custom-Archive gesichert und deren Inhaltsverzeichnisse geprueft. Das Cloud-Schema mit Migration und neuem Backend zusaetzlich in einer isolierten lokalen Datenbank getestet; keine Produktivzeilen in diese Testdatenbank importiert.
- Backend und Frontend sind bereit und laufen mit den in `stack.yaml` hinterlegten Digests. MQTT-Verbindung und frischer Eingang von Geraeten, Speed und DNS bestaetigt.
- Keycloak-Kontenanzahl unveraendert; keine gepruefte Tabelle hat weniger Zeilen. Datenbank-, Keycloak- und Broker-Deployments sowie alle drei PVCs unveraendert.
- Website HTTP 200, API ohne Anmeldung HTTP 401, unveraenderter OIDC-Issuer. Ausgelieferte `index.html`, `api.js` und `data-source.css` bytegleich mit dem lokalen Stand.
- Router-Modell/Firmware sind noch nicht als `ROUTER` markiert und bleiben bis zum Eingang einer Metadatenmeldung im neuen Backend leer. Vorhandene alte Werte wurden nicht pauschal als verifiziert umetikettiert.

## Tests

```sh
node --test Applikation/tests/*.test.cjs
```

Im Verzeichnis `Backend/Nethera`:

```sh
./mvnw -Dtest='*Test,!ExampleResourceTest' test
./mvnw -Dtest=RouterDataSourceIT,BackendFixesIT,DeviceIngestorIT test
```

Die Integrationstests verwenden einen eigenen kurzlebigen PostgreSQL-Container, deaktivieren MQTT/Scheduler und greifen nicht auf vorhandene Projekt-Datenbanken oder den echten Router zu. Sie pruefen die Trennung von Seed- und echten Test-Telemetriedaten, leere Live-Streams, Offline-Antworten sowie den Erhalt gespeicherter Zeilen. Der anschliessende Cloud-Rollout wurde separat geprueft; es wurden keine Testbefehle an den Cudy gesendet.
