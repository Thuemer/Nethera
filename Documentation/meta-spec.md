## 1. Projekttitel
**Nethera** – Intuitive Cloud-Management-Plattform für OpenWRT-Heimnetzwerke.

## 2. Kurzbeschreibung
Nethera ist eine Softwarelösung, die die Konfiguration von Heimnetzwerk-Routern für technisch nicht affine Nutzer radikal vereinfacht. Das System besteht aus einer modernen Web-Applikation und einer mobilen App, die über ein Cloud-Backend (Quarkus) sicher mit einem OpenWRT-basierten Router kommunizieren. Ziel ist es, komplexe Netzwerkfunktionen wie Werbeblockierung, Inhaltsfilter und Bandbreiten-Priorisierung über eine intuitive Oberfläche zugänglich zu machen. Durch die Abstraktion technischer Fachbegriffe ermöglicht Nethera eine einfache Steuerung des Heimnetzes von überall aus. Am Ende des Projekts steht ein funktionaler Prototyp, der die gesamte Kette vom User-Interface bis zur Hardware-Umsetzung abbildet.

## 3. Ausgangssituation / Ist-Zustand
Derzeitige Konfigurationsoberflächen von Routern (insbesondere mächtige Open-Source-Systeme wie OpenWRT) sind primär für IT-Fachpersonal gestaltet. Sie sind geprägt von komplexen Menüs, technischem Jargon und einer unübersichtlichen UI. Viele Privatnutzer wissen zwar um die Vorteile von Funktionen wie Kindersicherung oder Werbeblockern, scheuen aber die komplizierte Einrichtung. Bestehende Lösungen großer Provider bieten zudem oft nur eingeschränkte Funktionen oder komplizierte Remote-Zugriffe, wodurch das volle Potenzial der vorhandenen Hardware in Haushalten meist ungenutzt bleibt.

## 4. Problemstellung
Das Hauptproblem ist die hohe technische Einstiegshürde und die damit verbundene Angst der Nutzer, durch Fehlkonfigurationen ihren Internetzugang zu unterbrechen. Es mangelt an einer zentralen, einfach verständlichen Lösung, um spezifische Netzwerkregeln schnell auf Gerätegruppen anzuwenden. Ohne Nethera bleiben private Netzwerke oft weniger sicher und effizient, da Nutzer den zeitlichen Aufwand und die Komplexität der manuellen Konfiguration scheuen. Es gibt keine "Plug-and-Play"-Erfahrung für fortgeschrittene Netzwerk-Features im Heimgebrauch.

## 5. Projektziel / Soll-Zustand
Das Ziel ist die Schaffung einer Management-Plattform, die komplexe Netzwerkprozesse so abstrahiert, dass sie ohne technisches Wissen bedienbar sind. Nutzer sollen zentrale Features (wie Inhaltsfilter oder Priorisierung) mit weniger als fünf Klicks aktivieren können. Die Benutzeroberfläche soll durch einfache Sprache, visuelle Icons und vordefinierte Presets Sicherheit vermitteln. Eine erfolgreiche Umsetzung ermöglicht es auch Laien, ihr Netzwerk individuell zu optimieren und sicher von unterwegs zu verwalten, ohne jemals mit technischen Protokollen oder der Kommandozeile in Berührung zu kommen.

## 6. Zielgruppe / Benutzergruppen
Die Hauptzielgruppe umfasst private Haushalte, insbesondere:
* **Eltern:** Die einen einfachen Weg suchen, um jugendgefährdende Inhalte für ihre Kinder zu filtern.
* **Technisch wenig affine Personen:** Die Funktionen wie Werbeblocker nutzen möchten, ohne sich in die Materie einlesen zu müssen.
* **Beschäftigte Nutzer:** Die eine schnelle, zuverlässige Lösung zur Netzwerksteuerung per Smartphone-App bevorzugen.
* **Technisch Interessierte:** Die Wert auf ein schönes Design und Zeitersparnis bei der Verwaltung legen.

## 7. Nutzungsszenarien
* **Szenario 1 (Kindersicherung):** Ein Elternteil möchte den Internetzugang für die Spielkonsole des Kindes einschränken. Er öffnet die Nethera-App, wählt die Gruppe „Kinder“ und aktiviert das Preset „FSK18-Filter“. Das System blockiert sofort alle entsprechenden Inhalte.
* **Szenario 2 (Werbeblocker):** Ein Nutzer möchte Werbung auf allen Smart-TVs im Haus blockieren. Er navigiert zum Menüpunkt „Sicherheit“ und aktiviert mit einem Schieberegler den netzwerkweiten Adblocker.
* **Szenario 3 (Home-Office Priorisierung):** Während eines Meetings gibt der Nutzer seinem Laptop per App „Priorität“. Der Router sorgt automatisch dafür, dass Video-Streams stabil bleiben, auch wenn im Hintergrund andere Geräte Downloads durchführen.

