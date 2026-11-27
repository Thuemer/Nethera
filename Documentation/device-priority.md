# Gerätepriorität (#24): Routerinstallation und späterer Cloud-Rollout

Stand: 27. November 2026. Die neue Funktion entspricht **Schutz → Priorität → Normal / Bevorzugt**.

## Was liegt wo?

- **GitHub:** Nach Commit und Push liegen Quellcode, Tests, Migration und Installationsdateien im Repository. Git-Push installiert nichts auf einem Router und startet keinen Cloud-Rollout.
- **Cudy:** `/usr/bin/nethera-priority` läuft als separater procd-Dienst. `/usr/bin/nethera-agent` und sein Dienst bleiben unverändert. Die neue Komponente nutzt die vorhandene `/etc/config/nethera` lesend, mit eigener MQTT-Client-ID `nethera-priority-<id>`.
- **Backend:** Speichert Gerätewünsche separat von DNS-/Vorlagenzuweisungen. Neue Tabelle `device_priority`; eigene Version/Rückmeldung in `priority_control_state`.
- **Frontend:** Bei einem Live-Router schreiben AdBlocker und Website-/Geräte-/Gruppensperren weiterhin live wie im bisherigen Cloud-Release. Die Gerätepriorität verwendet bei `capabilities.devicePriority: true` ihren getrennten Schreibweg. Demo/Offline bleibt ein lokaler Entwurf.

## Nachricht vom Frontend bis zum Router

1. `PUT /api/router-control/priority/devices/{deviceId}` mit `{"mode":"high"}` oder `{"mode":"normal"}`. Im normalen Quellstand wird das Gerät gegen den Router des Kontos geprüft. Der kompatible Cloud-Build erhält stattdessen die bisherige authentifizierte gemeinsame Nutzung und prüft gegen `nethera.router.id`; keine frei wählbare Router-ID.
2. Nach erfolgreichem Datenbank-Commit veröffentlicht das Backend den vollständigen Wunsch auf `nethera/<id>/config/priority` mit QoS 1 und retained:

   ```json
   {"v":1,"version":1795780000000,"devices":{"02:00:00:00:00:01":"high"}}
   ```

3. Der Router validiert und speichert den Wunsch in `/etc/nethera-priority.json`. Er gleicht ihn alle 30 Sekunden sowie nach MQTT-Verbindungsaufbau ab. Bei Neustart wird der gespeicherte Wunsch auch ohne Internet versucht; nicht verfügbare Interfaces werden später erneut geprüft.
4. Die Antwort kommt auf `nethera/<id>/telemetry/priority`. `applied` bestätigt nachgelesene Regeln und Warteschlangen, nicht garantierte ISP-Bandbreite.
5. `GET /api/router-control/status` liefert pro Geräte-ID Mode und Bestätigung. Nur übereinstimmende Version, Inhalt, Online-Verbindung und eine höchstens 90 Sekunden alte Routerantwort gelten als bestätigt. „Status prüfen“ aktualisiert die Anzeige.

Der Router kann beim Cloud-Rollout ausgeschaltet oder an einem anderen Ort sein. Er holt den letzten retained Wunsch nach, sobald er Internet und MQTT-Zugang hat. Für einen echten End-to-End-Test muss er online sein.

## Umsetzung und Grenzen

- Eigene nftables-Tabelle `inet nethera_priority`; keine Änderung an `fw4`, DSCP, Conntrack-Markierungen, UCI-Netzwerk, WLAN, DNS oder Werbeschutz.
- Upload anhand der Geräte-MAC, Download anhand aktueller IPv4-/IPv6-Nachbartabellen. Wechselnde Adressen werden spätestens beim nächsten 30-Sekunden-Abgleich aktualisiert. Ein noch nicht bekanntes Gerät wird nicht vollständig bestätigt.
- WAN über logisches Interface `wan`, LAN über das geroutete Bridge-Interface von `lan`. Änderungen an diesen Netzen werden erkannt; zusätzliche benannte Gäste-/VPN-/Multi-WAN-Netze sind nicht abgedeckt.
- CAKE mit Geräte-Fairness: Upload `nat dual-srchost`, Download `nonat dual-dsthost ingress`, jeweils `diffserv3`, `split-gso` und RTT-Profil 100 ms. Normale weitergeleitete Pakete werden explizit dem Bulk-Tin, bevorzugte dem Best-Effort-Tin zugeordnet. Normale Geräte können weiterhin senden und freie Kapazität nutzen; es gibt keine feste 2:1-Zusage.
- Keine fest eingetragene Tarifgeschwindigkeit und keine automatische Ermittlung der ISP-Kapazität. Wenn der Engpass außerhalb des Routers liegt, sind weder bessere Internetlatenz noch eine feste Bandbreitenverteilung garantiert. Ein Lasttest im späteren Zielnetz bleibt erforderlich.
- Fremde Root-Warteschlangen oder aktiviertes Flow-Offloading werden nicht umgestellt; Aktivierung meldet dann einen Fehler. Die neue Root-Warteschlange verwendet Handle `7d00:`; frühere eigene DRR-/HTB-Warteschlangen werden beim Wechsel gezielt entfernt.
- Alle Geräte auf Normal entfernt nur die eigenen Warteschlangen und die eigene Tabelle. Stoppen des neuen Diensts entfernt sie ebenfalls. Bei einem fehlgeschlagenen Abgleich zeigt die API keine erfolgreiche Übernahme an; keine Änderung fremder Einstellungen als Fallback.
- Abhängigkeiten: `tc-full`, `kmod-sched-core`, `kmod-sched-cake` und ihre Bibliotheken; kein Firmware-/Paket-Upgrade.

