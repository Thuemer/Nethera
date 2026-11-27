# Nethera auf LeoCloud

Die Instanz liegt unter https://it220208.cloud.htl-leonding.ac.at/ im Namespace
`student-it220208`. Das Ingress leitet `/` an das Frontend, `/api` an Quarkus und
`/realms`, `/resources` sowie `/admin` an Keycloak weiter. Die Anwendung nutzt
zwei PostgreSQL-Datenbanken mit eigenen PersistentVolumeClaims. Der einmalige
Seed-Job fuegt Demo-Daten nur in leere Tabellen ein.

Frontend, Backend und Keycloak mit Nethera-Theme werden als private `linux/amd64`-Images aus diesem Projekt
nach `ghcr.io/denizbernecker/` gepusht. Kubernetes zieht sie ueber das Secret
`ghcr-pull`. Datenbank-, Admin- und Demo-Passwoerter liegen ausschliesslich im
Kubernetes-Secret `nethera-runtime`, nicht in diesem Repository. Der Cloud-Realm
liegt als `nethera-realm`-Secret vor. Seine Login-URLs und das Demo-Passwort
wurden fuer diese Instanz angepasst. Das aktive Login-Theme liegt im Keycloak-Image;
die bisherige ConfigMap `nethera-theme` bleibt fuer einen Rollback erhalten, ist
aber nicht mehr eingebunden. Der Demo-Seed liegt in `nethera-seed`.

## Zugang und Status

Der Benutzername fuer die Demo-Anmeldung ist `demo`. Das zufaellige Passwort
kann der Namespace-Inhaber in seinem eigenen Terminal anzeigen:

```bash
kubectl --context leocloud -n student-it220208 get secret nethera-runtime -o jsonpath='{.data.demo-password}' | base64 -D
```

Das Admin-Passwort laesst sich analog ueber den Key `admin-password` abfragen.
Passwoerter und Tokens nicht in Chats, Tickets oder Commits kopieren.

```bash
kubectl --context leocloud -n student-it220208 get pods,pvc,ingress
kubectl --context leocloud -n student-it220208 logs deployment/nethera-backend --tail=100
```

## Lokal starten

Der lokale Compose-Stack bleibt unabhaengig von LeoCloud:

```bash
docker compose up -d --build
```

Die lokale Seite laeuft auf http://localhost:5500/. Lokale Docker-Volumes und
LeoCloud-Volumes sind getrennte Datenbestaende. Weder ein lokaler Neustart noch
ein Cloud-Rollout synchronisiert diese Daten automatisch.

## Aenderungen deployen

### Gemeinsamer Release: Zeitpläne, Live-Sperren und Priorität (27.11.2026)

**Dieser gemeinsame Quellstand integriert `52c9989` (Zeitpläne/Cloud-Korrekturen) und
`f83ad40` (Priorisierung). Es wurde hier noch nichts auf LeoCloud ausgerollt.**
Die folgende Vorbereitung erhält die bestehende gemeinsame Router-Nutzung und
die bisherige Anmeldung. Das normale Branch-Backend enthält zusätzlich die
Ownership-Arbeit und ist deshalb **nicht direkt** der Cloud-Build.

Lokale Änderungen auf Deniz' Rechner zuerst sichern/committen und `main` ohne
Verwerfen eigener Arbeit aktualisieren. Dann im Repository:

```sh
RELEASE_COMMIT=$(git rev-parse HEAD)
RELEASE_DIR=$(mktemp -d /tmp/nethera-release-parent.XXXXXX)/combined
node deploy/leocloud/prepare-time-release.mjs "$RELEASE_DIR" "$RELEASE_COMMIT"
```

Der Zielordner darf zuvor nicht existieren. `release-source.json` nennt die
Revision, unveränderten Baselines, ausgewählten Dateien und beide Adapter.
`WORKTREE` ist nur für lokale Tests. Der Generator prüft die Login-Prüfsumme
`8912b216f8c534c814434cc235ceb988f20bae0a0bafc41fe85473e4328a3b2f`.
Der zusätzliche `priority-cloud.patch` prüft neue Prioritäts-Schreibzugriffe gegen
den konfigurierten gemeinsamen Router. Er ersetzt keine Konten, keine DNS- oder
Zeitplan-Basis und verlangt keine Ownership-Migration.

Vor dem tatsächlichen Rollout die Anleitung aus `AGENTS.md` und
`https://cloud.htl-leonding.ac.at/llms.txt` befolgen. Aktuelle Backend-/Frontend-
Image-Digests und beide Datenbanken sichern. Die Zeitplan-Migration vom 22.11.
ist laut bestehendem Release-Protokoll bereits angewendet; das prüfen. Dann
**nur die neue additive Migration** aus dem erzeugten Release vor dem Backendwechsel:

```sh
kubectl --context leocloud -n student-it220208 exec -i deployment/nethera-db -- \
  psql -v ON_ERROR_STOP=1 -U nethera -d nethera \
  < "$RELEASE_DIR/Backend/Nethera/migrations/20261127_device_priority.sql"
```

Danach neue private `linux/amd64`-Images mit neuen Tags aus **diesem Zielordner**
bauen (Backend-Kontext `$RELEASE_DIR/Backend/Nethera`, Frontend-Dockerfile
`$RELEASE_DIR/Applikation/Dockerfile` mit Kontext `$RELEASE_DIR`). Nach dem bisherigen
Verfahren nur Backend-/Frontend-Imagefelder austauschen und Rollouts abwarten.
**Kein vollständiges `stack.yaml apply`, kein Seed-Import, kein Datenbankreset.**
Keycloak, Accounts, Secrets, Broker und PVCs bleiben erhalten. Die bestehenden
MQTT-ACL-Wildcards decken `config/priority` und `telemetry/priority` bereits ab;
die aktive ACL prüfen, nicht pauschal ersetzen oder den Broker neu starten.

Den Router muss Deniz nicht vor Ort haben. Der separate Prioritätsdienst ist auf
dem Cudy bereits installiert; für diesen Cloud-Rollout **keinen Router-Agenten
ersetzen und `scripts/router-deploy.sh` nicht ausführen**. Der bestehende Agent
behält Zeitplan-/DNS-Funktionen, der zusätzliche Dienst bearbeitet nur Priorität.

Abnahme nach dem Rollout bei online verbundenem Router: bestehende Anmeldung,
AdBlocker, Netzwerksperre, Gerätesperre, Kinder-Gruppensperre und Zeitplan prüfen;
danach ein bekanntes Gerät Bevorzugt → Routerbestätigung → Normal → Bestätigung.
Neue Formularrückmeldungen unterscheiden Speicherung und Routerwirkung.
TikTok-/App-Zugriff und Verhalten unter Last sind zusätzlich am betroffenen Gerät
zu testen. Es wurde in dieser Integrationssitzung kein echter Routertest wiederholt.

Rollback: Testprioritäten/-zeitregeln erst kontrolliert aufheben und bestätigen,
dann gesicherte Backend-/Frontend-Digests wiederherstellen. Additive Tabellen
bleiben bestehen. Ein Image-Rollback allein entfernt keine bereits aktiven Regeln.
Details und Tests: [Gerätepriorität](../../Documentation/device-priority.md) und
[Integrationsprüfung](../../openspec/changes/device-priority-control/cloud-integration-verification.md).

### Zeitplan-Bridge: kompatibler Cloud-Build (22.11.2026)

Die laufende Cloud benutzt noch die gemeinsame Router-Zuordnung. Der Branch
`feat/router-time-schedules` enthaelt durch seine Basis bereits die separate
Ownership-Arbeit des Teams. Diese ist fuer diesen Rollout **nicht** freigegeben.
Nicht das gesamte Branch-Backend bauen und keine Ownership-Migration ausfuehren.

`prepare-time-release.mjs` erzeugt einen neuen, isolierten Build-Ordner:

```sh
node deploy/leocloud/prepare-time-release.mjs /tmp/nethera-time-release <commit>
```

Backend-Basis ist exakt `6065a405` plus nur `DeviceIngestor.java` und dessen Test
aus `655dd275`, wie im laufenden Release vom 20.11. Dazu kommen die explizit im
Skript gelisteten Zeitplan-Dateien und `time-schedules-cloud.patch`. Der Patch
erhaelt die angemeldete gemeinsame Nutzung von Router `nethera.router.id` und
verhindert Zeitplan-Schreibzugriffe auf andere Router. DNS-Steuerung und deren
Konfiguration bleiben auf der laufenden Basis. Das Frontend basiert auf
`f38f6204` plus den Zeitplan-Aenderungen; `account.js` bleibt bytegleich zur Cloud
(SHA256 `8912b216f8c534c814434cc235ceb988f20bae0a0bafc41fe85473e4328a3b2f`).

Vor dem Backend-Imagewechsel beide Datenbanken sichern und **nur**
`Backend/Nethera/migrations/20261122_time_control_bridge.sql` ausfuehren.
Bestehende Zeitregeln erhalten `router_enforcement=false` und werden nicht
automatisch aktiviert. Schema-Modus bleibt `validate`, kein Seed-Import.
Der MQTT-Zeitplan-Retry verwendet einen eigenen Vert.x-Timer/Worker, damit der
allgemeine Scheduler weiterhin ausgeschaltet bleiben kann. Keine Broker-,
Keycloak-, Secret- oder Volume-Aenderung erforderlich.

