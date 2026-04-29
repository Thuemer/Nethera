# OpenVPN Setup (OpenWrt Lab Router)

## Ziel

OpenVPN Server im lokalen Netzwerk betreiben (kein WAN) Clients
verbinden sich über VPN (10.8.0.0/24)

------------------------------------------------------------------------

## Setup

### PKI / Zertifikate erstellen

``` sh
cd /etc/easy-rsa

easyrsa build-ca nopass
easyrsa build-server-full server nopass
easyrsa build-client-full client1 nopass
easyrsa gen-dh
```

------------------------------------------------------------------------

### Dateien kopieren

``` sh
cp pki/ca.crt /etc/openvpn/cacerts/
cp pki/issued/server.crt /etc/openvpn/certs/
cp pki/private/server.key /etc/openvpn/keys/
cp pki/dh.pem /etc/openvpn/
```

------------------------------------------------------------------------

## Server Config

Datei: `/etc/openvpn/server.conf`

``` conf
port 1194
proto udp
dev tun

ca /etc/openvpn/cacerts/ca.crt
cert /etc/openvpn/certs/server.crt
key /etc/openvpn/keys/server.key
dh /etc/openvpn/dh.pem

server 10.8.0.0 255.255.255.0

push "redirect-gateway def1"
push "dhcp-option DNS 192.168.1.1"

keepalive 10 120
persist-key
persist-tun

verb 3
```

------------------------------------------------------------------------

## Server starten (Test)

``` sh
openvpn --config /etc/openvpn/server.conf &
```

Check:

``` sh
ss -ulnp | grep 1194
ip a | grep tun
```

------------------------------------------------------------------------

## Netzwerk Setup

IP Forwarding:

``` sh
echo 1 > /proc/sys/net/ipv4/ip_forward
```

NAT:

``` sh
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

------------------------------------------------------------------------

## Client hinzufügen

``` sh
cd /etc/easy-rsa
easyrsa build-client-full client2 nopass
```

Benötigte Dateien:

-   ca.crt
-   client2.crt
-   client2.key

------------------------------------------------------------------------

## Client Config

``` conf
client
dev tun
proto udp
remote 192.168.1.1 1194

nobind
persist-key
persist-tun

ca ca.crt
cert client2.crt
key client2.key

verb 3
```

------------------------------------------------------------------------

## Test

``` sh
ip a
ping 10.8.0.1
```

------------------------------------------------------------------------

## Hinweise

-   Kein WAN → nur LAN-Test
-   Jeder Client braucht eigenes Zertifikat
-   server.key niemals teilen
