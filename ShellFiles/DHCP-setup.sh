#!/bin/bash
set -e

# --- Variables ---
LAN_IF="eth1"
LAN_IP="192.168.62.1"
LAN_NET="192.168.62.0"
LAN_NETMASK="255.255.255.0"
DHCP_RANGE_START="192.168.62.100"
DHCP_RANGE_END="192.168.62.110"
DNS_SERVERS="1.1.1.1, 8.8.8.8"

echo "[1/6] Installing DHCP server..."
apt update
apt install -y isc-dhcp-server

echo "[2/6] Configuring LAN interface $LAN_IF..."
ip addr flush dev $LAN_IF
ip addr add $LAN_IP/24 dev $LAN_IF
ip link set $LAN_IF up

echo "[3/6] Configuring DHCP server..."
cat > /etc/dhcp/dhcpd.conf <<EOF
authoritative;

subnet $LAN_NET netmask $LAN_NETMASK {
    range $DHCP_RANGE_START $DHCP_RANGE_END;
    option routers $LAN_IP;
    option subnet-mask $LAN_NETMASK;
    option domain-name-servers $DNS_SERVERS;
}
EOF

# Ensure the DHCP server listens on the correct interface
if grep -q "^INTERFACESv4=" /etc/default/isc-dhcp-server; then
    sed -i "s/^INTERFACESv4=.*/INTERFACESv4=\"$LAN_IF\"/" /etc/default/isc-dhcp-server
else
    echo "INTERFACESv4=\"$LAN_IF\"" >> /etc/default/isc-dhcp-server
fi

echo "[4/6] Enabling IPv4 forwarding (temporary and permanent)..."
sysctl -w net.ipv4.ip_forward=1
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

echo "[5/6] Restarting DHCP server..."
systemctl restart isc-dhcp-server
systemctl enable isc-dhcp-server

echo "[6/6] DHCP setup complete. Clients on $LAN_IF should now get IPs automatically."
