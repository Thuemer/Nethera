# OpenWRT Installation Guide

**Ziel:** Schritt‑für‑Schritt‑Anleitung, wie du OpenWRT auf deinem Router installierst. Diese Anleitung ist für **Windows**, **macOS** und **Linux** geeignet und erklärt alles so einfach wie möglich.

---

## Wichtige Hinweise / Warnungen

1. **Risiko:** Firmware‑Flashen kann deinen Router unbrauchbar machen („bricken“). Lies zuerst die Geräte‑Seite (Table of Hardware) für dein Modell.
2. **Richtigen Image verwenden:** Lade **nur** Firmware von der offiziellen OpenWrt‑Seite oder von deiner Geräte‑Seite im OpenWrt Table of Hardware. Falsches Image = hohes Risiko.
3. **Strom niemals während des Flashens trennen.**
4. **Backup:** Sichere wichtige Informationen bevor du beginnst (z. B. WLAN‑Passwort, Provider‑Daten). Manche Router erlauben, das originale/stock Firmware‑Image herunterzuladen – speichere es.

---

## Was du brauchst (Vorbereitung)

* Einen Computer (Windows/macOS/Linux).
* Ein Ethernet‑Kabel (vermeide WLAN beim Flashen).
* Zugang zu deinem Router‑Admin (Hostname/IP, üblicherweise `192.168.1.1` oder `192.168.0.1`).
* Modellbezeichnung des Routers (z. B. `TP‑Link Archer C7 v5`).
* Zeit: 20–60 Minuten, je nach Methode.

---

## Offizielle Seiten (wichtig — schau hier zuerst)

