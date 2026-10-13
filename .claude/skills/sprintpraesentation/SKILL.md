---
name: sprintpraesentation
description: Neue Sprint-Review-Section in der Reveal.js-Präsentation (Documentation/Sprintpräsentationen/index.html) für einen Sprint-Zeitraum erstellen. Verwenden, wenn der User einen Sprint-Zeitraum nennt und eine Sprintpräsentation / Sprint Review / Sprint-Section will.
---

# Sprintpräsentation erstellen

Der User nennt nur den Sprint-Zeitraum (z. B. `14.10.2026 – 28.10.2026`). Alles andere ergibt sich aus dieser Anleitung.
Datei: `Documentation/Sprintpräsentationen/index.html`. Sprache der Folien: Deutsch.

## 0. Eingaben klären

- **Zeitraum:** vom User. Offensichtliche Tippfehler beim Jahr (z. B. 2025 statt 2026) anhand der Git-Historie korrigieren und in der Antwort erwähnen.
- **Gesamtstunden:** werden vom User genannt (Format `88:58h`). Fehlen sie, kurz nachfragen.
- **Screenshot der Zeitaufzeichnung:** liegt in einem neuen Ordner unter `Documentation/Sprintpräsentationen/` (bisher `sprint5_1`, nächster vermutlich `sprint5_2` usw.). Den neuesten Ordner mit `zeitaufzeichnung.png` nehmen, der noch in keiner Section verwendet wird. Gibt es keinen, nachfragen.
- **Sprintnummer:** letzte `Sprint Review #N` in `index.html` + 1.

## 1. Material sammeln

- Git-Historie im Zeitraum, alle Branches: `git log --all --since=<start-1d> --until=<ende+1d> --date=short --pretty='%h %ad %an %s'`, dann `git show --stat` für die wichtigen Commits (Commit-Bodies lesen, dort stehen oft Issue-Nummern).
- Issues im Sprint: `gh issue list --state all --limit 100 --json number,title,state,labels,assignees,createdAt,closedAt`. Relevant sind Issues, die zu Sprintbeginn angelegt wurden, die im Zeitraum geschlossen wurden, und Issues, auf die Commits im Zeitraum verweisen (`#16` usw.). Label-Farben: `gh label list --json name,color`.
- OpenSpec-Changes in `openspec/changes/` (proposal.md, tasks.md) für Kontext.
- **Achtung:** Nicht alles ist im Git. Branches können ungepusht sein, Router-Arbeit passiert direkt am Gerät. Nie aus „kein Code im Repo“ oder „Issue offen“ schließen, dass etwas nicht erledigt oder für den nächsten Sprint geplant ist. Wenn der Stand eines Themas unklar ist, den User fragen, statt „Nächster Sprint“ / „Geplant“ zu erfinden.

## 2. Aufbau der Section

Neue Section ganz ans Ende der Slides (nach der letzten bestehenden Section), eingerahmt wie die alten:

```html
<!--=====Start Review Section====-->
<section>
  ... vertikale Sub-Slides ...
</section>
<!--=====End Review Section====-->
```

Reihenfolge der Sub-Slides (Themen ohne Inhalt in diesem Sprint weglassen, neue Themen sinnvoll einordnen):

1. **Titel/Zeit:** `Sprint Review #N`, darunter Zeitraum `TT.MM.JJJJ – TT.MM.JJJJ`. Stat-Kacheln: Gesamtstunden (groß, Klasse `big`) und Sprintlänge in Tagen. **Keine Commit-Anzahl.** Darunter der Screenshot der Zeitaufzeichnung (`class="s10-shot"`).
2. **Verwendete Userstories/Issues:** genau diese Überschrift (es sind nicht nur User Stories).
3. **Organisatorisch**
4. **Website**
5. **Frontend**
6. **Backend**
7. **Router**
8. **LeoCloud** (bzw. Docker & LeoCloud / Deployment)

## 3. Issues-Folie (HTML statt Screenshot)

Issues als GitHub-Project-Board in HTML nachbauen, **kein Screenshot**. Logisch gruppiert in Spalten (z. B. Router, Backend & Cloud, Website, Organisation), max. 4 Spalten, Spaltenkopf mit farbigem Punkt, Name und Anzahl. Karten klein halten, die Folie darf nicht erschlagend wirken.

