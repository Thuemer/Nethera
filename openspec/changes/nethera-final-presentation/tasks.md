## 1. Datei anlegen & Grundstruktur

- [x] 1.1 Datei `Documentation/revealjs/nethera-abschlusspraesentation.html` erstellen mit Reveal.js 5.2.1 CDN-Links (reset.css, reveal.css, white.css als Basis)
- [x] 1.2 Dark-Theme CSS-Block schreiben: `#121212` Hintergrund, `#2FB09A` / `#63E5C5` Teal-Farben, `#e6e6e6` Text, Avenir Next / Segoe UI Schrift
- [x] 1.3 CSS-Klassen anlegen: `.team-card`, `.tech-grid`, `.tech-card`, `.flow`, `.flow-step`, `.stats-grid`, `.stat-card`, `.sprint-grid`, `.sprint-card`, `.router-box`, `.time-bar-row`, `.tag`
- [x] 1.4 Reveal.js `<script>` initialisieren mit: `hash:true`, `slideNumber:'c/t'`, `transition:'fade'`, `width:1280`, `height:720`, `margin:0.04`

## 2. Folien 1–4: Intro

- [x] 2.1 Folie 1 (Titelfolie): Nethera-Logo (`../nethera_logo.png`), Titel "Nethera", Untertitel "4CHITM · HTL Leonding · Schuljahr 2025/26", Zeitraum "Oktober 2025 – Juni 2026", Team-Namensliste
- [x] 2.2 Folie 2 (Das Team): 5 `.team-card`-Karten für Tobias Huemer (~146h), Deniz Bernecker (~166h), Nico Hofer (~160h), Manuel Freihaut (~150h), Moritz Kapeller (~153h) — mit Initialen-Avatar, Stundenzahl, proportionalem Balken (d.bernecker = 100%)
- [x] 2.3 Folie 3 (Was ist Nethera?): Kurzbeschreibung + `.flow`-Elemente (Browser → Login → Backend → DB → Router) + Feature-Tags (Zeitlimits, Gerätegruppen, Blocklisten, DNS-Filter, Werbedomänen, OpenWRT)
- [x] 2.4 Folie 4 (Wie es funktioniert): `howitworks.jpeg` einbetten mit `max-height:55vh`, kurze Bildunterschrift

## 3. Folien 5–6: Technik

- [x] 3.1 Folie 5 (Tech-Stack): 3×2 `.tech-grid` mit Karten: Frontend (HTML/CSS/JS, Vanilla, Iframe-SPA), Backend (Quarkus 3, Java 21, JAX-RS, Jackson), Datenbank (PostgreSQL 15, JPA/Hibernate, Docker), Auth (Keycloak 26, OIDC, JWT), Router (OpenWRT, dnsmasq, OpenVPN), Tools (SSH/sshj, Git, OpenSpec)
- [x] 3.2 Folie 6 (Router-Kommunikation): Flow-Diagramm `Quarkus @Scheduled → sshj (SSH) → OpenWRT` mit drei Datenquellen-Boxen (`/tmp/dhcp.leases`, `/proc/net/arp`, `iw station dump`) und Ergebnis-Box (→ PostgreSQL). Darunter erklärende Tags: `sshj 0.38`, `dnsmasq`, `OpenVPN`, `BusyBox/sh`, `Key-Auth`

## 4. Folien 7–8: Projektverlauf & Sprint 10

- [x] 4.1 Folie 7 (Projektverlauf): 9 Zeitzeilen-Zeilen mit Monatsname, Commit-Balken (proportional zu max=34) und Sprint-Beschriftung: Okt 9/Projektstart, Nov 34/Frontend+Backend-Basis, Dez 11/Zwischenphase, Jan 25/Keycloak+DB, Feb 16/Geräteseiten, Mär 30/Redesigns, Apr 14/Neue Seiten, Mai 34/Router-Sync+Scheduler, Jun 8/Abschluss
- [x] 4.2 Folie 8 (Sprint 10 Review): Zweispaltiges `.sprint-grid` — Links (Frontend): Dashboard-Redesign, Zeitlimits-UI, Geräte/Gruppen-Verwaltung, Blocklists, Werbedomänen-Blockierung, Device-Presets, neue Status-Seite, Traffic-Statistiken, Konfigurationsseite, Mein Account; Rechts (Backend): Neue DB-Tabellen, DB-first Ansatz (kein Router bei jedem Request), Quarkus `@Scheduled` Sync-Service

## 5. Folien 9–10: Zahlen & Zeiten

- [x] 5.1 Folie 9 (Zahlen & Fakten): `.stats-grid` 4×3 mit Kacheln: 181 Commits, ~772h Stunden, 9 Sprints, 9 Monate, ~96 Werktage, 5 Teammitglieder, 9 App-Seiten, Sprint 8 = längster Sprint (180h), Okt 2025 – Jun 2026, OpenWRT Router, PostgreSQL DB, Keycloak Auth
- [x] 5.2 Folie 10 (Zeitaufzeichnung): Horizontale Balken pro Person mit Name + Balken + Stundenangabe; Gesamtanzeige "~772h gesamt (Sprints 1–9)" prominent; `<!-- TODO: Sprint 10 Stunden nach Screenshot hier ergänzen -->` Kommentar einbauen

## 6. Folien 11–12: Abschluss

- [x] 6.1 Folie 11 (Was haben wir gelernt?): 5 nummerierte Einträge: (1) Agiles Arbeiten in Sprints – Scope-Creep ist real, (2) Router-Integration ist komplex – SSH/dnsmasq/OpenWRT erfordert Geduld, (3) DB-first statt Router-first verbessert Performance und Stabilität, (4) Git-Disziplin (Conventional Commits, Feature-Branches) ermöglicht Teamarbeit, (5) Teamkoordination über Semester funktioniert mit klaren Strukturen
- [x] 6.2 Folie 12 (Danke & Fragen): "Danke fürs Zuhören!" als H1, "Fragen?" als H2, horizontale Trennlinie, Team-Namen-Zeile, Projekt-Tags (181 Commits, ~772h, 9 Sprints, 9 Seiten, OpenWRT)

## 7. Qualitätssicherung

- [x] 7.1 Präsentation im Browser öffnen und alle 12 Folien durchnavigieren — keine Layout-Brüche, kein überlaufender Text
- [x] 7.2 Prüfen: `howitworks.jpeg` wird korrekt geladen (relativer Pfad stimmt)
- [x] 7.3 Prüfen: Nethera-Logo wird auf Titelfolie angezeigt
- [x] 7.4 Prüfen: TODO-Kommentar für Sprint 10 ist im Quellcode vorhanden
- [x] 7.5 Prüfen: Alle 5 Teammitglieder erscheinen in Team-Folie und Zeitaufzeichnungs-Folie
