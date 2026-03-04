# BIND Server-Build unter MacOS

Main-Resource:  
https://github.com/isc-projects/bind9/blob/main/doc/arm/build.inc.rst
---
## Vorbereitungen

"Command Tools for XCode" müssen installiert sein.  
Installation: ```xcode-select --install```  
(installiertes XCode vorausgesetzt)

## Libraries installieren
```brew install meson ninja pkg-config openssl libuv liburcu perl``` 

## Repo klonen
```git clone https://github.com/isc-projects/bind9.git ```

## Build konfigurieren
SSL-Pfad finden:  
```brew --prefix openssl```

Pfad setzen:  
```export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:/opt/homebrew/opt/openssl/lib/pkgconfig"```

Build-Ordner erstellen:  
```export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:/opt/homebrew/opt/openssl/lib/pkgconfig"```

## Kompilieren
```meson compile -C build```

## Installieren
```sudo meson install -C build```

Installation testen (Version anzeigen):  
```/usr/local/bind9/sbin/named -v```

Hinweis: In Branch muss Datei ```meson.build``` vorhanden sein, dies ist in 'stable' nicht der Fall.