* OpenWrt Quick Start / Installation: [https://openwrt.org/docs/guide-quick-start/start](https://openwrt.org/docs/guide-quick-start/start)
* OpenWrt Firmware Selector (zum Finden fertig gebauter Images): [https://firmware-selector.openwrt.org/](https://firmware-selector.openwrt.org/)
* OpenWrt Table of Hardware (ToH) — Prüfe, ob dein Modell unterstützt ist: [https://toh.openwrt.org/](https://toh.openwrt.org/) oder [https://openwrt.org/toh/start](https://openwrt.org/toh/start)
* OpenWrt Downloads: [https://openwrt.org/downloads](https://openwrt.org/downloads)

> **Tipp:** Öffne die ToH‑Seite, suche dein Modell und lies die Hinweise dort. Manche Geräte haben besondere Schritte!

---

## Übersicht der Flash‑Methoden (einfach → fortgeschritten)

1. **Web‑GUI (Webinterface) des Herstellers** – am einfachsten, wenn das Gerät eine "Firmware Upgrade"‑Funktion hat.
2. **TFTP oder spezieller Bootloader‑Modus** – wenn das Web‑GUI nicht funktioniert oder das Gerät vom Hersteller geschützt ist.
3. **SSH / sysupgrade (bei vorhandener OpenWrt‑Install)** – für spätere Upgrades.

In dieser Anleitung beschreibe ich alle drei mit klaren Schritten für Windows/macOS/Linux.

---

## Schritt A — Gerät prüfen & Image auswählen (sehr wichtig)

1. **Gerät suchen:** Gehe zur Table of Hardware (ToH): `https://toh.openwrt.org/` und gib die Modell‑Bezeichnung ein.
2. **Lese die Geräte‑Seite sorgfältig:** Dort steht unter anderem: unterstützte Versionen, benötigter Bootloader, spezielle Warnungen, und Links zu Downloads.
3. **Image auswählen:** Nutze die Offizielle Downloadseite oder den Firmware Selector: `https://firmware-selector.openwrt.org/`.

   * Wähle das richtige **Target** (z. B. `ath79`, `mediatek`, `ipq807x`) und die **Hardware‑Version** (v1, v2...).
   * Wenn du unsicher bist: nimm die stabile Version (stable), nicht die snapshots, außer du weißt, was du tust.
4. **Herunterladen:** Lade die Datei `-factory` (falls vom Hersteller‑Firmware) oder `-sysupgrade` (falls du bereits OpenWrt hast) entsprechend den Hinweise auf der Geräte‑Seite herunter.

> **Wichtig:** Die ToH‑Seite sagt dir meistens, welche Datei du für "Factory install" verwenden musst. Folge genau diesen Angaben.

---

## Schritt B — Vorbereiten: Backup & Netzwerk

1. Notiere deine derzeitigen Einstellungen (WLAN‑Name/Passwort, PPPoE‑Daten falls vorhanden).
2. Verbinde Computer per LAN‑Kabel mit einem **LAN‑Port** des Routers (nicht WAN‑Port), oft Port 1.
3. Stelle auf dem Computer eine statische IP ein, falls die Anleitung des Routers dies verlangt (z. B. `192.168.1.10`), oder lasse DHCP an, wenn du sicher bist, dass es funktioniert.

---

## Schritt C — Flashen per Webinterface (einfachste Methode)

**Voraussetzung:** Deine aktuelle (Hersteller) Firmware hat eine Update/Upgrade Funktion.

### Allgemeiner Ablauf (Windows / macOS / Linux — Browser nötig)

1. Öffne den Browser und gehe zur Router‑Adresse (z. B. `http://192.168.1.1`).
2. Melde dich am Router‑Interface an (Admin Nutzer / Passwort).
3. Finde den Menüpunkt **Firmware Update** oder **System → Firmware** (Bezeichnungen variieren vom Hersteller).
4. Wähle die heruntergeladene OpenWrt‑Image‑Datei aus (die Datei, die du in Schritt A geladen hast).
5. **Wichtig:** Lies die Hinweise: manche Webinterfaces verlangen eine `factory` Datei, andere eine `sysupgrade`.
6. Starte das Upgrade und warte. Trenne niemals die Stromzufuhr oder das Kabel.
7. Nach dem Flash: warte 2–5 Minuten, dann versuche `http://192.168.1.1` oder `http://192.168.1.1:80`.

**Wenn die Webinterface‑Methode fehlschlägt:** Fahre mit TFTP oder dem speziellen Verfahren auf der ToH‑Geräteseite fort.

---

## Schritt D — Flashen per TFTP (wenn Webinterface nicht möglich)

**Kurze Erklärung:** Manche Router erlauben ein einfaches Wiederherstellen per TFTP, wenn du beim Booten eine bestimmte Taste gedrückt hältst. Die genauen Schritte hängen vom Modell ab – schau die ToH‑Geräteseite an!

### Windows (Tftpd64/32)

1. Lade Tftpd64 herunter und installiere es (Suche nach "Tftpd64" – benutze nur vertrauenswürdige Quellen).
2. Setze in Tftpd das Arbeitsverzeichnis auf den Ordner mit dem heruntergeladenen OpenWrt‑Image.
3. Setze deine PC‑IP auf die in der Anleitung angegebene (z. B. `192.168.0.66`).
4. Stecke ein Ethernet‑Kabel in einen LAN‑Port und trenne die Stromversorgung des Routers.
5. Starte den Router in den Bootloader/TFTP‑Modus (meist Taste gedrückt halten beim Einschalten). Folge exakt der ToH‑Anleitung.
6. In Tftpd sollte der Router die Datei anfordern und der Transfer beginnt.
7. Nach Abschluss wartet das Gerät und bootet das neue Image.

### macOS / Linux (Terminal mit `tftp`)

1. Öffne Terminal.
2. Setze eine passende IP auf dein Ethernet‑Interface falls nötig (z. B. `sudo ifconfig en0 192.168.0.66 netmask 255.255.255.0` (macOS) oder `sudo ip addr add 192.168.0.66/24 dev eth0` auf Linux).
3. Starte TFTP und sende die Datei:

macOS / Linux Beispiel:

```bash
# Tftp senden (Beispiel, passe IP und Dateiname an)
# macOS tftp client
tftp 192.168.0.1
put <openwrt-image.bin>
quit
```

4. Folge dem Bootloader‑Vorgang wie in der ToH‑Seite beschrieben.

---

## Schritt E — Erste Anmeldung in OpenWrt

1. Nach dem erfolgreichen Flash: öffne im Browser `http://192.168.1.1`.
2. Du wirst auf eine Seite ohne Passwort geleitet – setze sofort ein **starkes Passwort**.
3. Optional: Netzwerkeinrichtung, SSID/Passwort ändern, Internetverbindung (DHCP/PPPoE) einstellen.
4. LuCI (die Weboberfläche) ist bei vielen Images bereits installiert. Falls nicht, kannst du es per SSH und `opkg` nachinstallieren (fortgeschritten):

```bash
# Beispiel nach Login per SSH (auf OpenWrt)
# melde dich an:
ssh root@192.168.1.1
# update package lists
opkg update
# install luci
opkg install luci
# starte uhttpd (sofern nötig)
/etc/init.d/uhttpd start
```

---

## Schritt F — Wiederherstellung zur Hersteller‑Firmware

Wenn etwas schiefgeht oder du zurück willst, suche auf der ToH‑Geräteseite nach "How to restore stock firmware" oder "Back to original firmware". Manche Hersteller bieten ein Recovery‑Image oder einen TFTP‑Weg zurück.

---

## Troubleshooting (häufige Probleme)

* **Kein Zugriff nach Flash:** Warte 5–10 Minuten, versuche dann `192.168.1.1` oder setze eine statische IP in deinem PC (z. B. `192.168.1.2`) und ping `192.168.1.1`.
* **Webinterface zeigt alte Firmware an / fehlt:** Manche Images benötigen zusätzlich LuCI. Siehe Schritt E.
* **Router bootet nicht mehr:** Suche auf ToH nach Recovery‑Anweisungen (TFTP, serielle Konsole, JTAG) und entscheide, ob du professionelle Hilfe brauchst.

---

## Nützliche Links (nochmals)

* OpenWrt Quick Start: [https://openwrt.org/docs/guide-quick-start/start](https://openwrt.org/docs/guide-quick-start/start)
* Firmware Selector: [https://firmware-selector.openwrt.org/](https://firmware-selector.openwrt.org/)
* Table of Hardware (ToH): [https://toh.openwrt.org/](https://toh.openwrt.org/)  und [https://openwrt.org/toh/start](https://openwrt.org/toh/start)
* TFTP flashing guide (OpenWrt): [https://openwrt.org/docs/guide-user/installation/generic.flashing.tftp](https://openwrt.org/docs/guide-user/installation/generic.flashing.tftp)
* Downloads: [https://openwrt.org/downloads](https://openwrt.org/downloads)

---

## FAQ (kurz)

**Q: Kann ich das per WLAN machen?**
A: Niemals während des eigentlichen Flash‑Vorgangs. Verwende immer ein LAN‑Kabel.

**Q: Brauche ich Linux?**
A: Nein — Webinterface/Windows/macOS funktionieren meist. TFTP ist auf allen Systemen möglich.

**Q: Wie lange dauert das?**
A: Meist 5–20 Minuten. Wenn zusätzliche Paketinstallation nötig ist, kann es länger dauern.

---

## Letzte Tipps (einfach & sicher)

1. **Lies die ToH‑Seite deines Modells komplett.**
2. **Lade Firmware nur von openwrt.org oder dem Link auf der ToH‑Seite.**
3. Arbeite mit LAN‑Kabel und einer stabilen Stromquelle.

---

### Ende

Wenn du möchtest, erstelle ich dir eine angepasste Schritt‑für‑Schritt‑Anleitung für **genau dein** Router‑Modell (ggf. mit Kommandozeilen‑Befehlen). Dann nenn mir bitte Modellbezeichnung + Hardware‑Version (z. B. "Archer C7 v5").
