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
`image:`-Eintrags in `stack.yaml` erforderlich. Danach `kubectl apply -f
deploy/leocloud/stack.yaml` ausfuehren und die Rollouts sowie Image-Digests
pruefen. Nie einen alten Tag erneut verwenden.

Der Keycloak-Realm wird beim erstmaligen Anlegen der Keycloak-Datenbank
importiert. Aenderungen an `Applikation/realm-export.json` aktualisieren einen
bestehenden Realm nicht automatisch. Die Cloud-Instanz nutzt bis zur
Router-Anbindung Demo-Daten: Der Scheduler und MQTT-Empfang sind dort aus. Fuer
echte Router-Telemetrie braucht es spaeter einen separat erreichbaren,
abgesicherten Transport. Der lokale MQTT-Compose-Stack bleibt davon unberuehrt.

Die PVCs `nethera-db-data` und `nethera-keycloak-db-data` enthalten die
dauerhaften Daten. **Nicht loeschen**, ohne sie vorher zu sichern: LeoCloud
kann geloeschte PVC-Daten nicht wiederherstellen. `stack.yaml` enthaelt die
persoenliche LeoCloud-Adresse und den GHCR-Besitzer; fuer einen anderen
Team-Namespace muessen diese Werte angepasst werden.