Die erzeugte `release-source.json` dokumentiert die Basis und die Quellrevision.
`WORKTREE` ist nur fuer lokale Vorabtests; ein Release muss einen Commit angeben.
Die fuenf Tests in `account-router.test.cjs` gehoeren ausschliesslich zur noch
nicht ausgerollten Ownership-Oberflaeche. Sie werden im vollstaendigen Branch
getestet, nicht gegen das absichtlich beibehaltene Cloud-Login. Alle anderen
Frontend-Tests muessen auch im Cloud-Build bestehen.

Rollback: aktive Testregeln zuerst entfernen und die Routerbestaetigung abwarten,
dann bei Bedarf die vorherigen Images zuruecksetzen. Additive Tabellen/Spalten
und beide Datenbanken bleiben erhalten; nie Volumes loeschen.

#### Ausgerollter Stand und Abnahme

- Branch `feat/router-time-schedules`: Implementierung `e08d1db`, finale
  Frontend-Build-Auswahl `6e7bc1d`. Frische Fetches ergaben keine neueren
  Team-Commits; nur eigener Branch gepusht, kein Merge/Force-Push.
- Backend `ghcr.io/denizbernecker/nethera-backend:20261122-214210`, Digest
  `sha256:e0ed3ff5d4251bbc877d02174aa36269565202c96ef66505200d67364baede15`.
- Frontend `ghcr.io/denizbernecker/nethera-frontend:20261122-214620`, Digest
  `sha256:3597f1a58e333ce67d107467ae3e4acb1fd78d587e66337b1c5bd2665f1528a1`.
- Beide Images privat, linux/amd64. Rollouts erfolgreich; laufende Pod-Digests
  stimmen mit GHCR ueberein. Ausschliesslich Image-Felder per atomarem JSON-Patch
  getauscht; kein vollstaendiges `stack.yaml apply`, kein Seed-Job.
- Beide Datenbanken gesichert unter
  `~/NetheraBackups/20261122-213800-time27-cloud/`. Dumps mit pg_restore geprueft;
  Nethera-Dump in isoliertem Postgres wiederhergestellt und Migration zweimal
  getestet. Danach Migration auf LeoCloud **vor** dem Backendwechsel ausgefuehrt.
- Vor/nach Rollout und Test: 13 geschuetzte Tabellen unveraendert (darunter sieben
  Accounts, sieben Keycloak-Credentials, Gruppen, Sperrlisten, Vorlagen und die
  vorhandene pausierte Zeitregel). PVCs sowie alle sonstigen Deployment-Felder
  unveraendert. Keycloak und Broker wurden nicht neu gestartet.
- Alle 82 Frontend-Dateien mit dem vorherigen Cloud-Pod verglichen: nur
  `index.html` (Cache-Version), `security.html/.js` und `time-limits.html/.js`
  unterscheiden sich. Website, Topologie und Anmeldung bytegleich. Vier nicht
  veroeffentlichte OneDrive-Duplikate bleiben auch im neuen Image ausgeschlossen.
- 142 Backend-Tests im Feature-Branch, 127 im Cloud-Kompatibilitaetsbuild;
  122 bzw. 117 passende Frontend-Tests erfolgreich. Go-Race/nft-Tests isoliert
  erfolgreich. Zeitplan-Browsertest am finalen Image bei 1440/768/390/320 px
  erfolgreich. HTTP: Website/Discovery 200, geschuetzte APIs ohne Login 401.
- Echte Anmeldung nach Rollout erhalten. Am 22.11. gegen 22:51 Wien nur das
  genehmigte Test-iPhone ueber die Website mit Fenster 22:50-22:53 gesperrt:
  frische Routerbestaetigung und vom Nutzer bestaetigter Ausfall neuer Seiten.
  Danach vor Fensterende ueber die Website ausgeschaltet: ACK und vom Nutzer
  bestaetigte Internet-Freigabe. Testregel anschliessend geloescht.
- Abschluss: keine aktivierte Zeitregel; leeres `devices`-Objekt am Router
  bestaetigt, gewuenschte/gemeldete Version `1795384312622`, Uhr synchron,
  kein Fehler. Urspruengliche Daten wieder unveraendert.
- Netzwerksperre `tiktok.com` und Adblock-Probe `accounts.doubleclick.net` vor
  und nach Test NXDOMAIN; `example.com` normal aufgeloest. DNS-Inhalt, Version
  und Adblock-Bestaetigung unveraendert. Geraetespezifische DNS-Zuweisungen
  wurden nicht veraendert; deren Regression ist automatisiert abgedeckt.

Vorherige Images fuer den moeglichen Rollback:
Backend `20261120-113326@sha256:55fafe39000f24bd24ac1b7f92d2c7b51cc4723c1f0dfdba004348a5f3b458e2`,
Frontend `20261120-113300@sha256:4a4ef7731a1f830828181191983456e6292e718966483ad5902d73e792a2bafb`.
Noch nicht abgenommen sind die Verbrauchsschwelle fuer Tagesbudgets und die
vollstaendige Hardware-Matrix; Phase B (wiederverwendbare Wochen-/Gruppenplaene,
Sofort-Overrides) ist weiterhin offen.

Code- oder Theme-Aenderungen erscheinen nicht automatisch auf LeoCloud. Fuer
Frontend- oder Backend-Code ist jeweils ein neuer Image-Build mit einem neuen
UTC-Zeitstempel-Tag, ein Push nach GHCR und eine Anpassung des entsprechenden
`image:`-Eintrags in `stack.yaml` erforderlich. Bei einer bestehenden Instanz
nur das betroffene Deployment gezielt aktualisieren, z.B. mit `kubectl set image`;
nicht fuer einen Code-Rollout den kompletten Stack samt Seed-Job erneut anwenden.
Danach die Rollouts sowie Image-Digests pruefen. Nie einen alten Tag erneut verwenden.

Fuer das Login-Theme wird ausschliesslich `themes/nethera/` mit dem dortigen
Dockerfile gebaut. Die Keycloak-Basisversion und ihr Digest bleiben dabei fest;
ein Design-Update ist kein Keycloak-Versionsupgrade. Anleitung und Rollback:
`themes/nethera/README.md`.

### Mockup-getreue Topologie vom 19.11.2026

Aktuelles Frontend: `ghcr.io/denizbernecker/nethera-frontend:20261119-113142`,
privat, `linux/amd64`, Digest
`sha256:74611941299557b652e3c54545751ec4ab4ae126b486cda8ffb5facd79bce009`.
Quelle: `6444fedd13595eb2cdb28ef84a975821638862e9` auf
`fix/frontend-presentation-polish`. Nach Freigabe der gefuellten lokalen Vorschau
wurden alle Team-Branches erneut abgerufen. Keine neuen Commits, kein Merge,
kein Force-Push und keine Aenderung an main waren erforderlich.

Diese Revision uebernimmt Manus tatsaechliche C2-Ring-/F-Baum-Gestaltung samt
Original-Routerbild, Geometrie, Flaechen, Geraeteleiste und Detailansichten.
App-Bedienung und Datenmodell bleiben erhalten; der genaue Vergleich und
bewusste Integrationsunterschiede stehen in
`openspec/changes/topology-visual-refresh/verification.md`.
Cache-Version fuer App-Frames und geaenderte Topologie-Assets: `20261119-mockup`.

Alle 82 Dateien des isolierten Build-Kontexts wurden im getesteten Container,
im Cloud-Pod und ueber die oeffentliche URL per SHA256 verifiziert.
Die kompatible `account.js` aus `c88bfd3` samt Demo-Logout-Bereinigung,
Account-Seite, Login-Konfiguration, Keycloak-JS und saemtliche Website-Dateien
sind bytegleich zum vorigen Release. Kein Demo-Server oder Mock-Login wird
ausgeliefert. Das neue `topology-router.png` ist Teil der Build-Allowlist.

Tests: 122 Unit-Tests, 83 allgemeine Browser-Szenarien, 42 Polish-Szenarien,
Praesentationsregression, erweiterte Topologie-Suite und direkter Mockup-Vergleich
erfolgreich. Alle Browser-Suiten liefen am fertigen amd64-Image; die
Topologie-Suite zusaetzlich an den tatsaechlichen Cloud-Dateien. API-Aufrufe
wurden fuer diese Tests abgefangen; keine Testschreibzugriffe auf echte Daten.

Nur das Frontend-Image wurde per JSON-Patch mit Pruefung von Ressourcen-Version,
altem Image und Deployment-Spec getauscht. Rollout erfolgreich; Registry- und
Pod-Digest stimmen. Startseite/Assets und Keycloak-Discovery liefern 200;
`/api/routers/list` verlangt ohne Anmeldung weiterhin 401. Backend, Keycloak,
Datenbanken, Broker, Services, Ingress, PVCs und Secret-Metadaten sowie
Identitaeten und Neustartzaehler ihrer Pods blieben unveraendert.
Kein Realm-Import, keine Migration und keine Routerbefehle. Erneuter Passwort-Login
und manuelle Sichtpruefung mit echtem Routerkonto bleiben separat offen.

