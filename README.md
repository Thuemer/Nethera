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

Docker Desktop starten, dann im Projekt-Hauptordner ausfuehren:

```bash
docker compose up -d --build
```

Danach [Nethera im Browser](http://localhost:5500/index.html) oeffnen. Beim ersten Start kann Keycloak etwa eine Minute brauchen. Das lokale Demo-Login lautet `demo` / `nethera-demo`. Der Keycloak-Adminbereich liegt auf [localhost:8081](http://localhost:8081), die API auf `http://localhost:8080`.

Ein Compose-Befehl startet Frontend, Backend, Keycloak und zwei PostgreSQL-Datenbanken als zusammengehoerigen Stack. Die Daten liegen in Docker-Volumes und bleiben nach einem Neustart erhalten. Nur bei einer neuen Datenbank werden Beispieldaten angelegt; bestehende Daten werden nicht ueberschrieben. Die Routerwerte sind Demo-Daten, bis ein echter Router-Sync konfiguriert ist. Der Sync ist im Docker-Start deaktiviert, weil der im Projekt hinterlegte SSH-Pfad nur auf einem Entwicklerrechner existiert.

Status und Logs:

```bash
docker compose ps
docker compose logs -f backend keycloak
```

Mit `docker compose stop` haeltst du die Dienste an; `docker compose up -d` startet sie wieder. **Nicht** `docker compose down -v` verwenden, wenn die Daten erhalten bleiben sollen. Die Standardpasswoerter und der Demo-Nutzer sind nur fuer eine lokale Vorfuehrung gedacht. Vor einem Einsatz im Netzwerk muessen sie geaendert und HTTPS eingerichtet werden.

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
