## ADDED Requirements

### Requirement: Präsentation als eigenständige HTML-Datei
Die Präsentation SHALL als einzelne Datei `Documentation/revealjs/nethera-abschlusspraesentation.html` existieren, die ohne Build-Schritt direkt im Browser geöffnet werden kann. Reveal.js MUSS via CDN geladen werden (`https://cdn.jsdelivr.net/npm/reveal.js@5.2.1/`).

#### Scenario: Datei direkt im Browser öffnen
- **WHEN** die Datei `nethera-abschlusspraesentation.html` lokal im Browser geöffnet wird
- **THEN** zeigt Reveal.js die erste Folie an und alle CSS-Styles laden korrekt

#### Scenario: Navigation zwischen Folien
- **WHEN** der Nutzer Pfeiltasten oder Klicks auf die Reveal.js-Steuerung verwendet
- **THEN** navigiert die Präsentation durch alle 12 Folien in der definierten Reihenfolge

---

### Requirement: Dark Theme mit Nethera-Branding
Die Präsentation SHALL das Nethera-Farbschema verwenden: Hintergrund `#121212`, Primärfarbe `#2FB09A` (Teal), Akzentfarbe `#63E5C5`, Textfarbe `#e6e6e6`. Das Nethera-Logo (`../nethera_logo.png`) MUSS auf der Titelfolie sichtbar sein.