## Übergabe an den Kollegen mit LeoCloud-Zugriff

**Der Router muss dafür nicht beim Kollegen stehen.** Voraussetzung: Diese Änderungen wurden committet und gepusht.

1. Änderungen pullen und [AGENTS.md](../AGENTS.md) sowie `https://cloud.htl-leonding.ac.at/llms.txt` befolgen. Vor jedem Rollout die dort verlangten Skills lesen. Bestehende Images/Deployment-Konfiguration und Datenbank sichern.
2. Nacheinander `Backend/Nethera/migrations/20261127_device_priority.sql` und `20261127_priority_bandwidth.sql` aus dem kompatiblen Release auf die bestehende Anwendungsdatenbank anwenden. Die Migrationen erweitern nur die bestehenden Datenstrukturen. Keine Datenbank zurücksetzen, kein `drop-and-create`, keine PVCs löschen.
3. Den gemeinsamen Release ausschließlich mit `deploy/leocloud/prepare-time-release.mjs` aus dem integrierten Commit erzeugen (siehe neue Anleitung in `deploy/leocloud/README.md`). Backend und Frontend aus dem erzeugten Ordner bauen und nach dem bestehenden Verfahren ausrollen. LeoCloud benötigt `linux/amd64`-Images. Keine Keycloak-, Broker-, Router- oder Zugangsdaten ersetzen.
4. Die vorhandene MQTT-ACL muss dem Backend Schreiben auf `nethera/+/config/#` und dem jeweiligen Router Lesen auf `nethera/<id>/config/#` sowie Schreiben auf `nethera/<id>/telemetry/#` erlauben. Die Repository-ACL erlaubt das bereits. Die aktive Cloud-ACL vor Änderung prüfen; keine neuen Rechte vergeben, wenn die Regeln vorhanden sind.
5. Mit dem Konto anmelden, das den Cudy besitzt. In Schutz → Priorität ein bekanntes Gerät wählen, Bevorzugt speichern, danach Status prüfen. Anschließend Normal speichern und Entfernung bestätigen. Nicht bloß den HTTP-Erfolg als Hardware-Nachweis werten.
6. Bei Rollback zuerst neue Prioritäten auf Normal setzen bzw. den Prioritätsdienst stoppen; alte Backend-/Frontend-Images wiederherstellen. Die zwei neuen Tabellen dürfen bestehen bleiben. Ein Image-Rollback allein nimmt bereits installierte Routerregeln nicht zurück.

Am 27. November wurde hier **kein Cloud-Rollout** durchgeführt: kein Kubernetes-Kontext auf diesem Mac. Das gehostete Frontend bleibt bis zum Rollout unverändert.

## Installation auf weiteren Routern / Rückbau

Installation: `scripts/router-priority-deploy.sh root@<router-ip>` (Go >= 1.27.2, bestehende Nethera-MQTT-Konfiguration und SSH-Zugang). Das Skript ersetzt ausschließlich die neue Prioritätskomponente.

Rückbau im Router-Terminal:

```sh
/etc/init.d/nethera-priority stop
/etc/init.d/nethera-priority disable
/usr/bin/nethera-priority --priority-remove
rm /usr/bin/nethera-priority /etc/init.d/nethera-priority /lib/upgrade/keep.d/nethera-priority
# Nur falls auch gespeicherte Prioritätswünsche verworfen werden sollen:
rm -f /etc/nethera-priority.json
```

Andere Dienste und Pakete bleiben erhalten. Die gesicherte Ausgangskonfiguration liegt auf dem Test-Cudy unter `/root/nethera-priority-before/` (privat, nicht committen). Der neue Dienst erfordert keinen Neustart des bisherigen Agenten oder Routers.

## Prüfung am Testgerät

