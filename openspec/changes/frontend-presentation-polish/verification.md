# Frontend-Pruefprotokoll

Datum: 19.11.2026. Branch: `fix/frontend-presentation-polish`, urspruengliche Basis: `94b7009`.
Status: lokal umgesetzt, angesehen und fuer Commit/Push sowie Frontend-Releasevorbereitung freigegeben. Neuer LeoCloud-Rollout noch ausstehend.

Team-Abgleich: `git fetch origin --prune --tags` meldete `origin/main=0d08547` und den neuen Vorschlagsbranch `router-time-limits=5bf6e67`. Die 35 uncommittierten Dateien wurden zusaetzlich unter `/private/tmp/nethera-release-2026-11-19T10-27-57-052Z` gesichert; Manus ausschliesslich neue OpenSpec-/Mockup-Dateien wurden anschliessend per Fast-Forward uebernommen. Keine fremden Commits ersetzt, keine Backend-Aenderungen integriert. Der Entwurf `topology-visual-refresh` ist noch keine fertige App-Implementierung; die gewuenschte Auswahl bleibt bis zur Klaerung offen. Cache-Version fuer die geaenderten Frontend-Assets: `20261119-polish`.

## Ergebnis

- Bestehende Nethera-Farben, Seitenaufteilung und Funktionen bleiben erhalten.
- Schutz: kompakter Bearbeitungsstatus, weniger doppelte Angaben, ruhigere Listen; lokale Aenderungen werden gezielt gekennzeichnet, auch beim Entfernen einer Zuweisung.
- Prioritaeten: nicht gemeldete Werte bleiben unbekannt; unveraenderte Beispiele werden nicht als eigene lokale Aenderungen bezeichnet.
- Internetzeiten: Vorschau passt sich ihrem Inhalt an; weniger verschachtelte Rahmen, Routerbestaetigung bleibt sichtbar.
- Konfiguration: kompakte Router-/Speicherinformation, einheitlichere Formularzeilen.
- Status: fehlende Telemetrie ist neutral und nicht null Geraete oder bestaetigt offline.
- Datenverkehr: alle Tabellenspalten auf Mobilgeraeten lesbar; Download-/Upload-Legende.

## Automatische Pruefungen

| Pruefung | Ergebnis |
| --- | --- |
| `npm test` in `Applikation` | 120 Tests erfolgreich, einschliesslich der nachtraeglichen Demo-Hinweis-Pruefungen |
| `tests/browser-smoke.cjs` | 83 Browser-Szenarien erfolgreich |
| `tests/presentation-polish-browser.cjs` | 42 gezielte Szenarien erfolgreich |
| `tests/presentation-browser.cjs` | Demo-Opt-in, normale Konten, Datenquellenwechsel und lokale Entwuerfe erfolgreich |
| Docker-Build mit bestehendem Frontend-Dockerfile | erfolgreich; nur lokales Image `nethera-frontend:presentation-polish-local` |
| Bestehendes lokales Keycloak | Vorschau-Redirect akzeptiert; bestehende Sitzung sichtbar und Abmelden erfolgreich; dokumentierte Standardanmeldung fuer `demo` beim manuellen Folgecheck abgewiesen |
| `git diff --check` | erfolgreich |
| Scope-Vergleich | 212 ausgeschlossene Dateien unveraendert, darunter Topologie, Website, Backend, Router und Deployment |

Browser: Chromium, Breiten 320/390/768/1440 px. Alle API-Anfragen in den Interaktionstests werden abgefangen; keine Testschreibzugriffe erreichen Backend oder Router. Screenshots wurden fuer Dashboard, Clients, Status, Schutz, Internetzeiten, Datenverkehr, Konfiguration, Account und Navigation angesehen. Alle sechs Schutz-Tabs und die Gruppenverwaltung sind zusaetzlich auf schmalen Displays geprueft. Die Navigationspruefung wartet auf das Ende der Breitenanimation (Desktop 248/72 px, mobil volle Breite).

Wiederholung gegen einen lokalen Frontend-Server mit installiertem Playwright/Chromium:

```sh
cd Applikation
npm test
NETHERA_TEST_URL=http://127.0.0.1:5500/presentation-preview node tests/browser-smoke.cjs
NETHERA_TEST_URL=http://127.0.0.1:5500/presentation-preview node tests/presentation-polish-browser.cjs
NETHERA_TEST_URL=http://127.0.0.1:5500/presentation-preview node tests/presentation-browser.cjs
```

`NETHERA_SCREENSHOTS` setzt optional den Ausgabeordner. Auf diesem Mac wurde die bereitgestellte Playwright-Laufzeit mit ihrem Chromium verwendet. Bilder liegen temporaer unter `/private/tmp/nethera-polish/screenshots` und `/private/tmp/nethera-polish/detail-screenshots`, nicht im Git-Repository.

## Lokale Vorschau

Designabnahme ohne Anmeldung: http://127.0.0.1:5501/index.html?entry=website&demo=1