Rollback ausschliesslich des Frontends:

```bash
kubectl --context leocloud -n student-it220208 set image deployment/nethera-frontend frontend=ghcr.io/denizbernecker/nethera-frontend:20261119-105348@sha256:38d71664abbb1104e8f40f7af1e34a4f68f3d4725590ad2df9a02213effbe506
kubectl --context leocloud -n student-it220208 rollout status deployment/nethera-frontend
```

### Presentation-Polish und Klassisch-/Baum-Topologie vom 19.11.2026

Ausgerolltes Image: `ghcr.io/denizbernecker/nethera-frontend:20261119-105348`,
privat, `linux/amd64`, Digest
`sha256:38d71664abbb1104e8f40f7af1e34a4f68f3d4725590ad2df9a02213effbe506`.
Quelle: `8382f01a3f654b024f1f7cd76d7a52f1b6018b89` auf
`fix/frontend-presentation-polish`, einschliesslich Polish-Commit `e58541b`.
Vor Commit/Push und Rollout wurden alle Team-Branches erneut abgerufen.
`origin/main=0d08547` wurde ohne Ueberschreiben per Fast-Forward eingebunden;
main selbst wurde nicht gepusht oder umgeschrieben.

Manuels `0d08547` enthielt einen Plan und ein Mockup. Die anschliessend explizit
beauftragte Implementierung bietet `Klassisch | Baum`, merkt die Auswahl und
verwendet fuer beide Ansichten dieselben Routerdaten, Gruppen und lokalen
Entwuerfe. Beschreibung und verbleibende manuelle Pruefung:
`openspec/changes/topology-visual-refresh/verification.md`.
Cache-Version der Topologie und App-Seiten: `20261119-layouts`.

Der isolierte Build behaelt die unten dokumentierte kompatible `account.js`
aus `c88bfd3` samt Demo-Logout-Bereinigung bytegleich zum vorigen Release.
Website, Support, Anleitung, Account-Seite, Konfiguration der Anmeldung und
Keycloak-JS bleiben ebenfalls bytegleich. Kein Backend-Ownership-Rollout,
keine neuen Router-Features, kein Realm-Import und keine Migration.
Der temporaere lokale Demo-Server und seine synthetische Identitaet sind
nicht Teil des Images. Drei Topologie-Module ersetzen Cytoscape und dessen
Lizenzdatei; das Image enthaelt 81 statische Dateien.

Pruefungen: 122 Unit-Tests, 83 allgemeine Browser-Szenarien, 42 gezielte
Polish-Szenarien und die Praesentationsregression erfolgreich. Die neue
Topologie-Suite besteht lokal, am fertigen amd64-Image und an den ausgelieferten
Cloud-Dateien: beide Layouts, Auswahl/Tastatur, Filter, Mehrfachgruppen,
Offline-Ringe, Zoom/Drag/Reset, Vollbild/Verweigerung, Speicherfehler,
Ladefehler/Wiederherstellung und 320/390/768/1440 px. API-Aufrufe wurden in
diesen Browser-Tests abgefangen; keine Testschreibzugriffe auf echte Daten.
Die allgemeine Browser-Suite bestand auch direkt am Release-Image.

Nur `deployment/nethera-frontend` wurde per JSON-Patch geaendert, abgesichert
durch Ressourcen-Version, vorheriges Image und Vergleich der Deployment-Spec.
Rollout erfolgreich; Registry- und Pod-Digest sowie alle 81 Datei-Hashes stimmen.
HTTP-Pruefung: App, neue Module, Website und Support liefern 200 mit passenden
Pruefsummen; Keycloak-Discovery unter `/realms/Nethera/` liefert 200, die
tatsaechliche Routerroute `/api/routers/list` ohne Anmeldung weiterhin 401.
Backend, Keycloak, beide Datenbanken, Broker, Services, Ingress, PVCs und
Secret-Metadaten sowie Identitaeten/Neustartzaehler ihrer Pods sind unveraendert.
Ein erneuter Passwort-Login und manuelle Sichtabnahme mit echtem Routerkonto
bleiben offen; Konten und Passwoerter wurden nicht geaendert.

Rollback ausschliesslich des Frontends:

```bash
kubectl --context leocloud -n student-it220208 set image deployment/nethera-frontend frontend=ghcr.io/denizbernecker/nethera-frontend:20261119-092645@sha256:aa6523b3fee5185ca54d49c38e1d836207c9d5bd6339124696a873b9f2517b57
kubectl --context leocloud -n student-it220208 rollout status deployment/nethera-frontend
```

### Nicos Praesentations-Frontend vom 19.11.2026

Image: `ghcr.io/denizbernecker/nethera-frontend:20261119-092645`, privat,
`linux/amd64`, Digest
`sha256:aa6523b3fee5185ca54d49c38e1d836207c9d5bd6339124696a873b9f2517b57`.

Frontend-Basis: `e5d07eab150d043c3927ece3a95a3bf9be4c14eb`, einschliesslich
Nicos Commits `0366b88` und `9d7fe92`. Vor dem Rollout wurden erneut alle
Team-Branches abgerufen und die inzwischen eingetroffenen Commits bis `94b7009`
ebenfalls per Fast-Forward geholt. Diese aendern keine ausgelieferten
Frontend-Dateien. Backend-Ownership, Seed und Realm-Selbstregistrierung aus
diesen Commits wurden ausdruecklich NICHT auf LeoCloud angewendet.

Ausgerollt sind Dashboard-Anpassung, mobile Geraeteliste, gemeinsame Oberflaechen,
Tagesablauf-Vorschau, Schnellvorlagen fuer Internetzeiten, Tastaturbedienung der
Auswahlfelder sowie stabile Topologie mit Vollbild und lokaler Keycloak-JS-Datei.
Zwei bei der Pruefung gefundene Regressionen sind zusaetzlich korrigiert:
Die Gruppenlegende passt jetzt auch auf 320 px, und das Konto `demo` startet
nicht automatisch eine Praesentationsdemo ueber den echten Routerdaten.
`Demo ansehen` bzw. `demo=1` aktiviert sie bewusst. Die normale Auswahl bleibt:
Live-Routerdaten bei Verbindung, getrennte Beispieldaten bei bestaetigtem Offline,
keine vorgetaeuschten Live-Daten bei API-/Anmeldefehlern. Lokale Gruppen- und
Vorlagenentwuerfe bleiben getrennt von den Router-Verbindungsdaten.

Die drei zusaetzlichen Laufzeitkorrekturen liegen in `Applikation/index.html`,
`Applikation/topologie.css` und `Applikation/topologie_custom.html`. Das Image
kennzeichnet den Build-Patch mit `io.nethera.frontend-patch-sha256`:
`1c21bf6e864e83c935836b04de89551aac6ab1080e2da859db769b9acb6fd814`.

Die Account-Kompatibilitaetsausnahme des vorherigen Rollouts bleibt bestehen:
Im isolierten Build-Kontext stammt `account.js` aus
`c88bfd3bd9e53c78af6ecab48ea6488cac48d6c1`, ergaenzt ausschliesslich um Nicos
zwei Zeilen zum Entfernen von `nethera-demo-preview` und Zuruecksetzen von
`window.NETHERA_DEMO_PREVIEW` beim Abmelden. Die Repository-Datei bleibt auf
Team-Stand. Die Image-Labels `io.nethera.preserved-account-revision` und
`io.nethera.account-overlay=demo-preview-logout-cleanup` dokumentieren dies.
Ein ungepruefter Standard-Build von main wuerde dagegen bereits das neue
Account-/Router-Pairing ausliefern und ist NICHT derselbe Cloud-Stand.

Die 77 bisherigen oeffentlichen Dateien bleiben erhalten; hinzu kommen nur
Keycloak-Adapter, Source-Map und Lizenz unter `vendor/` (80 Dateien insgesamt).
Website, Support, Anleitung, nginx und die lokalen Schutz-Entwurfsmodelle sind
bytegleich zum vorherigen Cloud-Stand. Ausschliesslich das Frontend-Image wurde
per JSON-Patch mit Ressourcen-Version- und Pod-Template-Pruefung ersetzt.
Backend, Keycloak, Broker, PVCs, Secrets, Services und Ingress sowie die
Identitaeten/Neustartzaehler aller anderen Pods sind unveraendert.

Pruefungen: 110 JavaScript-Tests, ein Website-Navigationstest und 83
Browser-Szenarien erfolgreich. Zusaetzlich bestehen die Topologie-Vollbildtests
und `Applikation/tests/presentation-browser.cjs` fuer explizite Demo-Auswahl,
normale Konten, Offline-/Live-Wechsel, lokale Gruppen/Vorlagen und unveraenderte
Verbindungszustaende. Browser-Workflows wurden am fertigen Image und auf den
ausgelieferten Cloud-Dateien mit isolierten API-/Anmelde-Fixtures geprueft;
kein Test-Schreibzugriff erreichte Backend oder Router. Die echte
Keycloak-Weiterleitung und Loginmaske wurden ohne Zugangsdaten geprueft.
Ein echter Login mit bestehendem Passwort und die physische Routerwirkung
wurden dabei nicht erneut ausgefuehrt.

