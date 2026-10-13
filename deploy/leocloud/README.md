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
