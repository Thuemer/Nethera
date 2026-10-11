# Nethera

<!-- Logo -->
<p align="center">
  <img src="./Documentation/nethera_logo.png" alt="Nethera Logo" width="200"/>
</p>

## Kurzbeschreibung

Willkommen beim Nethera-Projekt. Dieses Repository enthält die Implementierung und Dokumentation unseres Projektteils im Rahmen des ITP-Kurses. Ziel ist es, eine Web-Anwendung und Handy-App zur Verwaltung des Heimnetzwerks zu entwickeln.

## Features

- Klassische Routereinstellungen
- AdBlocker
- Priorisierung
- Zeitbeschränkung
- Kindersicherung (Seiten sperren)
- Erweiterte Routereinstellungen

## Schnellstart

1. Repository klonen:

```bash
cd Nethera
git clone git@github.com:Thuemer/Nethera.git
```

2. Website lokal öffnen (vom Repository-Hauptverzeichnis aus):

```bash
# macOS: direkt im Standardbrowser öffnen
open Website/index.html
```

Alternativ mit einem lokalen Webserver:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory Website
```

Anschließend http://localhost:8000 öffnen. Mit `Ctrl+C` wird der Server beendet.
Die Hauptseite liegt unter `Website/html/nethera.html`; ein Build oder `npm install` ist nicht nötig. Die ausführliche Anleitung liegt unter `Website/html/step_by_step.html`.

### Stand der Website-Userstories

- **#16 Zugriff:** Website und Anleitung sind lokal ohne Anmeldung nutzbar. Online-Veröffentlichung ist noch offen.
- **#18 Anleitung:** Fünf Schritte mit Vorbereitung, OpenWrt-Grundeinrichtung, Verbindungstest und Fehlerhilfe.
- **#19 Features:** Übersicht und Erläuterungen zu den fünf geplanten Nethera-Funktionen.
- **#20 Einstieg:** Wege für vorhandene und neue Router, Voraussetzungen und nächste Schritte.

Die Anleitung bereitet OpenWrt vor; sie ersetzt nicht die separate Nethera-Anbindung. Öffentliche Nethera-Zugangs-/Download-URLs und Bestellziele sind noch offen. Sobald diese bereitstehen, die Hinweise im Abschnitt `#loslegen` und in Schritt 5 der Anleitung ergänzen.


3. Projektpräsentation lokal anzeigen:

```bash
python3 -m http.server 8001 --bind 127.0.0.1 --directory Documentation
```

Anschließend http://localhost:8001 öffnen.

## Farbpalette
- \#001818
- \#144659
- \#E5EBE7
- \#63E5C5
- \#212121 

## Mitwirkende

- Deniz Bernecker
- Nico Hofer
- Tobi Huemer
- Manuel Freihaut
- Moritz Kapeller

## Links & Ressourcen

- Pinterest: https://pin.it/2GTQ6jTph
- Figma: https://www.figma.com/design/5G9cHovtzrnUnOK0Hz4hKx/Nethera-UI?node-id=0-1&m=dev&t=AvRlocKcx4yQaN3R-1
- Farbpalette: https://www.realtimecolors.com/?colors=E5EBE7-212121-144659-001818-63E5C5&fonts=Inter-Inter
