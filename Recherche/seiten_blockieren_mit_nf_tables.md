# Webseiten mit nftables blockieren
---

## 1. Grundgerüst für nftables

Falls noch kein nftables-Setup besteht, zuerst eine Tabelle und Ketten anlegen:

```bash
sudo nft add table inet filter
sudo nft add chain inet filter input { type filter hook input priority 0 \; }
sudo nft add chain inet filter forward { type filter hook forward priority 0 \; }
sudo nft add chain inet filter output { type filter hook output priority 0 \; }
```

* input: eingehende Verbindungen zum System
* forward: durchgeleitete Pakete
* output: ausgehende Verbindungen vom System

---

## 2. IP einer Webseite herausfinden

Beispiel: example.com

```bash
dig +short example.com
```

Angenommen, die Ausgabe ist `93.184.216.34`.

---

## 3. Webseite blockieren

Mit der IP der Webseite kann die Verbindung blockiert werden:

```bash
sudo nft add rule inet filter output ip daddr 93.184.216.34 drop
```

* ip daddr: Ziel-IP
* drop: Paket verwerfen

---

## 4. Mehrere Webseiten blockieren

1. **Set anlegen:**

```bash
sudo nft add set inet filter blocked_sites { type ipv4_addr \; flags interval \; }
```

2. **IPs hinzufügen:**

```bash
sudo nft add element inet filter blocked_sites { 93.184.216.34, 151.101.1.69 }
```

3. **Regel erstellen:**

```bash
sudo nft add rule inet filter output ip daddr @blocked_sites drop
```

4. **Weitere Webseiten hinzufügen:**

```bash
sudo nft add element inet filter blocked_sites { 142.250.190.78 }
```

---

## 5. Regeln dauerhaft speichern

Damit die Regeln nach einem Neustart erhalten bleiben:

```bash
sudo nft list ruleset > /etc/nftables.conf
sudo systemctl enable nftables
sudo systemctl start nftables
```

---

## Fertig

Die angegebenen IPs werden nun vom System aus geblockt. Neue Webseiten können einfach zur `blocked_sites`-Liste hinzugefügt werden.