#### Scenario: Folien-Hintergrund
- **WHEN** eine beliebige Folie angezeigt wird
- **THEN** ist der Hintergrund dunkel (#121212) und Überschriften erscheinen in Teal (#2FB09A oder #63E5C5)

---

### Requirement: Titelfolie mit Projektmetadaten
Die erste Folie SHALL den Projektnamen "Nethera", die Klasse "4CHITM", die Schule "HTL Leonding", das Schuljahr "2025/26", den Zeitraum "Oktober 2025 – Juni 2026" und das Nethera-Logo enthalten.

#### Scenario: Titelfolie vollständig
- **WHEN** die erste Folie gezeigt wird
- **THEN** sind Projektname, Klasse, Schule, Zeitraum und Logo sichtbar

---

### Requirement: Team-Folie mit Stunden-Balken
Die Team-Folie SHALL alle 5 Teammitglieder als Karten zeigen mit: Avatar (Initialen), vollem Name, Gesamtstunden aus Clockify (Sprints 1–9) und einem proportionalen Balken. d.bernecker hat mit ~166h den längsten Balken (100%).

#### Scenario: Teammitglieder vollständig
- **WHEN** die Team-Folie angezeigt wird
- **THEN** sind alle 5 Karten sichtbar: Tobias Huemer, Deniz Bernecker, Nico Hofer, Manuel Freihaut, Moritz Kapeller

#### Scenario: Balken-Proportionen korrekt
- **WHEN** die Stunden-Balken verglichen werden
- **THEN** hat d.bernecker den längsten Balken (100%) und Thuemer den kürzesten (~88%)

---

### Requirement: How-it-works Folie mit howitworks.jpeg
Die Folie "Wie funktioniert es?" SHALL das Bild `howitworks.jpeg` einbinden, das den 5-Schritt-Flow (Browser → Login → Backend → Datenbank → Router) zeigt.

#### Scenario: Bild wird angezeigt
- **WHEN** die How-it-works-Folie gezeigt wird
- **THEN** ist das Bild `howitworks.jpeg` in der Folie sichtbar mit passendem max-height

---

### Requirement: Tech-Stack als 3×2-Grid
Die Tech-Stack-Folie SHALL 6 Karten zeigen: Frontend (HTML/CSS/JS), Backend (Quarkus/Java 21/REST), Datenbank (PostgreSQL 15), Auth (Keycloak/JWT), Router (OpenWRT/dnsmasq) und Tools (SSH/Git/OpenSpec).

#### Scenario: Alle 6 Tech-Karten sichtbar
- **WHEN** die Tech-Stack-Folie angezeigt wird
- **THEN** sind genau 6 Karten in einem 3-spaltigen Grid sichtbar, jede mit Titel und Bullet-Liste

---

### Requirement: Router-Kommunikations-Folie als technisches Highlight
Eine dedizierte Folie SHALL den vollständigen technischen Flow der Router-Kommunikation zeigen: Quarkus `@Scheduled` → SSH (`sshj`) → OpenWRT → DHCP-Leases / ARP-Table / `iw station dump` → PostgreSQL. Die verwendeten Technologien MÜSSEN explizit genannt werden: `sshj`, `dnsmasq`, `OpenVPN`, `BusyBox/sh`.

#### Scenario: SSH-Bibliothek sichtbar
- **WHEN** die Router-Kommunikations-Folie angezeigt wird
- **THEN** ist `sshj` (net.schmizz.sshj) als verwendete SSH-Library explizit genannt

#### Scenario: Scheduler-Konzept erklärt
- **WHEN** die Router-Kommunikations-Folie angezeigt wird
- **THEN** wird der Quarkus `@Scheduled`-Mechanismus erwähnt, der periodisch Daten holt statt bei jedem Request

---

### Requirement: Sprint-Zeitlinie mit Commit-Balken
Die Zeitlinie-Folie SHALL die 9 Sprint-Monate (Okt 2025 – Jun 2026) als horizontale Balken zeigen, proportional zu den Commit-Zahlen. Mai 2026 hat die meisten Commits (34) und erhält den längsten Balken. Jede Zeile MUSS den Sprint-Kontext als Label enthalten.

#### Scenario: Alle Monate vorhanden
- **WHEN** die Zeitlinie-Folie gezeigt wird
- **THEN** sind 9 Zeitzeilen sichtbar (Okt '25 bis Jun '26) mit Balken und Beschriftungen

---

### Requirement: Sprint-10-Review mit Frontend/Backend-Spalten
Eine Folie SHALL die Ergebnisse des letzten Sprints (Sprint 10) als zweispaltige Karte zeigen. Linke Spalte (Frontend): Dashboard-Redesign, Zeitlimits, Geräte/Gruppen-Verwaltung, Blocklists, Werbedomänen-Blockierung, Device-Presets, neue Status-Seite, Traffic-Statistiken, Konfigurationsseite, Mein Account. Rechte Spalte (Backend): Neue DB-Tabellen, DB-first Ansatz, Backend-Scheduler.

#### Scenario: Alle Sprint-10-Features gelistet
- **WHEN** die Sprint-10-Folie angezeigt wird
- **THEN** sind alle Frontend-Features und alle Backend-Features aus dem letzten Sprint aufgeführt

---

### Requirement: Zahlen & Fakten als Stats-Grid
Eine Folie SHALL mindestens 8 Statistik-Kacheln zeigen: Commits (181), Stunden gesamt (~772h), Sprints (9+), Monate (9), Werktage (~96), Teammitglieder (5), Monate Entwicklung (9), Seiten in der App (9). Dunkle Kacheln für Primär-Stats, helle für Sekundär-Stats.

#### Scenario: Gesamt-Commits korrekt
- **WHEN** die Zahlen-Folie angezeigt wird
- **THEN** zeigt die Commits-Kachel den Wert "181"

#### Scenario: Gesamtstunden korrekt
- **WHEN** die Zahlen-Folie angezeigt wird
- **THEN** zeigt die Stunden-Kachel "~772h" oder die finale Zahl inkl. Sprint 10

---

### Requirement: Zeitaufzeichnungs-Folie als HTML-Balkendiagramm
Eine Folie SHALL die kumulierten Clockify-Stunden pro Person als horizontale Balken zeigen. Jede Zeile enthält: Name, Balken (proportional, max-width basierend auf ~166h = 100%), Stundenzahl. Außerdem wird die Gesamt-Stundenzahl prominent angezeigt. Ein `<!-- TODO: Sprint 10 Stunden ergänzen -->` Kommentar MUSS im Code vorhanden sein.

#### Scenario: Alle 5 Personen sichtbar
- **WHEN** die Zeitaufzeichnungs-Folie angezeigt wird
- **THEN** sind alle 5 Teammitglieder mit ihren Stunden als Balken sichtbar

#### Scenario: Sprint-10-Platzhalter im Code
- **WHEN** der Quellcode der Folie betrachtet wird
- **THEN** ist ein TODO-Kommentar für Sprint-10-Daten vorhanden

---

### Requirement: Learnings-Folie mit 5 Punkten
Eine Folie SHALL 5 nummerierte Lernpunkte zeigen: (1) Agiles Arbeiten mit Sprints, (2) Router-Integration ist komplex (SSH, dnsmasq, OpenWRT), (3) Datenbank-first statt Router-first verbessert Performance, (4) Git-Disziplin (Conventional Commits, Feature Branches), (5) Teamkoordination über mehrere Semester.

#### Scenario: Alle 5 Lernpunkte vorhanden
- **WHEN** die Learnings-Folie angezeigt wird
- **THEN** sind genau 5 nummerierte Punkte mit Titel und kurzer Erklärung sichtbar

---

### Requirement: Abschlussfolie mit Tags
Die letzte Folie SHALL "Danke fürs Zuhören!" und "Fragen?" zeigen, plus eine Zeile mit Team-Tags (alle 5 Namen) und Projekt-Tags (Commits, Stunden, Sprints, Seiten).

#### Scenario: Abschlussfolie vollständig
- **WHEN** die letzte Folie angezeigt wird
- **THEN** sind Danke-Text, Fragen-Heading, alle 5 Teamnamen und mindestens 4 Projekt-Tags sichtbar