Registry- und Pod-Digest sowie alle 80 Datei-Hashes stimmen ueberein. Die
oeffentlichen Seiten und Keycloak-Discovery liefern 200; die Router-API ohne
Token liefert erwartungsgemaess 401. Geaenderte HTML-/JS-/CSS-Dateien werden
mit `no-cache, must-revalidate` ausgeliefert. Die roten GitHub-Checks betreffen
den Backend-Build-Workflow; dessen externe Laufprotokolle waren bei dieser
Pruefung nicht zugaenglich und sind hiermit nicht als behoben bestaetigt.

Frontend-Rollback: nur das Image auf
`ghcr.io/denizbernecker/nethera-frontend:20261116-142215@sha256:5a73ec0742fca46e7269890cc11c562328b9759f15232d82d3ca7feb56078428`
zuruecksetzen; keinen kompletten Stack oder Realm-Import anwenden.

### Topologie mit lokalen Schutz-Entwuerfen vom 16.11.2026

Frontend-Quellstand: `0f3801192c2843b391c320e653a116b0911a90bf`.
Image: `ghcr.io/denizbernecker/nethera-frontend:20261116-142215`, privat,
`linux/amd64`, Digest
`sha256:5a73ec0742fca46e7269890cc11c562328b9759f15232d82d3ca7feb56078428`.

Die Topologie zeigt jetzt auch lokale Gruppen-, Vorlagen- und Regelentwuerfe aus
der Schutzseite an. Graph, Legende, Filter und Details lesen denselben tablokalen
Speicher, getrennt nach API, Benutzer, Router und Live-/Demo-Modus. Verwerfen und
Seitenwechsel werden beruecksichtigt. Die Vorschau bleibt sichtbar gekennzeichnet;
fehlender Router-Readback wird nicht als bestaetigte Zuweisung ausgegeben.
Geraeteinventar, verbunden/getrennt, WLAN/LAN, IP, MAC und zuletzt gesehen stammen
unveraendert aus dem Router-Snapshot bzw. der separaten Offline-Demo. "Nur online"
verwendet weiterhin ausschliesslich den Verbindungsstatus, niemals den Entwurf.
Es gibt keine neuen Backend-Schreibzugriffe oder Routerbefehle.

Alle Team-Branches wurden vor dem Code-Push und erneut vor dem Deployment-Eintrag
abgerufen. `main` hatte dabei keine weiteren Team-Commits; geloeschte, bereits
integrierte Remote-Branches wurden durch Fetch/Prune entfernt. Keine Force-Pushes,
kein eigener Merge und keine Aenderung fremder Commits.

Wichtig fuer Nachbauten: `main` enthaelt bereits die neue Account-/Routerzuordnung,
deren Backend und Migration nicht Teil dieses Rollouts sind. Deshalb bleibt
`Applikation/account.js` im isolierten Build-Kontext auf dem bisherigen Cloud-Stand
aus `c88bfd3bd9e53c78af6ecab48ea6488cac48d6c1`; die Repository-Datei wurde nicht
zurueckgesetzt. Das Image dokumentiert dies mit dem Label
`io.nethera.preserved-account-revision`. Eine ungepruefte Komplettveroeffentlichung
von `main` waere nicht derselbe Frontend-Stand.

Der Build behaelt die bisherigen 77 oeffentlichen Dateien ohne Backup-Kopien.
Nur `index.html`, `security-draft.js`, `security.html`, `security.js`,
`topologie_custom.html`, `topologie_custom.js` und `topology-model.js` aendern sich.
Website, Support, Konfiguration, Login-Code, alle weiteren Assets und nginx sind
bytegleich zum vorherigen Image. Der Rollout ersetzte ausschliesslich das
Frontend-Image per JSON-Patch mit Ressourcen-Version-/Pod-Template-Pruefung.
Backend, Keycloak, Broker, Datenbank-Pods, PVCs, Secrets, Services und Ingress
blieben unveraendert und ohne weitere Neustarts. Kein vollstaendiges Stack-Apply,
keine Migration und keine Schreibtests gegen echte Konten oder Router.

Pruefungen: 101 JavaScript-Tests und ein Python-Navigationstest erfolgreich.
Das fertige Image bestand 18 Schutz-Layoutpruefungen sowie Topologie-Workflows
auf 1440/390/320 px. Dieselben Topologie-Workflows bestanden auch nach dem Rollout
auf LeoCloud: Seitenwechsel, reaktive Gruppenwechsel, Verwerfen, Scope-Trennung,
unveraenderte Verbindungsdaten, Online-Filter und nichtleerer Graph-Canvas.
Alle Browserpruefungen nutzen isolierte API-Antworten; keine Backend-Schreibversuche
oder JavaScript-Fehler. Registry- und Pod-Digest stimmen ueberein. Startseite,
Support, Anleitung, Konfiguration und Keycloak-Discovery liefern 200, die
Router-API ohne Anmeldung 401. Die sieben geaenderten Dateien sowie `account.js`
wurden zusaetzlich per HTTP-Hash geprueft; Cache-Control bleibt
`no-cache, must-revalidate`.

Frontend-Rollback bei Bedarf: ausschliesslich das Frontend-Image auf
`ghcr.io/denizbernecker/nethera-frontend:20261116-135836@sha256:eb16637af7a5fcf304f9239590c2dc32109afa0129630aaa2be3ae7babc105ee`
setzen. Backend, Keycloak und persistente Ressourcen dabei nicht anfassen.

### Lokale Schutz-Entwuerfe vom 16.11.2026

Frontend-Quellstand: `c88bfd3bd9e53c78af6ecab48ea6488cac48d6c1`.
Image: `ghcr.io/denizbernecker/nethera-frontend:20261116-135836`, privat,
`linux/amd64`, Digest
`sha256:eb16637af7a5fcf304f9239590c2dc32109afa0129630aaa2be3ae7babc105ee`.

Die Schutzseite ist auch ohne vollstaendigen Router-Readback bearbeitbar.
Alle Aenderungen auf dieser Seite sind ausschliesslich browserlokale Entwuerfe,
einschliesslich Werbeschutz und vormerkbarer Installation. Es gibt keine
Backend-Schreibzugriffe, Routerbefehle oder automatische Synchronisation.
Entwuerfe sind nach API, Benutzer, Router und Live-/Demo-Modus getrennt und
bleiben beim Seitenwechsel oder Reload im selben Browser-Tab erhalten.
Bestaetigte Sperrlisten und der Adblock-Iststatus bleiben separat sichtbar;
unbestaetigte alte Datenbankeintraege werden nicht als Routerdaten ausgegeben.
Details und Backend-Uebergabe: `Documentation/security-local-preview.md`.

Vor beiden Pushes wurden alle Team-Branches erneut abgerufen; `main` blieb
unveraendert. Beim zweiten Abruf kam `feat/router-ownership` mit `3785936` hinzu.
Dieser separate Account-/Backend-/Migrationsstand wurde nicht uebernommen oder
ausgerollt. Normale Pushes ohne Force oder Merge waren ausreichend.
Nur das Frontend-Image wurde mit einem Ressourcen-Version-/Pod-Template-
gesicherten JSON-Patch ersetzt. Backend, Keycloak, Broker, Datenbank-Pods,
PVCs, Secrets, Services und Ingress blieben unveraendert, ohne weitere Neustarts.
Keine Migration, Seeds oder Schreibtests gegen Backend oder Router.

Der Build enthaelt 77 oeffentliche Dateien: `security-draft.js` ist neu;
`api.js`, `index.html`, `security.css`, `security.html` und `security.js` sind
geaendert. Alle anderen oeffentlichen Dateien sowie nginx sind bytegleich zum
vorherigen Image. Unveroeffentlichte Backup-Kopien wurden nicht aufgenommen.

Pruefungen: 92 JavaScript-Tests, ein Python-Navigationstest und jeweils 18
Browserpruefungen des fertigen Images lokal sowie auf LeoCloud (1440/390/320 px).
Die Browserpruefungen verwenden isolierte API-Antworten und blockieren jeden
Backend-Schreibversuch. Keine Schreibversuche, JavaScript-Fehler oder horizontalen
Ueberlaeufe. Rollout erfolgreich; Registry- und Pod-Digest stimmen ueberein.
Startseite, Support, Anleitung, Konfiguration und Keycloak-Discovery antworten
mit 200; die geschuetzte Router-API ohne Anmeldung weiterhin mit 401.
Alle sechs geaenderten/neuen Frontend-Dateien stimmen per HTTP-Hash mit dem
geprueften Quellstand ueberein und werden mit `no-cache, must-revalidate` ausgeliefert.

Frontend-Rollback bei Bedarf: ausschliesslich das Frontend-Image auf
`ghcr.io/denizbernecker/nethera-frontend:20261116-133308@sha256:353d39a037470da2844081dcac8b415c1a7bc7896bda07bd4c9676bd9b5fae60`
setzen. Nicht den gesamten Stack anwenden: Der Backend-Eintrag in `main` bildet
den aktuellen Routersteuerungs-Rollout nicht vollstaendig ab.