Vorhandene Klassen aus Sprint #10 wiederverwenden (CSS steht schon im `<style>`):
`gh-board`, `gh-col`, `gh-col-head`, `gh-dot`, `gh-count`, `gh-card`, `gh-meta`, `gh-avatars`, `gh-avatar`, `gh-title`, `gh-label`.
Label-Farbklassen: `lb-router`, `lb-backend`, `lb-design`, `lb-hw`, `lb-story`. Für neue Labels eine neue Klasse nach demselben Muster (`--c: r, g, b; --t: textfarbe`) ergänzen, Textfarbe auf dunklem Hintergrund gut lesbar wählen.
Avatare als Initialen: `av-th` (Thuemer), `av-mk` (M4ritz), `av-mf` (ManuelFreihaut), `av-db` (DenizBernecker), `av-nh` (nhofer07).
Das Open-Icon ist als `<symbol id="gh-open">` bereits im Dokument definiert. Nur per `<svg><use href="#gh-open"></use></svg>` verwenden, nicht neu definieren.

Karte:

```html
<div class="gh-card">
  <div class="gh-meta"><svg><use href="#gh-open"></use></svg>Nethera #96
    <span class="gh-avatars"><span class="gh-avatar av-th">TH</span><span class="gh-avatar av-mk">MK</span></span>
  </div>
  <div class="gh-title">MQTT am Router einrichten</div>
  <span class="gh-label lb-router">Router</span>
</div>
```

Titel der Issues wörtlich von GitHub übernehmen.

## 4. Themenfolien: Inhalt

So knapp wie die alten Sprint-Sections (2–4 Stichworte pro Thema):

- Pro Folie **2–4 Boxen**. Jede Box: **Stichwort-Titel**, optional **eine kurze Zusatzzeile** (wenige Wörter, kein Satz). Keine Erklärtexte.
- Issue-Nummern als Chip am Titel: `<span class="s10-ref">#95</span>`.
- **Triviales weglassen:** keine Punkte wie „X spezifiziert“, „Bugfixes“, „Bugfixes nach Review“, „OpenSpec verwendet“, „Tests geschrieben“, Refactorings, Aufräumen. Nur Ergebnisse, die man beim Präsentieren zeigen oder erklären will.
- Noch Offenes nur aufnehmen, wenn der User es bestätigt hat. Dann als `s10-item planned` (gestrichelt), z. B. „Geplant: …“ oder „Offen: …“.
- Einzelne Box oder ungerade letzte Box mit `wide` über die volle Breite, damit nichts schief aussieht.
- Lange Wörter, URLs oder Hostnamen nicht umbrechen lassen (kürzen oder `white-space:nowrap`).

Markup:

```html
<section>
  <div class="s10">
    <h3 class="s10-head" style="color:var(--blue)">Backend</h3>
    <div class="s10-grid">
      <div class="s10-item">
        <h4>MQTT-Telemetrie <span class="s10-ref">#95</span></h4>
        <p>statt SSH-Abfrage</p>
      </div>
      <div class="s10-item wide">
        <h4>API abgesichert</h4>
        <p>Keycloak-Login Pflicht</p>
      </div>
    </div>
  </div>
</section>
```

## 5. Design

- Bestehendes Design aus Sprint #10 nutzen: `s10`, `s10-head`, `s10-sub`, `s10-stats`, `s10-stat`, `s10-shot`, `s10-grid`, `s10-item` (+ `wide`, `planned`), `s10-ref`. Moderne Boxen: Verlauf, dünner Mint-Rahmen, Radius rundum, leuchtender Punkt vor dem Titel.
- **Nicht** den alten Stil mit dickem farbigem Balken oben/links plus Radius verwenden.
- Folienfläche ausnutzen: groß genug, dass man es beim Präsentieren gut lesen kann, aber nicht aufgeblasen.
- Alte Sections und das bestehende CSS nicht verändern. Neues CSS nur ergänzen, wenn wirklich nötig.

## 6. Prüfen

Jede neue Folie bei 1280×720 mit Headless Chrome rendern und die Screenshots ansehen (Index der neuen Section = Anzahl der Top-Level-Sections davor, z. B. `#/16/0` … `#/16/7`):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,720 --virtual-time-budget=4000 --screenshot="<scratchpad>/s0.png" \
  "file:///<pfad>/Documentation/Sprintpr%C3%A4sentationen/index.html#/<section>/<slide>"
```

Kontrollieren: nichts läuft unten raus, keine unschönen Umbrüche, keine halb leeren schiefen Layouts, Bild zentriert.

## 7. Abschluss

- Nicht committen, außer der User verlangt es.
- Kurz berichten: Folienübersicht (Tabelle Folie → Stichworte), getroffene Annahmen (Jahr, Ordner, Sprintnummer) und Themen mit unklarem Stand, zu denen der User etwas sagen soll.
