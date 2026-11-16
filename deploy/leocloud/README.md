# Nethera auf LeoCloud

Die Instanz liegt unter https://it220208.cloud.htl-leonding.ac.at/ im Namespace
`student-it220208`. Das Ingress leitet `/` an das Frontend, `/api` an Quarkus und
`/realms`, `/resources` sowie `/admin` an Keycloak weiter. Die Anwendung nutzt
zwei PostgreSQL-Datenbanken mit eigenen PersistentVolumeClaims. Der einmalige
Seed-Job fuegt Demo-Daten nur in leere Tabellen ein.

Frontend und Backend werden als private `linux/amd64`-Images aus diesem Projekt
nach `ghcr.io/denizbernecker/` gepusht. Kubernetes zieht sie ueber das Secret
`ghcr-pull`. Datenbank-, Admin- und Demo-Passwoerter liegen ausschliesslich im
Kubernetes-Secret `nethera-runtime`, nicht in diesem Repository. Der Cloud-Realm
liegt als `nethera-realm`-Secret vor. Seine Login-URLs und das Demo-Passwort
wurden fuer diese Instanz angepasst. Die Konfiguration und der Demo-Seed liegen
in den ConfigMaps `nethera-theme` und `nethera-seed`.

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