### Bestaetigte Sperrlisten und Topologie vom 16.11.2026

Frontend-Quellstand: `c805269b0f079b2e3a4bcdab6af2b343841b7b88`.
Image: `ghcr.io/denizbernecker/nethera-frontend:20261116-133308`, privat,
`linux/amd64`, Digest
`sha256:353d39a037470da2844081dcac8b415c1a7bc7896bda07bd4c9676bd9b5fae60`.

Korrigiert den vorherigen, zu strengen Herkunftsfilter: Gespeicherte NETWORK-Listen
werden wieder angezeigt, wenn der online erreichbare Router ihre aktuelle
Sollversion bestaetigt. DNS-Listen benoetigen zusaetzlich bestaetigt aktiven Adblock.
Alle zugehoerigen Werbe-Domains erscheinen wieder im Werbeschutz. Kategorien und
ungueltige Domains werden wie im Router-Publisher ausgefiltert. Unbestaetigte
Vorlagen und Geraete-/Gruppenzuweisungen bleiben verborgen und die unvollstaendige
Regelsicht schreibgeschuetzt. Die vollstaendige Offline-Demo bleibt erhalten.
Die Uebernahmebestaetigung ist kein unabhaengiger DNS-Funktionstest.
Details und verbleibender Backend-Vertrag: `Documentation/router-data-sources.md`.

Moritz' Topologie-Commit `ca1bea8` wurde als `7816b3c` uebernommen; der bisherige
Umgang mit unbekannten Zuweisungen blieb bei der Integration erhalten. Die Topologie
bietet nun "Nur online" und stellt getrennte Geraete abgeschwaecht dar.
Sein weiterer Commit `4b9a3f7` zur mDNS-Namenerkennung ist eine Router-Agent-Aenderung:
abgerufen, aber nicht mit diesem Frontend-Rollout auf den Cudy installiert.

Alle Team-Branches wurden vor dem Code-Push und erneut vor dem Deployment-Eintrag
abgerufen. `main` wurde normal ohne Force-Push aktualisiert. Nur das Frontend-Image
wurde durch einen JSON-Patch mit Ressourcen-Version-/Pod-Template-Pruefung ersetzt.
Backend, Broker, Keycloak, Datenbank-Pods, PVCs, Secrets, Services und Ingress bleiben
unveraendert. Keine Migration, Seeds oder Schreibtests gegen Backend/Router.

Der fertige Build behaelt dieselben 76 oeffentlichen Dateien. Ausschliesslich
`api.js`, `index.html`, `security.js`, `topologie.css`, `topologie_custom.html`,
`topologie_custom.js` und `topology-model.js` sind geaendert; Website, Supportseite,
Konfiguration, Login-Code und nginx-Routing sind bytegleich zum vorherigen Image.
Keine bislang unveroeffentlichten Backup-Dateien wurden in den Build aufgenommen.

Abnahme: 81 JavaScript-Tests und ein Navigationstest erfolgreich. 26 Browser-
Layoutpruefungen bei 320, 390, 768 und 1440 Pixeln gegen Quellen, Build und Cloud-
Dateien mit isolierten API-Antworten; aktive Listen, ACK-Verlust, Adblock aus,
Demo/Reconnect und Topologie-Onlinefilter geprueft. Ein Canvas-Check lief nach dem
Filterwechsel zunaechst vor dem Zeichnen; erneute Pruefung mit Warten auf gerenderte
Pixel erfolgreich. Keine JavaScript-Fehler oder horizontalen Ueberlaeufe.
Read-only-Pruefung der Cloud bestaetigte frischen Routerkontakt, angewendete aktuelle
Sollversion und aktiven Adblock. Kein direkter DNS-/Router-Schreibtest durchgefuehrt.
Rollout erfolgreich, Registry-/Pod-Digest identisch. Oeffentliche Dateien per SHA256
geprueft; Website/Support/Anleitung/Konfiguration HTTP 200, API ohne Anmeldung 401,
OIDC-Metadaten 200. Cache-Version der App-Seiten wurde erneuert.

Rollback nur am Frontend auf
`ghcr.io/denizbernecker/nethera-frontend:20261116-131208@sha256:0a905350ccfb584678994c2e82e5befd0f0803b0d1eaf28c59970d1043c110d2`.
Dieser Vorgaenger enthaelt den zu strengen Filter und blendet die bestaetigten
Listen wieder aus. Nicht den gesamten Stack anwenden; Backend-Rollouts werden
separat auf `leocloud-deployment` verwaltet.

### Router-Regelfilter-Release vom 16.11.2026 (historisch, oben korrigiert)

Frontend-Quellstand: `da36b438215e48289905f727171d67ee04cce6a6`.
Image: `ghcr.io/denizbernecker/nethera-frontend:20261116-131208`, privat,
`linux/amd64`, Digest
`sha256:0a905350ccfb584678994c2e82e5befd0f0803b0d1eaf28c59970d1043c110d2`.

Bei Live-Verbindung werden Blocklisten, Gruppen, Vorlagen und Zuweisungen nur
mit explizitem Router-Herkunftsnachweis angezeigt. Die derzeitige API liefert
diesen Nachweis noch nicht: Die betreffenden Listen bleiben vorerst leer,
fehlende Zuweisungen werden als unbekannt bezeichnet. Regel-Schreibaktionen
bleiben bis zu einem vollstaendigen Readback gesperrt, damit ausgeblendete
Einstellungen nicht versehentlich ueberschrieben werden. Adblock-Status und
die vollstaendige, schreibgeschuetzte Offline-Demo bleiben erhalten.
Backend-Vertrag und Abgrenzung zur Routerwirkung: `Documentation/router-data-sources.md`.

Der Build-Kontext verwendet die bereits ausgelieferte Dateimenge des #26-Releases
mit den Dateien aus dem neuen Quellstand. Nicht ausgelieferte Backup-Kopien
(` 2` im Dateinamen) wurden nicht nachtraeglich veroeffentlicht. Alle 76 oeffentlichen
Dateien im fertigen Image wurden mit dem vorherigen Image verglichen. Ausschliesslich
`api.js`, `index.html`, `security.js`, `time-limits.js`, `topologie_custom.js` und
`topology-model.js` unterscheiden sich. Die uebrigen Dateien einschliesslich Website,
Supportseite, Konfiguration, Login-Code und nginx-Routing sind bytegleich.

Ausgerollt wurde nur ein JSON-Patch auf das Frontend-Image. Ein Vergleich des bisherigen
Pod-Templates und der Ressourcen-Version schuetzt vor parallelen Deployment-Aenderungen.
Backend, Broker, Keycloak und beide Datenbank-Pods liefen ohne Neustart weiter.
Services, Ingress, ConfigMaps, PVCs und Secret-Metadaten sind unveraendert.
Keine Migration, keine Seeds, kein Datenbank- oder Router-Schreibtest.

Abnahme: 71 JavaScript-Tests, ein Navigationstest und 20 Browser-Layoutpruefungen
bei 320, 390, 768 und 1440 Pixeln erfolgreich. Herkunftsfilter, partielle/komplette
Readbacks, gesperrte Schreibaktionen, Demo und Reconnect mit isolierten API-Antworten
gegen das Build-Image und die oeffentlich ausgelieferten Dateien geprueft.
Topologie auf Desktop/Mobilgeraet nicht leer und ohne Ueberlauf. Registry-Digest
und laufender Pod stimmen ueberein. Website, Support, Anleitung und Konfiguration
liefern HTTP 200, die API ohne Anmeldung HTTP 401, OIDC-Metadaten HTTP 200.

Rollback: ausschliesslich das Frontend-Image auf
`ghcr.io/denizbernecker/nethera-frontend:20261116-122732@sha256:e91b53f405c31573351d7c928d65fa8de94ed49bc74477a352acc3a937deb6c3`
zuruecksetzen. Nicht den gesamten Stack anwenden: Backend-Rollouts werden separat
auf `leocloud-deployment` verwaltet.

### Konfigurations-Release #26 vom 16.11.2026

Nicos neue Konfigurationsseite aus `1dc4b58` (enthalten in `main` bei `d5fdf80`)
ist jetzt ebenfalls online. Vorher wurden alle Remote-Branches abgerufen:
`main` war aktuell; der neue Merge `ac29b02` auf `leocloud-deployment` wurde
nicht in diesen gezielten Frontend-Build integriert. Nicos drei
Konfigurationsdateien sind in beiden Branches identisch.

Image: `ghcr.io/denizbernecker/nethera-frontend:20261116-122732`, privat,
`linux/amd64`; der Digest steht beim Frontend in `stack.yaml`. Der Build nutzt
die schon ausgerollten #21-Dateien plus unveraendert Nicos `configuration.html`,
`configuration.js` und `configuration.css`. Unbenutzte Dateikopien mit ` 2`
im Namen bleiben wie beim #21-Release ausserhalb des Images.

Der Vergleich aller 76 ausgelieferten Dateien bestaetigt: Nur diese drei
Konfigurationsdateien unterscheiden sich vom vorherigen Image. Website,
Supportseite, App-Navigation, API-Helfer und die anderen App-Seiten sind
bytegleich. Das Server-Routing ist ebenfalls unveraendert.

