# Frontend: Aufteilung und Review

Stand: 14. November 2026. Verantwortlicher für dieses Änderungspaket: nhofer07.

## Abgrenzung

Dieses Paket bearbeitet #21 (Support) und den Frontend-Anteil von #26 (vereinfachte Routereinstellungen).
Die Sicherheitsoberfläche, Priorisierungslogik, Sperrlisten und Internetzeiten wurden nicht verändert.
Der zweite Frontend-Mitarbeiter behält damit eigenständige Pakete; die folgende Aufteilung ist ein Vorschlag und keine Zuweisung an ihn.

| Verantwortlicher | Stories | Eigenständiges Arbeitspaket |
| --- | --- | --- |
| nhofer07 | #21 | Supportseite, Hilfezugänge in Website und App, Pflichtfelder, GitHub-Entwurf mit manueller Veröffentlichung |
| nhofer07 | #26 | Verständliche Einstellungen, IPv4-Validierung, erweiterte Einstellungen, Änderungsstatus, Verwerfen, Lade- und Speicherfehler |
| Kollege, vorgeschlagen | #23, #24 | Installation/Aktivierung des Werbeschutzes und Gerätepriorisierung einschließlich tatsächlicher Router-Rückmeldung |
| Kollege, vorgeschlagen | #25, #27 | Sperrlisten und Zeitlimits: Validierung, Bearbeitung und Darstellung tatsächlicher Router-Zustände |

#17 (Anmeldung), #28 (Geräteübersicht, bereits im Review) und #29 (übergreifende Qualität) bleiben gemeinsame Integrationspunkte. #29 wird durch dieses Paket nicht vollständig erledigt.

## Aufwandsschätzung für menschliche Umsetzung und Abnahme

Die folgenden 16 Stunden sind eine Planungsschätzung für einen Schülerentwickler einschließlich Einarbeitung, Umsetzung, Fehlersuche und gemeinsamer Abnahme. Sie sind **keine geleisteten oder gebuchten Zeiten** und keine Messung der Assistenzarbeit. Keine rückwirkenden Tageszuordnungen wurden erfunden. In Workaddict dürfen daraus erst anhand tatsächlich geleisteter Arbeit Einträge entstehen. Der gewünschte Zeitraum beginnt am 15. Oktober 2026; vom 8. bis einschließlich 13. November sollen keine Buchungen erfolgen.

| Story | Tätigkeit | Schätzung |
| --- | --- | ---: |
| #21 | Supportbedarf und vorhandene Hilfewege untersuchen | 1 h |
| #21 | Supportseite und verständliche Inhalte gestalten | 2 h |
| #21 | Formular, Pflichtfelder und GitHub-Entwurf umsetzen | 2 h |
| #21 | Navigation, schmale Ansichten und Tastaturbedienung prüfen | 1,5 h |
| #21 | Tests, Fehlerkorrekturen und Review mit dem Kollegen | 1,5 h |
| #26 | Bestehendes Formular und API-Vertrag prüfen | 1 h |
| #26 | Einstellungen erklären und erweiterte Felder strukturieren | 1,5 h |
| #26 | Validierung, Änderungszustand und Verwerfen umsetzen | 2 h |
| #26 | Laden, Speichern, Wiederholen und Fehlerfälle absichern | 2 h |
| #26 | Tests sowie Abnahme mit Backend und Router | 1,5 h |
| | **Gesamt** | **16 h** |

Für den Kollegen ist ein eigenes Paket von ungefähr 16 Stunden plausibel: #23 4 h, #24 4 h, #25 4 h und #27 4 h. Das ist ebenfalls eine Schätzung, abhängig vom Zustand der Backend- und Routeranbindung; vor Umsetzung gemeinsam abgleichen.

## Review #21

- Supportseite unter `/website/html/support.html`, erreichbar aus Website, Anleitung und App.
- Vorhandene Fehlerhilfe und bestehende GitHub-Issues sind verlinkt.
- Pflichtfelder, leere Texte und Sonderzeichen werden berücksichtigt.
- GitHub erhält einen vorausgefüllten Entwurf. Der Nutzer veröffentlicht selbst; die Seite behauptet keinen Versand.
- GitHub-Konto erforderlich, öffentliche Sichtbarkeit und fehlende garantierte Antwortzeit sind erklärt.
- Keine neue Supportadresse oder eigener Mail-/Ticketserver eingerichtet.

## Review #26 und verbleibende Integration

- Formular ist vor dem Laden, bei Ladefehlern und beim Speichern gesperrt.
- Fehlende Konfiguration und erneutes Laden werden angeboten.
- Routername, Betriebsmodus und IPv4-Adressen werden vor PUT geprüft; fehlerhafte erweiterte Felder werden geöffnet und fokussiert.
- Änderungen werden markiert und lassen sich auf den zuletzt geladenen/gespeicherten Stand zurücksetzen.
- Speicherfehler erhalten die Eingaben. Erfolgreiches PUT meldet ausschließlich Speicherung in Nethera.
- Der bestehende API-Vertrag verwendet weiterhin den ersten Konfigurationseintrag. Mehrere Router benötigen eine separate Auswahl und ein abgestimmtes Backend-Konzept.
- **Noch offen für vollständige Story-Abnahme:** tatsächliche Umsetzung und Rückmeldung am Router mit dem zuständigen Backend-/Router-Mitarbeiter prüfen. Deshalb #26 noch nicht auf „To be reviewed“ verschieben.

## Prüfung

- `node --test Applikation/tests/configuration.test.cjs Website/tests/support.test.cjs`
- `python3 -m unittest discover -s Website/tests -p 'test_*.py'`
- JavaScript-Syntaxprüfung und `git diff --check`.
- Safari: Support-Pflichtfelder und vorausgefüllter GitHub-Entwurf geprüft; Testentwurf verworfen, kein Testissue veröffentlicht.
- Safari: Konfiguration zunächst bei nicht verfügbarem Backend, danach erneutes Laden, Änderungsanzeige und erfolgreiches Speichern mit einem isolierten Test-Backend geprüft.
- Konfigurationsprüfungen nutzen isolierte Testantworten und ändern keinen echten Router. Eine separate Prüfung auf einem echten Mobilgerät steht noch aus.
