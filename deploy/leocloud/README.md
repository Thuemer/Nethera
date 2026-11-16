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