Geaendert wurde nur das Frontend-Image, mit atomarer Vorher-Pruefung des
Pod-Templates. Backend, Broker, Keycloak und beide Datenbank-Pods liefen ohne
Neustart mit unveraenderten Images weiter. Services, Ingress, ConfigMaps, PVCs
und Secret-Metadaten sind identisch. Keine Migration, Account-Aenderung oder
Aenderung echter Routereinstellungen wurde ausgefuehrt.

Abnahme: 62 JavaScript-Tests und ein Navigationstest erfolgreich. Die Seite
wurde lokal und auf LeoCloud bei 320, 390, 768, 1024 und 1440 Pixeln mit offenen
und geschlossenen erweiterten Einstellungen geprueft. Validierung, Verwerfen,
Speicher-Payload, Fehlerbehandlung, erneutes Laden sowie schreibgeschuetzter
Demo-/Unbekannt-Status wurden mit vollstaendig abgefangenen API-Antworten
getestet; kein Test speicherte echte Daten. Live-Dateien stimmen mit Nicos
Quellstand ueberein, Registry-/Pod-Digest passen, Website und Login-Endpunkt
antworten mit HTTP 200, die API ohne Anmeldung weiterhin mit HTTP 401.

Die neue Seite bestaetigt weiterhin nur das Speichern in Nethera, nicht die
tatsaechliche Router-Uebernahme aller Konfigurationsfelder.
Rollback nur durch Zuruecksetzen des Frontend-Images auf
`ghcr.io/denizbernecker/nethera-frontend:20261116-112159@sha256:64b1d348c45c27da1e1804aa03ef1a329768a8edf7096f3b716691bea84b6071`.
Nicht den gesamten Stack anwenden oder andere Dienste zuruecksetzen.

### Support-Release #21 vom 16.11.2026

Nicos Supportseite ist unter `/website/html/support.html` erreichbar und von
Website, Anleitung und App verlinkt. Das Formular bereitet einen GitHub-Issue-
Entwurf vor; es veroeffentlicht nichts automatisch. Ein GitHub-Konto wird benoetigt.

Ausgerollt wurde nur #21 aus `1dc4b58`, auf der zuvor laufenden Frontend-Basis
`57be96b` (Frontend bytegleich mit `1d00c4b`). Dazu wurden ausschliesslich
`Applikation/Dockerfile`, `Applikation/index.html`, die drei Website-HTML-Seiten,
`Website/css/nethera.css`, `Website/css/support.css`, `Website/js/support.js`
und die Website-Tests aus Nicos Commit uebernommen. Die `.dockerignore` erlaubt
zusaetzlich die beiden Support-Assets, damit sie wirklich im Image ankommen.
Die Supportdateien selbst entsprechen unveraendert Nicos Version.

Der neueste Team-Commit `1886d14` wurde vorher per Fast-forward geholt. Seine
Dateien mit ` 2` im Namen sind bytegleiche Kopien des Standes vor #21 und wurden
nicht in das Release aufgenommen. Die zusaetzlichen Konfigurationsaenderungen
fuer #26 aus `1dc4b58` wurden ausdruecklich nicht ausgerollt: Die laufenden
Dateien `configuration.html` und `configuration.js` sind vor/nach dem Rollout
bytegleich. Ein kuenftiger Build direkt von `main` enthaelt diese neuen
#26-Aenderungen und ist daher nicht identisch mit diesem gezielten #21-Release.

Image: `ghcr.io/denizbernecker/nethera-frontend:20261116-112159`, privat,
`linux/amd64`; der Digest steht beim Frontend in `stack.yaml`. Nur dieses Image
wurde im bestehenden Deployment ersetzt. Backend, Broker, Keycloak und beide
Datenbank-Pods liefen mit unveraenderten Images ohne Neustart weiter.
Services, Ingress, ConfigMaps, PVCs und Secret-Metadaten sind unveraendert.
Es gab keine Datenbank-, Account- oder Router-Aenderungen.

Abnahme: 57 JavaScript-Tests und ein Navigationstest erfolgreich; Website,
Anleitung und Support bei 320, 390, 768 und 1440 Pixeln ohne horizontalen
Ueberlauf oder fehlende Assets. Pflichtfelder, Leerzeichenvalidierung und
GitHub-Entwurf getestet, ohne ein Ticket zu veroeffentlichen. App-Verlinkung
mit isoliertem Auth-Teststub geprueft. Live-Rollout und Registry-/Pod-Digest
stimmen ueberein; API bleibt ohne Anmeldung geschuetzt.

Rollback: ausschliesslich das Frontend auf
`ghcr.io/denizbernecker/nethera-frontend:20261116-094614@sha256:9861a4b761e08cb7725e567539ea14d875f7c137c49ce4f8223a720ad608778d`
zuruecksetzen. Nicht den gesamten Stack anwenden: Der neuere Backend-Rollout
ist separat auf `leocloud-deployment` dokumentiert und darf nicht ersetzt werden.

### Keycloak-Theme-Release vom 16.11.2026

Das Login-Theme aus Quellstand `b5c010d` wurde als privates `linux/amd64`-Image
mit Tag `20261116-102646` ausgerollt. Der exakte Digest steht beim Keycloak-Image
in `stack.yaml`. Die Basis ist unveraendert Keycloak 26.6.1 mit demselben
Basis-Image-Digest; hinzugefuegt wurden nur sechs Theme-Dateien. Standard-Templates
und Anmeldeablaeufe werden weiterhin von `keycloak.v2` geerbt.

Geaendert wurde nur das Keycloak-Deployment: neues Image, Verweis auf das
bestehende Pull-Secret und Entfernung des alten Theme-ConfigMap-Mounts. Der
Realm-Import-Mount blieb unveraendert. Keycloak meldete beim Start, dass der
Realm bereits existiert und der Import uebersprungen wurde.

Vorher wurde die Keycloak-Datenbank ausserhalb des Repositories gesichert;
das Backup wurde mit `pg_restore --list` auf Lesbarkeit geprueft. Vorher-/Nachher-
Pruefsummen aller sieben Konten und sieben Credential-Datensaetze sowie der
Realm- und Client-Einstellungen sind identisch. Secrets, ConfigMaps, PVCs und
die uebrigen Deployments und Pods blieben unveraendert. Ausgelieferte Website-,
App-Dateien und die OpenID-Konfiguration sind ebenfalls bytegleich geblieben.

Abnahme: Rollout, Image-Digest und Theme-Dateien auf LeoCloud geprueft;
Login-Seite auf Desktop und Mobilgeraet ohne Ueberlauf oder Ladefehler,
Passwortanzeige funktioniert. Erfolgreiche und fehlgeschlagene Anmeldung sowie
Passwortwechsel wurden separat mit isolierten Testkonten geprueft. Auf LeoCloud
wurden keine echten Zugangsdaten automatisiert eingegeben oder geaendert.

Ein Rollback stellt das vorher gesicherte Keycloak-Pod-Template inklusive
altem Image und Theme-ConfigMap-Mount wieder her, nicht die Datenbank.
Weder den kompletten Stack erneut anwenden noch Konten, Secrets oder PVCs ersetzen.

### Frontend-Demo-Release vom 16.11.2026

Nur das Frontend aus Quellstand `1d00c4b` wurde ausgerollt. Das private
`linux/amd64`-Image traegt den Tag `20261116-094614`; der exakte Digest steht
beim Frontend in `stack.yaml`. Aktualisiert wurde ausschliesslich das Image im
bestehenden Frontend-Deployment, nicht der gesamte Stack. Backend, MQTT,
Keycloak, Konten, Secrets und Datenbanken wurden nicht geaendert. Die uebrigen
Pods liefen ohne Neustart weiter; Konfigurationen und PVCs blieben unveraendert.

Bei bestaetigtem Offline-Status zeigt die schreibgeschuetzte Demo jetzt acht
Geraete, drei Gruppen, drei Vorlagen, vier Sperrlisten und vier Zeitlimits
sowie zusammenpassende Beispieldaten fuer Dashboard, Topologie und Konfiguration.
Bei bestaetigter Routerverbindung verschwinden die Beispieldaten vollstaendig.
Ein unbekannter Status oder API-Fehler aktiviert weiterhin keine Demo.

Abnahme: Rollout und Image-Digest geprueft, ausgelieferte HTML-/JS-/CSS-Dateien
mit dem Quellstand verglichen, Website und Keycloak erreichbar, API ohne Login
weiterhin geschuetzt. Alle 56 Frontend-Tests erfolgreich. Online-/Offline-Wechsel
zusaetzlich mit dem ausgelieferten API-Code und isolierten Testantworten geprueft;
der echte Router wurde nicht getrennt und lieferte weiterhin frische Daten.

### Routerdaten-Release vom 15.11.2026

Backend und Frontend aus Quellstand `5008dcf` wurden ausgerollt. Das Backend-Image
steht weiterhin unveraendert mit Digest in `stack.yaml`. Vor dem Backend
wurde die additive Migration `Backend/Nethera/migrations/20261115_telemetry_source.sql`
nach Sicherung beider Datenbanken eingespielt. Das Backend verwendet jetzt
Schema-Validierung statt automatischer Schema-Aenderungen. `Recreate` verhindert
gleichzeitige MQTT-Consumer mit derselben Client-ID; ein Backend-Rollout hat
dadurch eine kurze API-Unterbrechung. Keycloak, Konten, Secrets und PVCs wurden
nicht ersetzt. Details und Abnahme: `Documentation/router-data-sources.md`.

