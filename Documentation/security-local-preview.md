# Lokale Schutz-Entwuerfe

Stand: 16.11.2026, nur lokal vorbereitet, nicht ausgerollt.

## Zweck und Grenzen

Die Schutzseite bleibt auch bei unvollstaendigem Router-Readback bedienbar.
Alle Aenderungen dieser Seite werden derzeit ausschliesslich als lokaler Entwurf
gespeichert: Gruppen, Mitgliedschaften, Sperrlisten, Vorlagen, Prioritaetswuensche,
Vorlagen-Zeitplaene und Werbeschutz. Die Installation wird nur vorgemerkt.
Die Seite sendet dafuer keine POST-, PUT- oder DELETE-Anfragen an das Backend.
Auch wenn eine Funktion bereits vom Backend unterstuetzt wird, bleibt eine
Aenderung auf dieser Seite in diesem Vorschau-Modus lokal.

Bestehende bestaetigte Routerlisten werden weiter gelesen. Lokal veraenderte
Listen verlieren ihre Router-Bestaetigung in der Darstellung. Ein separater
Read-only-Bereich zeigt den unveraenderten bestaetigten Stand; der Adblock-
Iststatus bleibt ebenfalls unveraendert. Eine Vormerkung ist weder Installation
noch erfolgreiche Router-Anwendung. WLAN-Messungen bleiben echte Read-only-Daten.

Die Herkunftsfilter in `api.js` bleiben aktiv. Nicht bestaetigte alte DB-Gruppen
oder Vorlagen werden nicht automatisch zu echten Routerdaten erklaert. In einer
leeren Live-Ansicht koennen eigene Gruppen und Vorlagen lokal angelegt werden.
Die Offline-Demo verwendet weiterhin ausschliesslich ihre separaten Beispieldaten.

## Speicherung und Sicherheit

`security-draft.js` ist ein reines Frontend-Modell ohne Netzwerkzugriff. Es speichert
nur geaenderte Datensaetze und ueberlagert damit den frisch gelesenen Stand.
Neue lokale IDs beginnen bei -100000; die Demo verwendet andere negative IDs.
Routerdaten und ACKs werden nie veraendert oder mit lokalen Aenderungen gespeichert.

`sessionStorage` trennt Entwuerfe nach API-Ziel, Keycloak-Benutzer-ID, Router-ID und
Live-/Demo-Modus. Es werden keine Tokens gespeichert. Ohne Account-Kontext gilt
der lokale Vorschaubereich. Ein Reload oder Seitenwechsel im selben Tab behaelt
den Entwurf; es gibt keine teamweite oder browseruebergreifende Speicherung.
Browser koennen Tabs samt Sitzung wiederherstellen. "Entwurf verwerfen" entfernt
nur den aktuell ausgewaehlten lokalen Entwurf nach Bestaetigung.

Offline/Online-Wechsel uebertragen keine Entwuerfe. Ein vollstaendiger kuenftiger
Router-Readback aktiviert ebenfalls keine automatische Synchronisation. Alte
Geraetezuweisungen bleiben unsichtbar, wenn das Geraet nicht mehr im Snapshot steht.
API-/Anmeldefehler sperren die Bearbeitung, ohne gespeicherte Entwuerfe zu loeschen.
Speicherfehler werden nicht als erfolgreicher Speichervorgang ausgegeben.

## Uebergabe ans Backend-Team

Es wurden keine Backend-Dateien, API-Vertraege oder Datenbanktabellen veraendert.
Die existierenden Formulare werden lokal ueber `apiJson` abgefangen; das neue
Modell ist kein Ersatz fuer Backend-Validierung. Der Live-Pfad bleibt getrennt.
Ein spaeteres "Auf Router anwenden" braucht eine eigene, bewusst freigegebene
Implementierung mit erneutem Readback, Konfliktpruefung und Servervalidierung.
Insbesondere Gruppenwechsel duerfen nicht durch ein erfolgreiches DELETE mit
anschliessend fehlschlagendem PUT unvollstaendig werden; dafuer ist ein atomarer
Backend-Endpunkt sinnvoll. Keinesfalls `rulesKnown` pauschal auf wahr setzen oder
sessionStorage-Inhalte automatisch als Produktionsdaten hochladen.

Bestehende fehlende Router-Funktionen und Readbacks bleiben offen. Diese Aenderung
macht die Oberflaeche bedienbar, bestaetigt aber keine QoS-, Kategorie- oder
Zeitlimit-Durchsetzung. Internetzeiten, Topologie und andere App-Seiten erhalten
diese lokalen Entwuerfe nicht als vermeintliche Live-Daten.

## Tests

`node --test Applikation/tests/*.test.cjs Website/tests/*.test.cjs`

Abgedeckt: Gruppenanlage/-wechsel, Domainaenderungen, Vorlagen und Prioritaeten,
ACK-Trennung, Reload, Scope-Wechsel, Verwerfen, Speicherfehler, Validierung und
Abfangen von Schreibaufrufen. Browserpruefung aller sechs Schutz-Tabs auf Desktop
und Mobilgeraeten mit isolierten API-Antworten und fehlerschlagendem Test bei
jedem unerwarteten Backend-Schreibversuch.