Siehe [Prüfprotokoll](../openspec/changes/device-priority-control/verification.md): echte Paketzuordnung in beiden Richtungen, Normal-Rücknahme, Dienststart mit gespeichertem Zustand, Stop-Cleanup und unveränderte Prüfsummen der bestehenden Konfiguration. Die ursprünglichen temporären SSH-Schlüssel wurden entfernt; für die wiederaufgenommene Diagnose besteht aktuell erneut ein temporärer Zugang bis zur abschließenden Geräteprüfung. Der Cudy ist über MQTT angebunden; die neue Bandbreitenoberfläche benötigt noch den passenden Cloud-Rollout. Die Internetwirkung unter Sättigung und der komplette Cloud-Bedienweg sind noch nicht abgenommen.

## Integrierter Stand mit Zeitplänen und Live-Sperren

Der gemeinsame Stand enthält die Historie von `feat/router-time-schedules` bis `52c9989` plus die Priorisierung aus `f83ad40`. Nicht den normalen Hauptordner direkt als Cloud-Backend bauen: Der bewährte Release-Generator erhält die gemeinsame Router-Nutzung und bytegleiche Anmeldung. Er übernimmt jetzt auch die Prioritätsklassen, Migration und Integrationstests und wendet zusätzlich `priority-cloud.patch` an. Der bisherige Zeitplan-Publisher bleibt separat; die MQTT-Telemetrie verarbeitet sowohl `time` als auch `priority`.

Bei Website- und anderen Schutzformularen gibt es Rückmeldungen direkt am Formular: Speichern läuft, erfolgreich gespeichert oder nicht vollständig gespeichert. „Erfolgreich gespeichert“ bestätigt die Speicherung; „Am Router bestätigt“ ist ein eigener Zustand. Eine Website nur für Kinder: Gruppe „Kinder“ erstellen, Geräte zuordnen, unter Websites sperren „Eine Gruppe“ und „Kinder“ auswählen. Es wird eine Domain gesperrt, nicht nur der Pfad eines einzelnen Links. Automatische Kategorienfilter sind noch nicht implementiert und im Live-Modus deaktiviert.

Der gemeldete TikTok-Zugriff auf der bestehenden Cloud wurde hier nicht an Router/Handy reproduziert. Domain-Speicherung, Gruppen-Zuordnung und API→MQTT-Bestätigung sind isoliert getestet. Ob TikTok auf einem konkreten Gerät vollständig gesperrt ist, muss nach dem Rollout mit dessen tatsächlicher Verbindung und frischen Anfragen geprüft werden; gespeicherte Regeln allein sind dafür kein Beleg.


## Update 27.11.: kontrollierte Bandbreite

Die erste begrenzte HTB-Version wurde nach weiteren Tests durch `priority-cake-20261127-v4` ersetzt. CAKE priorisiert die beiden Gerätemodi und isoliert Hosts innerhalb einer Prioritätsstufe; eine höhere Anzahl gleichzeitiger Verbindungen soll keinen zusätzlichen Geräteanteil verschaffen. Die früheren HTB-Anteile 2/3 zu 1/3 gelten in dieser Version nicht mehr.

Im Frontend unter Schutz → Priorisierung lassen sich die globalen Download-/Upload-Limits konfigurieren. Dafür müssen Backend und Frontend gemeinsam aus dem kompatiblen Release aktualisiert und die neue Migration `20261127_priority_bandwidth.sql` nach `20261127_device_priority.sql` angewendet werden. Ohne neue Cloud-Version verwendet der Router seine lokale Bandbreitenkonfiguration. Für die laufende Diagnose sind dort aktuell 20/10 Mbit/s als Inbetriebnahmegrenzen gesetzt; diese Werte sind keine Messung des Anschlusses. Beim Netzwerkwechsel müssen beide Grenzen neu gewählt werden, typischerweise knapp unter der stabil verfügbaren Anschlussgeschwindigkeit.

„Am Router bestätigt“ erfordert in der neuen Backend-Version passende aktive Bandbreitenklassen und aktuelle Bestätigung derselben Konfiguration. Ein höherer Speedtestwert für jedes bevorzugte Gerät ist dadurch nicht garantiert. Messungen und verbleibende Grenzen stehen im [Prüfprotokoll](../openspec/changes/device-priority-control/bandwidth-verification.md).

Automatisierte direkte Internettests mit Produktions-Geräteerkennung zeigten zuletzt 8,17 gegenüber 1,88 Mbit/s; ein anderer längerer Lauf 4,22 gegenüber 2,54 Mbit/s. Der echte Handy-/Laptop-Vergleich bleibt davon getrennt und noch offen. Der reproduzierbare Prüfer `router/tests/priority-wan-check.py` startet zwei identische direkte Downloads am Mac und stuft nur eine dieser Testverbindungen vorübergehend als normal ein. Die bevorzugte Verbindung verwendet unverändert die Produktionsregeln. Ein Watchdog und `finally` stellen den ursprünglichen Zustand wieder her. Beispiel: `python3 router/tests/priority-wan-check.py --client-ip <Mac-IPv4> --ssh-key <temporärer-Schlüssel>`.