Bei einem Rollback nur die vorherigen Backend-/Frontend-Images wiederherstellen.
Die zusaetzlichen Spalten koennen bestehen bleiben; keine Datenbank oder PVC
loeschen und keine Seeds erneut importieren.

Der Keycloak-Realm wird beim erstmaligen Anlegen der Keycloak-Datenbank
importiert. Aenderungen an `Applikation/realm-export.json` aktualisieren einen
bestehenden Realm nicht automatisch. In der Cloud ist der MQTT-Empfang ueber
Mosquitto und `/mqtt` eingerichtet. Bei bestaetigter Verbindung zeigt die App nur
verifizierte Routerdaten, bei bestaetigtem Offline-Status eine gekennzeichnete
schreibgeschuetzte Demo. Ein unbekannter Status oder API-Fehler erzeugt keine
Beispielwerte. Der lokale MQTT-Compose-Stack bleibt davon unberuehrt.

Die PVCs `nethera-db-data` und `nethera-keycloak-db-data` enthalten die
dauerhaften Daten. **Nicht loeschen**, ohne sie vorher zu sichern: LeoCloud
kann geloeschte PVC-Daten nicht wiederherstellen. `stack.yaml` enthaelt die
persoenliche LeoCloud-Adresse und den GHCR-Besitzer; fuer einen anderen
Team-Namespace muessen diese Werte angepasst werden.

## MQTT-Broker fuer Router-Telemetrie einrichten

Damit ein Router Live-Daten in die Cloud schicken kann, kommt ein Mosquitto in
den Stack. Router verbinden sich von aussen ueber
`wss://it220208.cloud.htl-leonding.ac.at/mqtt` (MQTT ueber WebSockets, Port 443,
TLS endet am LeoCloud-Ingress). Das Backend spricht im Cluster direkt mit
`nethera-mosquitto:1883`. Hintergrund und Entscheidungen stehen in
`openspec/changes/leocloud-deployment/`.

`stack.yaml` enthaelt dafuer:

- PVC `nethera-mosquitto-data` (1 Gi) fuer gemerkte Nachrichten
- Deployment und Service `nethera-mosquitto` (`eclipse-mosquitto:2`, Ports 1883
  und 9001)
- den Ingress-Pfad `/mqtt` auf Port 9001
- beim Backend `NETHERA_TELEMETRY_MODE=mqtt` und die Broker-Zugangsdaten

Das laufende Backend-Image enthaelt den MQTT-Code bereits
(`Installed features: [... messaging-mqtt ...]`). Ein neues Image ist nicht
noetig.

Derselbe Aufbau wurde im Namespace `student-it220213` geprobt: gleiche
Broker-Dateien aus `docker/mosquitto/`, ein PVC auf demselben Speicher, der Pfad
`/mqtt`. Dort funktionieren Anmeldung und ACL ueber `wss`, eine Verbindung blieb
10 Minuten offen, der Last Will kam nach etwa 41 s, und gemerkte Nachrichten
ueberstehen das Loeschen des Pods. Der Cudy hat sich von dort aus ueber `wss`
angemeldet. Im Namespace `student-it220208` selbst ist es noch nicht
ausgefuehrt.

### Schritte (Namespace-Inhaber)

Reihenfolge einhalten: Secret und ConfigMap muessen vor dem `apply` existieren,
sonst startet der Broker-Pod nicht (`CreateContainerConfigError`). Alle Befehle
im Hauptordner des Repositories ausfuehren.

**1. Stand holen und Kontext pruefen**

```bash
git switch leocloud-deployment && git pull
kubectl config current-context
```

Die zweite Zeile muss `leocloud` ausgeben.

**2. Zwei Passwoerter ins Secret `nethera-runtime` legen**

Die Werte werden zufaellig erzeugt und nicht angezeigt. Bestehende Keys bleiben
unveraendert.

```bash
kubectl --context leocloud -n student-it220208 patch secret nethera-runtime --type merge \
  -p "{\"stringData\":{\"mqtt-backend-password\":\"$(openssl rand -hex 16)\",\"mqtt-router1-password\":\"$(openssl rand -hex 16)\"}}"
```

Kontrolle (zeigt nur die Namen der Keys):

```bash
kubectl --context leocloud -n student-it220208 get secret nethera-runtime -o jsonpath='{.data}' | tr ',' '\n' | cut -d'"' -f2
```

`mqtt-backend-password` und `mqtt-router1-password` muessen in der Liste stehen.

**3. Broker-Konfiguration als ConfigMap anlegen**

```bash
kubectl --context leocloud -n student-it220208 create configmap nethera-mosquitto --from-file=docker/mosquitto/
```

Die ConfigMap enthaelt `mosquitto.conf`, `acl` und `entrypoint.sh`. Nach einer
spaeteren Aenderung an diesen Dateien:

```bash
kubectl --context leocloud -n student-it220208 create configmap nethera-mosquitto --from-file=docker/mosquitto/ --dry-run=client -o yaml \
  | kubectl --context leocloud -n student-it220208 apply -f -
kubectl --context leocloud -n student-it220208 rollout restart deployment/nethera-mosquitto
```

**4. Stack einspielen**

```bash
kubectl --context leocloud -n student-it220208 apply -f deploy/leocloud/stack.yaml
kubectl --context leocloud -n student-it220208 rollout status deployment/nethera-mosquitto
kubectl --context leocloud -n student-it220208 rollout status deployment/nethera-backend
```

Erwartet: `persistentvolumeclaim/nethera-mosquitto-data created`,
`deployment.apps/nethera-mosquitto created`, `service/nethera-mosquitto created`,
`deployment.apps/nethera-backend configured`, `ingress.networking.k8s.io/nethera
configured`. Datenbanken, Keycloak und Frontend bleiben `unchanged`.

**5. Pruefen**

Broker laeuft mit beiden Ports:

```bash
kubectl --context leocloud -n student-it220208 logs deployment/nethera-mosquitto | grep -E "listen socket|running|Error"
```

Erwartet: je zwei Zeilen fuer Port 1883 und 9001, dann `mosquitto version ...
running`, keine `Error`-Zeile.

Backend ist verbunden:

```bash
kubectl --context leocloud -n student-it220208 logs deployment/nethera-backend | grep -i -E "mqtt|Subscription"
```

Erwartet: `Connection with nethera-mosquitto:1883 established successfully` und
`Subscription success on topic nethera/#`.

Anmeldung und Rechte, direkt im Broker-Pod (die Passwoerter kommen aus dessen
Umgebung und werden nicht angezeigt):

```bash
kubectl --context leocloud -n student-it220208 exec deployment/nethera-mosquitto -- sh -c '
  mosquitto_pub -h 127.0.0.1 -u router-1 -P "$NETHERA_MQTT_ROUTER1_PASSWORD" -t nethera/1/status -m offline -q 1 -r && echo "router-1 darf senden"
  mosquitto_sub -h 127.0.0.1 -u nethera-backend -P "$NETHERA_MQTT_BACKEND_PASSWORD" -t "nethera/#" -v -C 1 -W 5
  mosquitto_pub -h 127.0.0.1 -u router-1 -P falsch -t nethera/1/status -m x || echo "falsches Passwort abgelehnt"'
```

Erwartet: `router-1 darf senden`, dann `nethera/1/status offline`, dann eine
Fehlermeldung und `falsches Passwort abgelehnt`.

