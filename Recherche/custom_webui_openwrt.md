# Ersetzen von LuCI durch eine eigene Weboberfläche auf OpenWrt

## ⚙️ 1. Verständnis der Systemkomponenten

 Komponente --> Funktion 
| **uHTTPd** = Leichter, integrierter Webserver von OpenWrt |
| **rpcd**   = Dienst, der eine JSON-RPC-API zu Systemdiensten bereitstellt |
| **ubus**   = Kommunikationsbus zwischen Systemdiensten |
| **UCI**    = Zentrales Konfigurationssystem für Netzwerk-, WLAN- und Systemeinstellungen |
| **LuCI**   = Standard-Weboberfläche, die auf `rpcd` und `ubus` aufbaut |

Zielfunktion: Die eigene Oberfläche ersetzt **LuCI**, nutzt aber weiterhin **rpcd**, **ubus** und **UCI**, um mit OpenWrt zu interagieren.

---

## 🏗️ 2. Grundarchitektur

**Zielaufbau:**

```
Browser → (HTTP/HTTPS) → uHTTPd → ubus / rpcd → UCI / System
```

Wir erstellen also ein eigenes Frontend (HTML, CSS, JS), das über die bestehende Infrastruktur (`rpcd` + `ubus`) mit OpenWrt spricht.  
Dadurch bleibt das System stabil und update-sicher, auch ohne LuCI.

---

## 📦 3. Vorbereitung

1. **LuCI entfernen (optional):**
   ``` in der bash:

   opkg remove luci luci-base
   ```

2. **Webserver (uHTTPd) konfigurieren:**
   - Konfigurationsdatei: `/etc/config/uhttpd`
   - Wichtigste Optionen:
     ``` in der bash
     option listen_http '0.0.0.0:80'          (Diese Option sagt uHTTPd, auf Port 80 auf allen Netzwerkinterfaces zu hören.)
     option listen_https '0.0.0.0:443'        (Aktiviert HTTPS auf Port 443, wieder auf allen Interfaces.) 
     option home '/www/myui'                  (Legt das Web-Stammverzeichnis fest.)
     option redirect_https '1'                (Aktiviert die Automatische Weiterleitung von HTTP auf HTTPS.)
     ```

3. **Verzeichnis für die eigene Oberfläche anlegen:**
   ``` in der bash
   mkdir -p /www/myui
   ```

4. **Eigene Dateien ablegen:**
   ```
   /www/myui/index.html
   /www/myui/app.js

   ```

---

## 🧩 4. Kommunikation mit dem System (ubus / rpcd)

Wichtig: Wir benötigen vorher einen gültigen Session-Token. Diesen erhalten wir über den Auth-Endpunkt von `rpcd`.


OpenWrt bietet über `rpcd` eine HTTP-basierte API an, die JSON-RPC verwendet.  
Damit kannst du direkt Konfigurationen lesen, ändern und anwenden – genau wie LuCI es tut.

### Beispiel: RPC-Request

!(Beispiel: RPC-API-Aufruf)!

```in der bash

POST /ubus
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "call",
  "params": [ "session", "uci", "get", { "config": "network" } ]
}
```

### Beispiel: JavaScript-Aufruf
``` unsere .js-Datei
async function getNetworkConfig(token) {
  const res = await fetch("/ubus", {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "call",
      params: [token, "uci", "get", { config: "network" }]
    })
  });
  return res.json();
}
```


---

## 🔐 5. Authentifizierung & Sicherheit
- schauen ob RPCD läuft (/etc/init.d/rpcd start)
- Authentifizierung erfolgt über `rpcd` (Session Tokens)

- "passwd" und starkes pw angeben!
- Standardmäßig: Benutzer `root` + Passwort

- HTTPS aktivieren 
    - nano /etc/config/uhttpd

    - option listen_http '0.0.0.0:80'
      option listen_https '0.0.0.0:443'
      option redirect_https '1'

    -/etc/init.d/uhttpd restart

- Zugriff nur über LAN oder VPN erlauben (Firewall-Regel)
    - (
      uci set firewall.lan_only=rule
      uci set firewall.lan_only.src='wan'
      uci set firewall.lan_only.dest_port='80 443'
      uci set firewall.lan_only.target='DROP'
      uci commit firewall
      /etc/init.d/firewall restart
      )
- Keine Weboberfläche im WAN freigeben
    -grep listen /etc/config/uhttpd


---

## 🧱 6. Optional: Eigenen Webserver verwenden

Falls du mehr Kontrolle oder Features möchtest, kannst du LuCI und uHTTPd komplett ersetzen.

### Beispiel:
``` in der bash
opkg install nginx
```

Anschließend kannst du mit einem eigenen Backend (z. B. Node.js, Go oder Python) arbeiten, das direkt `uci`- oder `ubus`-Befehle aufruft.

**Empfohlene Struktur:**
```
Browser → REST API (Backend) → ubus / uci → System
```

---

## 🧠 7. Beispielprojekt – Minimaler Aufbau

**Ziel:** Eine kleine Oberfläche, die den WLAN-Status anzeigt und umschalten kann.

### Frontend-Dateien:
`/www/myui/index.html`
```html
<!DOCTYPE html>
<html>
<head>
  <title>My OpenWrt UI</title>
</head>
<body>
  <h1>WLAN Steuerung</h1>
  <button onclick="toggleWiFi()">WLAN umschalten</button>
  <script src="app.js"></script>
</body>
</html>
```

`/www/myui/app.js`
```js
async function toggleWiFi() {
  const token = "SESSION_TOKEN"; // vorher über RPC login holen
  await fetch("/ubus", {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "call",
      params: [token, "network.wireless", "toggle", {}]
    })
  });
  alert("WLAN wurde umgeschaltet!");
}
```

---

## 🧰 8. Nützliche Befehle

| `fw4 reload` | Firewall neu laden |
| `uci show` | Aktuelle Konfiguration anzeigen |
| `ubus list` | Verfügbare Dienste anzeigen |
| `ubus call system board` | Systeminformationen abrufen |
| `/etc/init.d/uhttpd restart` | Webserver neu starten |

---
