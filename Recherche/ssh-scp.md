# Anleitung für SSH Scp verbindung

Zu erst holst du dir den SSH key zu der VM.
Für diese Anleitung nehmen wir stat deinem Key 'lieblings.seite.at'
und als Benutzer 'helmut'

## Public Privat Key
Hast du ein Schlüsselpaar? Dann kannst du diesen Part überspringen.
Bist du dir nicht sicher oder hast keinen bleibe hier.

##### 1 Schlüsselpaar erstellen
Schreibe cd .. um in dein Hauptverzeichniss zu kommen
```
cd ..
```

Schreibe cd .shh um in deinen SSH ordner zu kommen
```
cd .ssh
```

Schreibe ls und schau ob du bereits ein Schlüssel paar hast
```
ls
```

Wenn du zwei Datein mit dem selben Namen hast. Und eine Davon mit '.pub' aufhört. 
Hast du bereits ein Schlüsselpaar

Wenn nicht erstellen wir ein Schlüssel paar mit ssh-keygen
```
ssh-keygen
```

Wenn du jetzt nochmal per ls den Inhalt anzeigen lässt siehst du dein Schlüsselpaar.

##### 2 Per SSH verbinden und Passwort speichern
Wenn du dich jetz per ssh-copy-id einlogst wird der SSH key gespeichert (Helmut = dein Benutzer | lieblings.seite.at = deine SSH adresse)
```
ssh-copy-id helmut@lieblings.seite.at
```

Wenn du dich jetzt per ssh anmeldest brauchst du kein Passwort mehr

##### 3 Config datei erstellen um SSH zu vereinfachen
Gehe zurück in den SSH Ordner
```
cd ..
```
```
cd .ssh
```

erstelle eine Datei config
```
touch config
```

und bearbeite die Datei per texteditor
```
nano config
```

Füge dort diese Zeilen ein
```
Host x
    HostName lieblings.seite.at
    User helmut
```
Wechsle folgende Parameter aus:
x                   mit einem Passendem Namen
lieblings.seite.at  mit der SSH domain zu der du dich verbinden möchtest
helmut              mit deinem Benutzer


Schließe den Text editor wieder.

Wenn du dich jetzt versuchst mit anzumelden kommst du ohne passwort zum Server/VM/usw.
```
ssh x
```
x = der Name den du ausgewählt hast

##### 4 Datein per SCP herunterladen
Mit SCP kannst du zwischen deinem Gerät und dem verbundenen Dienst daten austauschen.

So kannst du datein herunterladen
```
scp x:DateiName ZielOrt
```
x = den Namen den du Ausgewählt hast oder deine SSH adresse
DateiName = der Name der Datei die du Hochladen möchtest
Zielort = Am Zielgerät der Ort an dem du es hinspeichern möchtest


###### 5 Datein per SCP hochladen
So kannst du datein Hochladen

```
scp DateiName x: ZielOrt
```
x = den Namen den du Ausgewählt hast oder deine SSH adresse
DateiName = der Name der Datei die du Hochladen möchtest
Zielort = Am Zielgerät der Ort an dem du es hinspeichern möchtest