## 8. Funktionen des Systems
* Das System soll eine sichere Cloud-Anbindung zur Fernsteuerung des Routers bereitstellen.
* Das System soll die Erstellung und Verwaltung von Gerätegruppen ermöglichen.
* Das System soll einen One-Click Adblocker auf Basis vorkonfigurierter Listen bieten.
* Das System soll Inhaltsfilterung (DNS-basiert) für Kategorien wie Gaming, Social Media oder Erotik erlauben.
* Das System soll eine intuitive Bandbreiten-Priorisierung (QoS) für einzelne Geräte ermöglichen.
* Das System soll eine konsistente Benutzeroberfläche für Web und mobile Endgeräte bieten.
* Das System soll Konfigurationsänderungen persistent auf dem Router speichern.

## 9. Priorisierung der Anforderungen
### MUSS
* Kommunikation zwischen Backend und OpenWRT-Router via SSH.
* Web-Interface zur Aktivierung von Adblock und Inhaltsfiltern.
* Geräteerkennung und Gruppenzuweisung.
* Sicheres Benutzer-Login im Cloud-Backend.
### SOLL
* Native Mobile App (oder Progressive Web App).
* Vordefinierte Presets (z. B. "Gaming-Modus", "Kindersicherung").
* Echtzeit-Statusanzeige der verbundenen Geräte.
### KANN
* Statistiken über geblockte Tracking-Anfragen.
* QR-Code-Generierung für Gast-WLAN-Zugänge.

## 10. Nicht-Ziele / Abgrenzung
* Kein Ersatz für professionelle Enterprise-Netzwerk-Tools.
* Keine Entwicklung eigener Router-Hardware.
* Keine manuelle Konfiguration von Low-Level-Parametern (z.B. IP-Routing-Tabellen).
* Keine Inhaltsüberwachung (DPI) einzelner Datenpakete aus Datenschutzgründen.

## 11. Inhalte / Daten
* **Nutzerdaten:** E-Mail, verschlüsseltes Passwort, Account-Status.
* **Netzwerkdaten:** MAC-Adressen der Endgeräte, Gerätenamen, Gruppen-Zugehörigkeiten.
* **Konfigurationsdaten:** Status der Filterlisten, Priorisierungs-Flags.
* **Quellen:** Endgerätedaten kommen vom Router; Filterlisten werden von externen Repositories (z.B. OISD) bezogen.

## 12. Regeln / Bedingungen / Einschränkungen
* Der Router muss ein kompatibles OpenWRT-Image verwenden.
* SSH-Zugriff für das Backend muss konfiguriert sein.
* Zeitliche Begrenzung durch den Rahmen der Diplomarbeit/Schuljahr.
* Datenschutz-Konformität (DSGVO) bei der Speicherung von Benutzerdaten in der Cloud.

## 13. Anforderungen an Qualität und Benutzerfreundlichkeit
* **Einfachheit:** Keine Funktion darf tiefer als 3-4 Navigationsebenen liegen.
* **Design:** Modernes "Dark Mode" fähiges Interface mit klarer Ikonografie.
* **Geschwindigkeit:** Änderungen am UI sollten innerhalb von wenigen Sekunden auf der Hardware aktiv sein.
* **Verständlichkeit:** Verzicht auf Begriffe wie "QoS", "CIDR" oder "DNS-Lease" in der Standardansicht.

## 14. Sonderfälle / Fehlerfälle
* **Router Offline:** Die App zeigt einen Warnhinweis, wenn der Router nicht mit der Cloud verbunden ist.
* **Fehlerhafte Filterliste:** Bei Problemen mit einer Liste fällt das System auf einen sicheren Standardwert zurück.
* **Verbindungsabbruch während Konfiguration:** Transaktionssicherheit sicherstellen, damit der Router nicht in einem instabilen Zustand bleibt.

## 15. Erfolgskriterien
* Ein fachfremder Testnutzer kann einen Filter in unter 60 Sekunden aktivieren.
* Die SSH-Kommunikation zwischen Quarkus-Backend und Router funktioniert stabil.
* Die Einstellungen bleiben nach einem Stromausfall/Reboot des Routers erhalten.
* Das System wird in Usability-Tests als "intuitiv" und "hilfreich" bewertet.

## 16. Offene Fragen / Unsicherheiten
* **Kommunikationsweg:** Entscheidung zwischen dauerhaftem SSH-Tunnel oder On-Demand Verbindungen (muss nachbearbeitet werden).
* **Echtzeit-Feedback:** Wie schnell meldet der Router den Erfolg einer Änderung an die App zurück?
* **Offline-Modus:** Ist eine Konfiguration im lokalen WLAN ohne Internetverbindung im ersten Prototyp möglich? (muss nachbearbeitet werden).

---
