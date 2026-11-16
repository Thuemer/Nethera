# Nethera Login-Theme

Separates Login-Theme fuer Keycloak 26.6.1 (`keycloak.v2` / PatternFly 5).
Website und Applikation werden dadurch nicht geaendert.

## Umfang

- Anthrazit `#212121`, Petrol `#144659`, Mint `#63E5C5`, Text `#E5EBE7`
  entsprechend der Nethera-Palette.
- Nethera-Logo und Favicon, responsive Formulare, sichtbare Fokusmarkierungen,
  Fehlermeldungen, Passwort-Einblendung und Sprachwahl.
- Kein eigener Login-Code und keine ersetzten FreeMarker-Formulare: Anmeldung,
  Weiterleitungen, Session-Pruefung, Passwortwechsel und MFA bleiben bei Keycloak.
- Deutsche und englische Titel; alle weiteren Uebersetzungen kommen vom Parent.
  Verfuegbare Sprachen und Standard-Sprache bleiben Einstellungen des Realms.

## Lokal pruefen

Das komplette Verzeichnis muss als `/opt/keycloak/themes/nethera` eingebunden
sein. `theme.properties` laedt zuerst die Parent-Styles, danach unsere CSS-Datei.
Bei bestehenden Containern mit `docker inspect` pruefen, ob der Bind-Mount auf
das aktuelle Repository zeigt, nicht auf eine alte OneDrive-Kopie.

Die Gestaltung wurde in einem getrennten lokalen Keycloak-Container auf
Port 8082 mit temporaerer Datenbank und ausschliesslich Wegwerf-Testkonten
geprueft. Der bestehende lokale Stack auf 5500/8080/8081 wurde nicht veraendert.
Die Vorschau ist kein Login in eure eigentliche Anwendung; bestehende Konten
sind dort nicht vorhanden. Keine produktiven Realm-Exporte oder Passwoerter
fuer eine Theme-Vorschau verwenden.

Fuer die Entwicklung wurden nur in der Vorschau diese Startparameter verwendet:

```text
--spi-theme--static-max-age=-1
--spi-theme--cache-themes=false
--spi-theme--cache-templates=false
```

Geprueft: 1440px Desktop, 390px/320px Mobilansicht, Querformat, helle/dunkle
Systemeinstellung, Tastaturreihenfolge, Passwort-Einblendung, falsche und
erfolgreiche Anmeldung, Passwortwechsel samt Fehlermeldung, MFA-Einrichtung
und Protokoll-Fehlerseite. Dabei wurden keine bestehenden Konten geaendert.

## Bereitstellung auf LeoCloud

Das eigene Keycloak-Image wird aus diesem Verzeichnis gebaut. Die Basis ist
per Digest auf exakt das bisherige Keycloak 26.6.1 festgelegt. Der Dockerfile
erganzt ausschliesslich das Login-Theme; `.dockerignore` erlaubt nur die sechs
benoetigten Theme-Dateien. Keine Realm-Exporte, Testkonten, Passwoerter oder
Entwicklungsdaten werden eingebaut. Das Frontend-Image bleibt unveraendert.

```bash
tag="$(date -u +%Y%m%d-%H%M%S)"
docker buildx build --platform linux/amd64 --provenance=false \
  -t "ghcr.io/denizbernecker/nethera-keycloak:$tag" --push themes/nethera
```

Vor einem Rollout GitHub abgleichen, Keycloak-Datenbank und Deployment sichern,
den Realm-/Client-Theme-Wert pruefen und nur das Keycloak-Deployment aktualisieren.
Das vorhandene `ghcr-pull` wird fuer das private Image wiederverwendet. Der alte
Theme-Volume-Mount muss entfallen, da er sonst die Dateien aus dem Image verdeckt.
Die alte ConfigMap `nethera-theme` selbst bleibt fuer einen Rollback erhalten.
Realm-Import-Mount, Startparameter und Datenbankverbindung bleiben unveraendert;
ein vorhandener Realm wird vom bestehenden Importmechanismus nicht ersetzt.

Beim Rollback sowohl Image als auch Theme-Mount/Volume aus der gesicherten
Deployment-Konfiguration wiederherstellen. Keine Realm-Datei ersetzen, keine
Datenbank oder PVC loeschen und keine Seeds ausfuehren. Ein Keycloak-Rollout
kann die Anmeldung kurz unterbrechen und braucht eine eigene Freigabe.

Produktions-Caches bleiben aktiv. Bei CSS-Aenderungen die Version in
`login/theme.properties` erhoehen, damit Browser die neue Datei laden.
Ausgerollte Image-Digests und Abnahme stehen unter `deploy/leocloud/`.
