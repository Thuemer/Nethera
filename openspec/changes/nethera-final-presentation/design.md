## Context

Eine finale Abschlusspräsentation für das Nethera ITP-Projekt (4CHITM, HTL Leonding, 2025/26) soll als einzelne HTML-Datei in `Documentation/revealjs/` erstellt werden. Die Präsentation nutzt Reveal.js (CDN), wie die beiden vorhandenen Präsentationen (`final-presentation.html` von Team Wels und `Sprintpräsentationen/index.html`). Das Design orientiert sich an der Nethera App-Farbgebung (dark mode, Teal `#2FB09A`), nicht an Team Wels' White-Theme.

**Vorhandene Assets in `Documentation/revealjs/`:**
- `howitworks.jpeg` — 5-Schritt-Infografik des Systemablaufs
- `../nethera_logo.png` — Nethera Logo
- `../nethera_poster.png` — Projektplakat
- `../Projektantrag_Nether_4CHITM_2526.png` — genehmigter Projektantrag

**Clockify-Daten (kumuliert, Sprints 1–9):**
- d.bernecker: ~166h | n.hofer: ~160h | Moritz Kapeller: ~153h | m.freihaut: ~150h | Thuemer: ~146h
- Gesamt: **~772h** ≈ 96 Werktage (à 8h) ≈ 19 Werktage pro Person
- Sprint 10 wird nach der Abgabe des Screenshots ergänzt (Platzhalter-Kommentar im HTML)

**Git-Statistiken:**
- 181 Commits | 9 Sprints | Zeitraum: Okt 2025 – Jun 2026
- Commits pro Monat: Okt 9, Nov 34, Dez 11, Jan 25, Feb 16, Mär 30, Apr 14, Mai 34, Jun 8

## Goals / Non-Goals

**Goals:**
- Vollständige, standalone HTML-Datei ohne Build-Schritt
- Alle Inhalte hardcoded (keine API-Calls, kein dynamisches Laden)
- Folie für Router-Kommunikation als technisches Highlight (SSH/sshj/dnsmasq/Scheduler)
- Clockify-Daten als HTML-Balkendiagramm (kein Screenshot, saubere Darstellung)
- Sprint-10-Review als eigene Folie mit Frontend/Backend-Spalten

**Non-Goals:**
- Keine App-Screenshots (explizit vom Nutzer ausgeschlossen)
- Keine externe Hosting-Abhängigkeit außer Reveal.js CDN
- Kein Replacement der bestehenden Sprintpräsentationen

## Decisions

### D1: Reveal.js 5.2.1 via CDN — weißes Theme-Basis mit Dark Override

**Warum**: Konsistent mit den bestehenden Präsentationen im Projekt. `reveal.js@5.2.1` ist bereits in `final-presentation.html` verwendet.

**Dark Override**: Die `white.css`-Theme wird geladen, aber vollständig via `<style>`-Block überschrieben (background `#121212`, headings in `#2FB09A`/`#63E5C5`), da Reveal.js kein passendes dark theme mit Teal-Akzent mitliefert.

**Alternativen verworfen**: `black.css` theme → schlechtere Lesbarkeit, Farbkontrast passt nicht zum Nethera Teal.

### D2: Clockify als HTML-Balkendiagramm, nicht als Screenshot

**Warum**: Screenshots aus Clockify sind auf dem Free-Plan nach 6 Monaten nicht mehr zugänglich (Daten >6 Monate werden archiviert). Die Rohdaten aus den Sprint-Screenshots wurden manuell kumuliert und als HTML-Bars codiert. Das ergibt eine sauberere, besser lesbare Folie als 9 einzelne Screenshots.

**Platzhalter für Sprint 10**: Ein `<!-- TODO: Sprint 10 Stunden hier ergänzen -->` Kommentar im Balkendiagramm ermöglicht einfaches Nachtragen.

### D3: Folienstruktur — 12 Folien

```
1.  Titelfolie           — Name, Klasse, Schule, Zeitraum
2.  Das Team             — 5 Karten mit Stunden-Bars
3.  Was ist Nethera?     — Beschreibung + Feature-Tags
4.  Wie es funktioniert  — howitworks.jpeg eingebettet
5.  Tech-Stack           — 3x2 Grid (Frontend/Backend/DB/Auth/Router/Tools)
6.  Router-Kommunikation — Highlight-Folie: SSH/sshj/dnsmasq/Scheduler Flow
7.  Projektverlauf       — Monatsbalken (Commit-Timeline)
8.  Sprint 10 Review     — Letzte Sprint: Frontend + Backend 2-Spalten
9.  Zahlen & Fakten      — Stats-Grid (commits, Stunden, Sprints, Tage, ...)
10. Zeitaufzeichnung     — HTML-Balkendiagramm pro Person + Gesamt
11. Was haben wir gelernt — 5 Bullet-Learnings
12. Danke & Fragen       — Abschlussfolie mit Tags
```

### D4: Reveal.js-Konfiguration

```js
Reveal.initialize({
  hash: true,
  slideNumber: 'c/t',
  transition: 'fade',   // ruhiger als 'slide' für akademische Präsentation
  controls: true,
  progress: true,
  center: true,
  width: 1280,
  height: 720,
  margin: 0.04,
})
```

### D5: CSS-Klassen-System

Eigenes kompaktes CSS innerhalb des `<style>`-Blocks (kein externes File, da standalone):
- `.team-card` — Mitgliederkarte mit Avatar, Name, Stunden, Balken
- `.tech-grid` / `.tech-card` — 3-spaltig für Tech-Stack
- `.flow` / `.flow-step` — horizontaler Prozessfluss
- `.stats-grid` / `.stat-card` / `.stat-card.light` — Zahlen-Grid
- `.router-box` — dunklere Box für Router-Tech Highlights
- `.time-bar-row` — Zeitaufzeichnungs-Zeile mit Balken und Beschriftung
- `.sprint-grid` / `.sprint-card` — 2-spaltig für Sprint-Review

## Risks / Trade-offs

- **Sprint 10 Clockify fehlt noch** → Platzhalter-Kommentar eingebaut; leicht nachrüstbar ohne Strukturänderung
- **Hardcoded Daten** → Kein automatisches Update aus Git/Clockify, aber für eine einmalige Abschlusspräsentation akzeptabel
- **CDN-Abhängigkeit** → Ohne Internetverbindung kein Reveal.js; Mitigation: Präsentation sollte online geöffnet werden oder Reveal.js kann lokal gecached werden (wird nicht umgesetzt, da außerhalb des Scopes)

## Open Questions

- Sprint 10 Clockify-Screenshot: Wird in ~1h ergänzt → Stunden per Kommentar nachrüstbar
- Gibt es eine Deadline/Datum für die Präsentation? → Keine Auswirkung auf die Implementierung