Der Pfad ist von aussen erreichbar:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://it220208.cloud.htl-leonding.ac.at/mqtt
```

Erwartet: `502` oder `400`. Mosquitto beantwortet dort keine normalen
HTTP-Anfragen, das ist kein Fehler. `404` wuerde heissen, dass der Ingress-Pfad
fehlt.

Die Seite selbst laedt weiter unter
https://it220208.cloud.htl-leonding.ac.at/ und zeigt wie bisher die Demo-Daten,
bis ein Router sendet.

**6. Router-Passwort weitergeben**

```bash
kubectl --context leocloud -n student-it220208 get secret nethera-runtime -o jsonpath='{.data.mqtt-router1-password}' | base64 -D
```

Privat an die Person geben, die den Router einrichtet. Nicht in den Gruppenchat,
nicht in ein Ticket, nicht in einen Commit.

### Rueckgaengig machen

In `stack.yaml` beim Backend `NETHERA_TELEMETRY_MODE` wieder auf `ssh` stellen
und erneut `kubectl apply -f deploy/leocloud/stack.yaml` ausfuehren. Der Broker
kann ungenutzt weiterlaufen. Ganz entfernen:

```bash
kubectl --context leocloud -n student-it220208 delete deployment/nethera-mosquitto service/nethera-mosquitto configmap/nethera-mosquitto
```

Dazu den Pfad `/mqtt` wieder aus dem Ingress nehmen. Das PVC
`nethera-mosquitto-data` enthaelt nur gemerkte MQTT-Nachrichten; die PVCs der
Datenbanken sind davon nicht betroffen und duerfen nicht geloescht werden.

### Einen weiteren Router zulassen

Pro Router ein Benutzer `router-<id>`: einen Block in `docker/mosquitto/acl`
ergaenzen, in `docker/mosquitto/entrypoint.sh` eine `mosquitto_passwd`-Zeile mit
einer neuen Umgebungsvariable, diese in `stack.yaml` aus einem neuen Key im
Secret befuellen, dann die ConfigMap wie in Schritt 3 aktualisieren. In der
Datenbank muss die `Router`-Zeile mit dieser ID existieren.

## Routersteuerung ausrollen (#23 AdBlocker, #25 Websites sperren)

Stand 16.11.2026, Quellstand `leocloud-deployment`. Das Backend schickt jedem
Router seinen Soll-Zustand als gemerkte Nachricht auf `nethera/<id>/config/dns`
und liest die Antwort von `nethera/<id>/telemetry/control`. Dafuer braucht die
Cloud drei Dinge: eine Datenbank-Migration, die neue Broker-ACL und ein neues
Backend-Image. Ein neues Frontend-Image ist fuer diese Aenderung nicht noetig.

Reihenfolge einhalten. Das Backend prueft das Schema beim Start (`validate`):
ohne Schritt 2 startet das neue Image nicht
(`Schema validation: missing table [router_control_state]`).

Lokal geprueft: Die Migration wurde gegen eine nachgestellte alte Datenbank
zweimal hintereinander ausgefuehrt, danach startet das Backend mit `validate`.

### Ausgerollt am 16.11.2026

In `student-it220208` ist Quellstand `6065a40` als privates `linux/amd64`-Backend
mit Tag `20261116-105202` aktiv. Der genaue Digest steht beim Backend in
`stack.yaml`. Reihenfolge: Datenbanksicherung, Migration, Broker-ACL und
Broker-Neustart, danach neues Backend-Image. Nicht den gesamten Stack angewendet.

- Beide Datenbanken wurden ausserhalb des Repositories gesichert und die Dumps
  auf Lesbarkeit geprueft. Die Migration wurde zuvor zweimal gegen eine isolierte
  Kopie des echten Backups getestet; die 14 bisherigen Datentabellen blieben
  dabei unveraendert. Die leere `config`-Tabelle erhielt genau eine Einstellungszeile.
- 76 Backend-/Integrationstests erfolgreich, einschliesslich Routersteuerung,
  MQTT-Telemetrie und Router-/Demo-Datentrennung. Die ACL wurde isoliert geprueft:
  Backend darf senden, Router darf lesen und Telemetrie senden, aber keine
  Soll-Konfiguration schreiben. Broker-Image und Passwortwerte blieben gleich.
- Der neue Backend-Pod laeuft mit dem verifizierten Digest und `validate`.
  Der echte Cudy bestaetigte Version `1794826560300` mit `applied: true`, ohne
  Fehler, um `2026-11-16T10:56:00Z`. AdBlocker ist installiert und ausgeschaltet;
  die gesendete Konfiguration enthaelt keine Netzwerk- oder Geraete-Domainsperren.
- Website, App, Keycloak, sieben Konten samt gespeicherten Anmeldedaten, Secrets
  und PVCs blieben unveraendert. Die neue Status-API antwortet ohne Login mit 401.

Das bestaetigt den Rollout und die Uebernahme des aktuellen Zustands, nicht einen
neuen DNS-Sperrtest auf Endgeraeten. Priorisierung (#24) und Zeitlimits (#27)
sind nicht Bestandteil dieses Backend-Releases.

Dieser Branch enthaelt aeltere Frontend-/Keycloak-Eintraege als `main` bzw. die
laufende Cloud. Deshalb fuer diesen Release nur das Backend gezielt aktualisieren,
niemals `kubectl apply -f deploy/leocloud/stack.yaml` fuer den gesamten Stack.

### Schritte fuer einen weiteren Rollout

**1. Stand holen**

```bash
git switch leocloud-deployment && git pull
kubectl config current-context
```

**2. Datenbank sichern und Migration einspielen**

```bash
kubectl --context leocloud -n student-it220208 exec deployment/nethera-db -- pg_dump -U nethera -d nethera > nethera-backup-$(date -u +%Y%m%d-%H%M%S).sql
kubectl --context leocloud -n student-it220208 exec -i deployment/nethera-db -- psql -v ON_ERROR_STOP=1 -U nethera -d nethera < Backend/Nethera/migrations/20261116_router_control.sql
```

Die Migration legt die Tabelle `router_control_state` an, macht
`blocklists.urlpattern` zur Textspalte und fuegt eine Zeile in `config` ein,
falls die Tabelle leer ist (ohne sie bleibt der Werbeschutz-Schalter grau). Sie
loescht nichts und kann wiederholt werden. Die Sicherung nicht committen.

**3. Broker-ACL aktualisieren**

Der Router darf jetzt `nethera/1/config/#` lesen, das Backend darf dorthin
schreiben.

```bash
kubectl --context leocloud -n student-it220208 create configmap nethera-mosquitto --from-file=docker/mosquitto/ --dry-run=client -o yaml \
  | kubectl --context leocloud -n student-it220208 apply -f -
kubectl --context leocloud -n student-it220208 rollout restart deployment/nethera-mosquitto
kubectl --context leocloud -n student-it220208 rollout status deployment/nethera-mosquitto
```

**4. Neues Backend-Image bauen und ausrollen**

Wie unter "Aenderungen deployen": neuer UTC-Zeitstempel-Tag, `linux/amd64`,
nie einen alten Tag wiederverwenden.

```bash
TAG=$(date -u +%Y%m%d-%H%M%S)
docker buildx build --platform linux/amd64 -t ghcr.io/denizbernecker/nethera-backend:$TAG --push Backend/Nethera
kubectl --context leocloud -n student-it220208 set image deployment/nethera-backend backend=ghcr.io/denizbernecker/nethera-backend:$TAG
kubectl --context leocloud -n student-it220208 rollout status deployment/nethera-backend
```

Danach den neuen Tag samt Digest bei `image:` in `stack.yaml` eintragen.

**5. Pruefen**

Backend ist gestartet und hat den Soll-Zustand geschickt:

```bash
kubectl --context leocloud -n student-it220208 logs deployment/nethera-backend | grep -i -E "started in|Schema|Router control|Subscription"
kubectl --context leocloud -n student-it220208 exec deployment/nethera-mosquitto -- sh -c '
  mosquitto_sub -h 127.0.0.1 -u nethera-backend -P "$NETHERA_MQTT_BACKEND_PASSWORD" -t "nethera/1/config/dns" -v -C 1 -W 5
  mosquitto_sub -h 127.0.0.1 -u router-1 -P "$NETHERA_MQTT_ROUTER1_PASSWORD" -t "nethera/1/config/dns" -C 1 -W 5 >/dev/null && echo "router-1 darf lesen"'
```

Erwartet: eine Zeile `nethera/1/config/dns {"v":1,"version":...,"adblock":false,...}`,
dann `router-1 darf lesen`. Der Adblock-Wert haengt von der gespeicherten
Einstellung ab.

Schreibverbote nur in einem isolierten Testbroker mit derselben ACL testen,
nicht mit Testnachrichten auf dem echten Steuerungstopic. Ein unveraenderter
Retained-Wert allein beweist kein Schreibverbot bei einem nicht-retained Publish.
Mit MQTT 5 liefert die Ablehnung PUBACK `RC:135` (Not authorized); der Client
kann dabei trotzdem Exitcode 0 melden. Zusaetzlich pruefen, dass der vorherige
Retained-Inhalt unveraendert bleibt.

Der Router antwortet (nur wenn der Cudy online ist und den Agent ab `6fb46ea` hat):

```bash
kubectl --context leocloud -n student-it220208 exec deployment/nethera-mosquitto -- sh -c '
  mosquitto_sub -h 127.0.0.1 -u nethera-backend -P "$NETHERA_MQTT_BACKEND_PASSWORD" -t "nethera/1/telemetry/control" -v -C 1 -W 10'
```

Erwartet: `"applied":true` mit derselben `version` wie oben. In der App zeigt
"Schutz" dann nach dem Speichern "Am Router bestaetigt".

**Wirkung beim ersten Start:** Das Backend schickt sofort den Zustand aus der
Datenbank. Dort ist der Werbeschutz anfangs aus und keine Website gesperrt. Ein
Router mit anderem Zustand (z.B. Testsperren) wird dadurch zurueckgesetzt.

**Rueckgaengig:** nur das vorherige Backend-Image wiederherstellen
(`kubectl set image ... backend=<vorher gesichertes Image>`). Vor diesem Release
war das `ghcr.io/denizbernecker/nethera-backend:20261115-183240@sha256:733345807ec8d3b6493a6693e27462705d6251a151eda4baa7a45554534778e3`.
Tabelle, Spalte und ACL koennen bestehen bleiben; das alte Backend ignoriert sie.
Ein Image-Rollback setzt bereits uebernommene Routerregeln nicht automatisch
zurueck. Keine Datenbank zuruecksetzen und keine PVCs loeschen.
