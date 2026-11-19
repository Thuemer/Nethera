# Frontend-Prüfung für Best of Projects

Stand: 19. November 2026. Polish und die anschließend beauftragte Klassisch-/Baum-Topologie sind auf `fix/frontend-presentation-polish` gesichert und aus Commit `8382f01` als reines Frontend auf LeoCloud ausgerollt. Image, Prüfungen und Rollback stehen im [Deployment-Protokoll](../deploy/leocloud/README.md#presentation-polish-und-klassisch-baum-topologie-vom-19112026). Backend, Konten und Daten wurden nicht verändert. Die früheren Prüfstände bleiben unten als Verlauf erhalten.

## Topologie-Integration nach Freigabe

Manuels neuer Push `0d08547` enthielt Plan und Mockup, noch keine fertige App-Seite. Auf ausdruecklichen Wunsch wurde sein `Klassisch / Baum`-Plan anschliessend auf demselben Branch umgesetzt. Beide Ansichten nutzen unveraenderte Routerdaten und lokale Entwuerfe. 122 Unit-Tests, 83 allgemeine Browser-Szenarien, 42 Polish-Szenarien, Praesentationsregression und die neue Topologie-Suite bestanden. Details und der noch offene manuelle Echtkonto-Check stehen im [Topologie-Pruefprotokoll](../openspec/changes/topology-visual-refresh/verification.md). Die folgenden Aussagen zum unveraenderten Topologie-Design beschreiben den zuvor abgeschlossenen Polish, nicht diese anschliessend angefragte Integration.

## Aktuelle lokale Vorschau

[Gefüllte lokale Demovorschau ohne Anmeldung öffnen](http://127.0.0.1:5501/index.html?entry=website&demo=1). Sie verwendet dieselben Frontend-Dateien und vorhandenen Beispieldaten, aber einen getrennten Server ausschließlich auf `127.0.0.1:5501`. Das Beispielkonto ist keine echte Keycloak-Anmeldung. Alle API-Schreibzugriffe werden abgelehnt; es gibt weder einen Backend-Proxy noch Zugriff auf echte Konten oder Router. Dashboard, Topologie, Schutz und Internetzeiten wurden mit gefüllten Ansichten geprüft. Die Accountansicht zeigt ausdrücklich ein schreibgeschütztes Beispielkonto.

Die [Vorschau mit echter lokaler Anmeldung](http://127.0.0.1:5500/presentation-preview/index.html?entry=website) bleibt separat im laufenden Frontend-Container verfügbar; die bisherigen Seiten unter `/` und `/index.html` bleiben erhalten. Nach einem Neuerstellen des Containers muss diese temporäre Vorschau wieder bereitgestellt werden. Der zusätzliche Demo-Server liegt außerhalb des Repositorys unter `/private/tmp/nethera-polish/demo-server.cjs` und gehört nicht zum Produktions-Build. Start: `node /private/tmp/nethera-polish/demo-server.cjs` (wenn Port 5501 frei ist).

- Bestehende Nethera-Farben und Seitenstruktur bleiben erhalten; keine neue Gestaltung der Topologie.
- Schutz: ruhigere Listen, weniger doppelte Gruppen-/Vorlagenangaben, kompaktere Hinweise und gezielte Kennzeichnung lokaler Änderungen.
- Konfiguration und Internetzeiten: einheitlichere Formulare, weniger verschachtelte Rahmen und eine inhaltsgerechte Vorschauhöhe.
- Status: unbekannte Routerdaten werden nicht als bestätigtes Offline oder als null Geräte dargestellt.
- Datenverkehr: alle Tabellenspalten sind auch auf kleinen Displays lesbar; Download und Upload haben eine Legende.
- Demo-Anzeige: keine wiederholten Demo-/Nur-Ansicht-Hinweistexte. Ein dezentes „Demo“ beim Logo kennzeichnet die App; einzeln geöffnete Seiten behalten ein kurzes Label. Fehler und lokale Entwurfsstatus bleiben sichtbar. Die Topologie verliert nur die redundante Demo-Bildunterschrift, nicht ihre Gestaltung oder Funktionen.

117 JavaScript-Tests, 83 allgemeine Browser-Szenarien, 42 gezielte Layout-/Interaktionsszenarien, die vorhandenen Präsentationsregressionen und der lokale Docker-Build waren erfolgreich. Account und Navigation wurden mit isolierter Anmeldung geprüft; das echte lokale Keycloak akzeptiert den Vorschau-Redirect. Beim anschließenden manuellen Versuch wurde die dokumentierte Standardanmeldung des lokalen Demokontos abgewiesen. Die Demo-Anmeldung und Sichtabnahme durch Deniz bleiben deshalb offen; Konten und Passwörter wurden nicht geändert. Physische Routeraktionen wurden nicht getestet. Vite- und OpenSpec-CLI-Prüfungen sind mangels installierter Programme offen.

Nach der Bereinigung der Demo-Hinweise bestehen 120 JavaScript-Tests, die erweiterten Präsentationsregressionen und erneut alle 42 gezielten Browser-Szenarien. Schreibsperren und die Trennung von echten und Demo-Daten bleiben unverändert.

Umfang, Testbefehle und Grenzen stehen im [OpenSpec-Prüfprotokoll](../openspec/changes/frontend-presentation-polish/verification.md); die Qualitätsanforderungen sind in der [MetaSpec](meta-spec.md#13-anforderungen-an-qualität-und-benutzerfreundlichkeit) verankert. Manus Topologie-Design, Website, Backend, Konten, Daten und Router wurden bei dieser Überarbeitung nicht verändert.

**Release-Abgleich:** Vor dem Commit wurden alle Team-Branches abgerufen. Manus Commit `0d08547` enthält den Plan und das Mockup für „Klassisch“ und „Baum“. Er wurde ohne Überschneidung per Fast-Forward auf den Feature-Branch übernommen. Die anschließende Implementierung wurde ausdrücklich freigegeben und ist oben separat dokumentiert. `router-time-limits` enthält einen eigenen Zeitlimit-Vorschlag und wurde nicht mit dem Frontend ausgerollt. Polish und beide Topologieansichten sind jetzt gemeinsam auf LeoCloud; das aktuelle Deployment-Protokoll ist oben verlinkt.

## Ausgangsstand vom 18. November

- Gemeinsame Abstände, Typografie, Karten, Formularfelder und dezenter Mint-Glow.
- Dashboard zeigt Layout- und Bereichswerkzeuge erst unter „Dashboard anpassen“.
- Topologie mit gemeinsamen Farben/Flächen und stabiler Anordnung statt wechselnder Zufallspositionen. Geräte bleiben über Suche und Auswahl erreichbar.
- Internetzeiten mit Tagesablauf-Vorschau für Tages- und Nachtsperren und Schnellvorlagen für Nachtruhe/Lernzeit. Es handelt sich um tägliche Regeln, nicht um neue Wochentagsregeln.
- Seltene Tagesbudgets (z. B. 90 Minuten) bleiben beim Bearbeiten erhalten. Fehler lassen Eingaben stehen; laufende Schreibvorgänge sperren weitere Klicks. Browser-Speicherfehler verhindern keine erfolgreiche Backend-Speicherung.
- Login-Adapter liegt lokal; für die Anmeldung wird kein externes JavaScript-CDN benötigt.

## Temporäre Demo ansehen und entfernen

Für den neuen lokalen Stand [die getrennte Demo-Vorschau](http://127.0.0.1:5500/presentation-preview/index.html?entry=website&demo=1) öffnen und mit dem vorhandenen lokalen Konto `demo` anmelden. Für die unveränderte lokale Hauptansicht gilt weiterhin `http://localhost:5500/index.html?entry=website&demo=1`. Ohne `demo=1` oder bewusst eingeschaltete Vorschau im selben Tab bleibt der tatsächliche Routerstatus maßgeblich, auch für das Demo-Konto. Die Vorschau lässt sich mit „Demo ansehen“ aktivieren. Acht Geräte, drei Gruppen, Vorlagen, Filter, Zeitregeln und Diagramme werden aus gemeinsamen Beispieldaten angezeigt.

Da die dokumentierte Anmeldung momentan abgewiesen wird, für die reine Designabnahme den oben verlinkten isolierten Server auf Port 5501 verwenden. Dort bleiben ausschließlich Beispieldaten verfügbar, auch nach „Demo beenden“; dieser Server kann nicht zu echten Routerdaten wechseln. Das ist keine Prüfung des produktiven Logins. Im eingebetteten Vorschau-Browser wurde die Fullscreen-Anfrage verweigert; den Vollbild-Button separat in Safari oder Chrome prüfen.

Die Beispieldaten entstehen ausschließlich im Arbeitsspeicher des Tabs. Keine Demo-Datensätze werden in die Datenbank geschrieben und kein Router wird konfiguriert. Internetzeiten und Konfiguration bleiben in der Demo schreibgeschützt. Unter Schutz sind ausdrücklich gekennzeichnete lokale Entwürfe möglich; diese liegen im Sitzungsspeicher des Browser-Tabs und senden keine Routerbefehle. „Demo beenden“ in der Seitenleiste entfernt die Demo-Ansicht und lädt wieder den tatsächlichen Datenstand. Die Vorschau endet auch nach 30 Minuten; beim Abmelden wird ihr Sitzungsmarker entfernt. Die Beispieldaten bei vom Backend bestätigtem Offline-Modus bleiben davon unabhängig.

## Prüfergebnis vom 18. November

71 Logiktests (App und Website), ein Website-Navigationstest und 83 Browser-Szenarien erfolgreich. Die Browserprüfung wurde zusätzlich gegen den gebauten lokalen Frontend-Container ausgeführt. Echter Demo-Login und Entfernen der Vorschau erfolgreich, ohne API-Schreibzugriffe.

Weitere Korrekturen: lokale Uhrzeiten im Speed-Diagramm, sicheres Rendern von Gerätenamen mit Sonderzeichen, toleranter Umgang mit beschädigtem Dashboard-Speicher, per Tastatur bedienbare Auswahllisten sowie mobile Geräteliste mit direkt erreichbaren Detail-Schaltflächen.

## Wiederholbare Prüfungen

Frontend und Backend/Keycloak lokal starten wie in der Haupt-README beschrieben.

```sh
cd Applikation
npm ci
npm test
npm run test:browser
```

Die Browsertests verwenden installiertes Chrome im Headless-Modus. `NETHERA_BROWSER` kann einen anderen Playwright-Kanal wählen. `NETHERA_TEST_URL` überschreibt die lokale Adresse. Mit `NETHERA_SCREENSHOTS=/tmp/nethera-qa npm run test:browser` werden zusätzlich Desktop- und Handyansichten gespeichert. API-Antworten und alle Schreibzugriffe dieser Tests werden im Browser abgefangen.

Im Ausgangsstand geprüft: acht App-Seiten bei 1440, 768, 390 und 320 Pixel Breite; Demo, leeres Netzwerk, unbekannter Routerstatus, HTTP 500 und HTTP 401; Filter und Geräteauswahl in der Topologie; Dashboard-Anpassung; Zeitplanvorschau, Validierung, fehlerhaftes Speichern, Erhalt von Eingaben/Budget und doppeltes Absenden; öffentliche Website, Anleitung und Support. Der damalige echte lokale Login-Test ersetzt nicht die noch offene manuelle Abnahme der neuen Vorschau.

## Vorschlag für eine kurze Vorführung

1. Website: „Geräte und Internetregeln an einem Ort“.
2. Dashboard: Netzwerkübersicht, Geräte und Beispieldiagramme zeigen.
3. Topologie: Gruppe „Familie“ auswählen, ein Gerät öffnen.
4. Internetzeiten: gespeicherte Nachtruhe auswählen und Tagesablauf erklären.
5. Schutz: Gruppen und zugewiesene Vorlagen zeigen.

Bei der Demo offen sagen, dass es Beispieldaten sind. Eine tatsächliche Routersperre nur vorführen, wenn die Wirkung am echten Router vorher bestätigt wurde.

## Grenzen außerhalb des Frontends

Die Tests belegen die geprüften Fälle, keine Fehlerfreiheit für jede Kombination. Browsermatrix derzeit Chrome; echte Routerwirkung ist damit nicht geprüft. Die spätere Prüfung der ausgelieferten LeoCloud-Dateien ist im aktuellen Deployment-Protokoll dokumentiert und ersetzt keinen manuellen Echtkonto-Test. Beim lokalen Start fiel außerdem ein bestehender Seed-Fehler auf (`device_group` fehlt); der Seed-Container beendet sich deshalb mit Fehler. Das Backend-Team sollte diesen Initialisierungsfall vor einer Vorführung mit echten Daten prüfen. Die temporäre Frontend-Demo benötigt den Seed nicht.

## Nachprüfung: Topologie-Vollbild

Echter Vollbildmodus für die gesamte Topologie einschließlich Suche, Filter und Gerätedetails. Der zusätzliche Einpassen-Button wurde entfernt, damit nur ein Vollbild-Symbol sichtbar ist. App-iframe erlaubt jetzt Fullscreen.

`npm run test:topology` prüft Vollbild im iframe, Auswahl per tatsächlichem Canvas-Klick, Detailspalte, Ansichtswechsel, Zoom/Reset, Ein-/Ausschalten, externes Beenden, verweigerte Browserfreigabe, Ladefehler mit Wiederherstellung sowie schmale und breite Ansichten. Zusätzlich wurde Vollbild mit echtem lokalem Demo-Login geprüft. Escape wird im Headless-Browser nicht als Browser-Tastenkürzel ausgeführt; der externe Ausstieg wird dort über die Fullscreen-API getestet.

## LeoCloud-Nachprüfung vom 19. November

Beim erneuten Browserlauf wurde ein Überlauf der Topologie-Legende auf 320 px
behoben. Die Präsentationsdemo ist jetzt ausdrücklich einschaltbar, statt
beim Demo-Konto standardmäßig echte Routerdaten zu verdrängen. Der zusätzliche
Test `node tests/presentation-browser.cjs` prüft diese Auswahl, normale Konten,
Abmelden, Live-/Offline-Wechsel, lokale Gruppen und Vorlagen sowie unveränderte
Online-/Offline-Gerätedaten. Er verwendet dieselben Browser-/URL-Variablen wie
die anderen Browsertests und isoliert sämtliche API-Zugriffe.

110 JavaScript-Tests, ein Website-Navigationstest, 83 Browser-Szenarien und die
zusätzlichen Topologie-/Präsentationstests bestehen. Der Frontend-Rollout und
seine bewusst beibehaltene Account-Kompatibilitätsausnahme sind in
`deploy/leocloud/README.md` dokumentiert. Backend, Keycloak, Konten und Daten
wurden nicht verändert.
