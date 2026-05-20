#!/usr/bin/env bash
set -e

BLOCK_DOMAIN="htl-leonding.at"

echo "[1/2] Start setup | download packages"
apt update
apt install ssh
apt install -y openssh-server

echo "[2/2] Start setup | enable ssh"
systemctl enable ssh
systemctl start ssh


echo "[1/8] Enable IPv4 forwarding..."
sysctl -w net.ipv4.ip_forward=1
sed -i 's/^#\?net.ipv4.ip_forward=.*/net.ipv4.ip_forward=1/' /etc/sysctl.conf

echo "[2/8] Install required packages..."
apt install -y nftables dnsmasq

echo "[3/8] Detect WAN interface..."
WAN_IFACE=$(ip route | awk '/default/ {print $5}' | head -n1)
if [ -z "$WAN_IFACE" ]; then
    echo "WAN interface not found"
    exit 1
fi
echo "WAN interface: $WAN_IFACE"

echo "[4/8] Configure dnsmasq to populate nftables set..."
cat > /etc/dnsmasq.d/htl-block.conf << EOF
nftset=/$BLOCK_DOMAIN/inet/filter/blocked_ips
nftset=/www.$BLOCK_DOMAIN/inet/filter/blocked_ips
EOF

systemctl restart dnsmasq
systemctl enable dnsmasq

echo "[5/8] Write nftables rules (filter + NAT)..."
cat > /etc/nftables.conf << EOF
#!/usr/sbin/nft -f

flush ruleset

table inet filter {

    set blocked_ips {
        type ipv4_addr
        flags dynamic
    }

    chain input {
        type filter hook input priority 0;
        policy accept;
    }

    chain forward {
        type filter hook forward priority 0;
        policy accept;

        ip daddr @blocked_ips drop
    }

    chain output {
        type filter hook output priority 0;
        policy accept;
    }
}

table ip nat {
    chain prerouting {
        type nat hook prerouting priority 0;
    }

    chain postrouting {
        type nat hook postrouting priority 100;
        oifname "$WAN_IFACE" masquerade
    }
}
EOF

echo "[6/8] Load nftables rules..."
systemctl enable nftables
nft -f /etc/nftables.conf

#restart nftables

echo "[7/8] Restart dnsmasq to feed nftables..."
systemctl restart dnsmasq

echo "[8/8] Block active."
echo "Blocked domain: $BLOCK_DOMAIN"