Nach fehlgeschlagener Anmeldung am bestehenden Demokonto wurde ein separater Loopback-Server unter `/private/tmp/nethera-polish/demo-server.cjs` gestartet. Er liefert dieselben statischen Vorschau-Dateien, eine rein synthetische Demo-Identitaet und lokale API-Fixtures aus. Keine echten Tokens, kein Proxy, keine Aenderungen am Keycloak oder produktiven Authentifizierungscode. Alle Methoden ausser GET/HEAD werden mit 405 abgelehnt; echte `/api/`-Routen existieren nicht. Die Content-Security-Policy beschraenkt Netzwerkverbindungen auf den eigenen Ursprung. Start bei freiem Port: `node /private/tmp/nethera-polish/demo-server.cjs`. Diese temporaere Laufzeit gehoert nicht zum Release.

Manuell sichtbar geprueft: Dashboard mit acht Geraeten und Diagrammen; Topologie mit acht Knoten und Gruppenlegende; Schutz mit Gruppen-/Vorlagenzuweisungen; Internetzeiten mit vier Beispielregeln; schreibgeschuetztes und klar gekennzeichnetes Beispielkonto. HTTP-Pruefung bestaetigt lesbare Fixtures (200), abgelehnte Schreibzugriffe (405), fehlende reale API (404) und gesetzte Netzwerk-CSP. Im eingebetteten Browser wurde Fullscreen verweigert und der vorgesehene Hinweis angezeigt; Safari/Chrome-Vollbild bleibt bei der manuellen Sichtabnahme zu pruefen. Die urspruengliche lokale Demo-Anmeldung ist weiterhin offen.

Integration mit echter lokaler Anmeldung:

URL: http://127.0.0.1:5500/presentation-preview/index.html

Die Vorschau ist ein separater Unterordner im bereits laufenden lokalen Frontend-Container. Die bisherigen Seiten unter `/` und `/index.html` wurden nicht ersetzt. Der Pfad nutzt die bereits zugelassene lokale Keycloak-Adresse; Realm, Konten und Passwoerter wurden nicht veraendert. Nach einem Neuerstellen des Frontend-Containers muss die temporaere Vorschau erneut bereitgestellt werden.

Wichtig fuer die spaetere Integration: Der lokale Vorschau-Build verwendet weiterhin die kompatible `account.js` aus dem vorigen Frontend-Release (Basis `c88bfd3`, mit bestehender Demo-Logout-Bereinigung). Die im Repository neuere Router-Ownership-Anmeldung benoetigt die passende Backend-Version. Diese wurde bewusst weder zurueckgesetzt noch ausgerollt. Details stehen im Release-Eintrag vom 19.11.2026 in `deploy/leocloud/README.md`.

## Grenzen und Freigabe

Nachtrag zur Demo-Anzeige: Lange Demo-/Nur-Ansicht-Hinweise werden nicht mehr auf jeder Seite wiederholt. Die App kennzeichnet den Modus einmal dezent beim Logo, einzeln geoeffnete Seiten mit dem kurzen Label `Demo`. Echte Fehler, Live-/Unbekannt-Hinweise und lokale Entwurfsstatus bleiben sichtbar. Topologie-Aenderung hier ausschliesslich: redundante Demo-Bildunterschrift entfernt, kein Design- oder Funktionsumbau. 120 JavaScript-Tests und die erweiterten Praesentationsregressionen fuer acht Seiten sowie Demo/Live-Wechsel bestanden; kein API-Schreibzugriff. Die bisherige Scope-Pruefung oben bezieht sich auf den Stand vor diesem Text-Nachtrag.

- `npm run build` konnte mangels installierter Vite-Binaerdatei nicht starten. Der tatsaechlich verwendete statische Nginx-/Docker-Build war erfolgreich; keine Abhaengigkeiten wurden nachinstalliert.
- OpenSpec CLI ist nicht installiert. Struktur und Verlinkungen sind vorbereitet; `openspec validate frontend-presentation-polish --strict` bleibt offen.
- Kein erfolgreicher neuer Login mit Passwort: Die dokumentierte Standardanmeldung fuer das lokale Demokonto wurde beim manuellen Folgecheck abgewiesen. Anmeldung an Deniz uebergeben; keine Konten oder Passwoerter geaendert. Physische Routeraktionen bleiben ungetestet. Fixture-Tests sind keine Garantie fuer jede Netzwerk-/Hardwarekonstellation und keine End-to-End-Abnahme von #23/#24/#25/#27.
- Keine Aenderung an Manus Topologie-Design. Bereits vorher vorhandene Topologie-/Release-Aenderungen bleiben getrennt vom Polish-Scope erhalten.
- Die Cache-Version wurde fuer den angefragten Frontend-Release aktualisiert; neue Image-Metadaten erst nach erfolgreichem Rollout eintragen. Vor jedem Push Team-Stand erneut abrufen und ohne Force-Push arbeiten.

## Kurzer Praesentationscheck

1. Mit bestehendem Konto anmelden und auf dem Vorfuehrgeraet Navigation, Abmelden und erneutes Anmelden testen.
2. Bei verbundenem Router den Live-Hinweis und echte Geraetenamen zeigen; keine Demodaten als Routerdaten darstellen.
3. Eine lokale Gruppe/Vorlage zuweisen, den Entwurfs-Hinweis zeigen, neu laden und danach den Entwurf verwerfen. Keine Routerwirkung versprechen.
4. Internetzeiten und Werbeschutz nur mit ihrem tatsaechlichen Bestaetigungsstatus vorfuehren; kein neues Feature als fertig praesentieren.
5. Manus Topologie separat mit ihm abstimmen. Nach einem genehmigten Rollout denselben Kurztest auf LeoCloud wiederholen.
