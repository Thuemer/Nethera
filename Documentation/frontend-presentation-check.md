# Frontend-Prüfung für Best of Projects

Stand: 18. November 2026. Änderungen betreffen das Frontend; kein LeoCloud-Rollout.

## Änderungen

- Gemeinsame Abstände, Typografie, Karten, Formularfelder und dezenter Mint-Glow.
- Dashboard zeigt Layout- und Bereichswerkzeuge erst unter „Dashboard anpassen“.
- Topologie mit gemeinsamen Farben/Flächen und stabiler Anordnung statt wechselnder Zufallspositionen. Geräte bleiben über Suche und Auswahl erreichbar.
- Internetzeiten mit Tagesablauf-Vorschau für Tages- und Nachtsperren und Schnellvorlagen für Nachtruhe/Lernzeit. Es handelt sich um tägliche Regeln, nicht um neue Wochentagsregeln.
- Seltene Tagesbudgets (z. B. 90 Minuten) bleiben beim Bearbeiten erhalten. Fehler lassen Eingaben stehen; laufende Schreibvorgänge sperren weitere Klicks. Browser-Speicherfehler verhindern keine erfolgreiche Backend-Speicherung.
- Login-Adapter liegt lokal; für die Anmeldung wird kein externes JavaScript-CDN benötigt.

## Temporäre Demo ansehen und entfernen

Lokal auf `http://localhost:5500/index.html?entry=website&demo=1` als `demo` mit dem lokalen Standardpasswort `nethera-demo` anmelden. Acht Geräte, drei Gruppen, Vorlagen, Filter, Zeitregeln und Diagramme werden aus gemeinsamen Beispieldaten angezeigt.

Die Daten entstehen ausschließlich im Arbeitsspeicher des Tabs. Keine Demo-Datensätze werden in die Datenbank geschrieben und kein Router wird konfiguriert. Die Ansicht ist als Demo gekennzeichnet und Änderungen sind gesperrt. „Demo beenden“ in der Seitenleiste entfernt die Ansicht und lädt wieder den tatsächlichen Datenstand. Die Vorschau endet auch nach 30 Minuten; beim Abmelden wird der Sitzungsmarker entfernt. Die vorhandenen Beispieldaten bei vom Backend bestätigtem Offline-Modus bleiben davon unabhängig.

## Ergebnis

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

Geprüft: acht App-Seiten bei 1440, 768, 390 und 320 Pixel Breite; Demo, leeres Netzwerk, unbekannter Routerstatus, HTTP 500 und HTTP 401; Filter und Geräteauswahl in der Topologie; Dashboard-Anpassung; Zeitplanvorschau, Validierung, fehlerhaftes Speichern, Erhalt von Eingaben/Budget und doppeltes Absenden; öffentliche Website, Anleitung und Support. Zusätzlich echter lokaler Keycloak-Login, Navigation durch acht Seiten, Ende/Neustart der Demo und mobile Navigation.

## Vorschlag für eine kurze Vorführung

1. Website: „Geräte und Internetregeln an einem Ort“.
2. Dashboard: Netzwerkübersicht, Geräte und Beispieldiagramme zeigen.
3. Topologie: Gruppe „Familie“ auswählen, ein Gerät öffnen.
4. Internetzeiten: gespeicherte Nachtruhe auswählen und Tagesablauf erklären.
5. Schutz: Gruppen und zugewiesene Vorlagen zeigen.

Bei der Demo offen sagen, dass es Beispieldaten sind. Eine tatsächliche Routersperre nur vorführen, wenn die Wirkung am echten Router vorher bestätigt wurde.

## Grenzen außerhalb des Frontends

Die Tests belegen die geprüften Fälle, keine Fehlerfreiheit für jede Kombination. Browsermatrix derzeit Chrome; echte Routerwirkung und LeoCloud sind damit nicht geprüft. Beim lokalen Start fiel außerdem ein bestehender Seed-Fehler auf (`device_group` fehlt); der Seed-Container beendet sich deshalb mit Fehler. Das Backend-Team sollte diesen Initialisierungsfall vor einer Vorführung mit echten Daten prüfen. Die temporäre Frontend-Demo benötigt den Seed nicht.

## Nachprüfung: Topologie-Vollbild

Echter Vollbildmodus für die gesamte Topologie einschließlich Suche, Filter und Gerätedetails. Der zusätzliche Einpassen-Button wurde entfernt, damit nur ein Vollbild-Symbol sichtbar ist. App-iframe erlaubt jetzt Fullscreen.

`npm run test:topology` prüft Vollbild im iframe, Auswahl per tatsächlichem Canvas-Klick, Detailspalte, Ansichtswechsel, Zoom/Reset, Ein-/Ausschalten, externes Beenden, verweigerte Browserfreigabe, Ladefehler mit Wiederherstellung sowie schmale und breite Ansichten. Zusätzlich wurde Vollbild mit echtem lokalem Demo-Login geprüft. Escape wird im Headless-Browser nicht als Browser-Tastenkürzel ausgeführt; der externe Ausstieg wird dort über die Fullscreen-API getestet.
