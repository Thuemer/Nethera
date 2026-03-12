# Router Dokumentation

## 3.12.25
Router Subnet in Heimnetzwerk aufbauen: Bridge IP ändern (je nach Heimnetz-IP)
z.B.: ``` ifconfig br0 192.168.1.0 netmask 255.255.255.0 ``` -> Router Testnetz 192.168.1.0 /24
Versuch, BIND-Package zu installieren:

```
root@mv-router:~# opkg update 
root@mv-router:~# opkg install bind-server bind-tools
Unknown package 'bind-server'.
Unknown package 'bind-tools'. 
Collected errors: 
    * opkg_install_cmd: Cannot install package bind-server. 
    * opkg_install_cmd: Cannot install package bind-tools.
```

-> vmtl. OpenWrt Version nicht passend