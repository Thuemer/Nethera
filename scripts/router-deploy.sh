#!/bin/sh
# Builds the Nethera router agent and installs it on an OpenWrt router over SSH.
# Usage: scripts/router-deploy.sh [router-host]   (default 192.168.1.1)
# Asks for the router's root password once. An existing agent configuration is kept.
set -e

HOST=${1:-192.168.1.1}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "1/3 Testing and building the agent"
cd "$ROOT/router/agent"
go test ./...
VERSION=$(git -C "$ROOT" describe --always --dirty 2>/dev/null || echo dev)
mkdir -p "$ROOT/router/build"
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$VERSION" -o "$ROOT/router/build/nethera-agent" .

# Files in the layout of the router's file system.
# They are unpacked into a temporary folder on the router and copied from there, so that
# the owner and permissions of the router's own folders (/, /etc, /tmp, ...) never change.
cp -R "$ROOT/router/files/." "$STAGE/"
mkdir -p "$STAGE/usr/bin"
cp "$ROOT/router/build/nethera-agent" "$STAGE/usr/bin/nethera-agent"

echo "2/3 Copying to root@$HOST (password of the router)"
tar -C "$STAGE" -czf - . | ssh "root@$HOST" '
set -e
SRC=/tmp/nethera-deploy
rm -rf "$SRC"
mkdir "$SRC"
tar -xzf - -C "$SRC"

# install FILE MODE: copy one file into place, owned by root
install_file() {
	mkdir -p "/$(dirname "$1")"
	cp "$SRC/$1" "/$1"
	chown root:root "/$1"
	chmod "$2" "/$1"
}
install_file usr/bin/nethera-agent 755
install_file etc/init.d/nethera-agent 755
install_file etc/hotplug.d/ntp/50-nethera 644
install_file lib/upgrade/keep.d/nethera-agent 644

# Keep a configuration of this agent; replace anything else (e.g. the shell prototype)
if ! uci -q get nethera.agent >/dev/null; then
	[ -f /etc/config/nethera ] && mv /etc/config/nethera /root/nethera.config.before-agent
	# 600: the file will hold the MQTT password
	install_file etc/config/nethera 600
	FIRST_INSTALL=1
fi
rm -rf "$SRC"

command -v iw >/dev/null || apk add iw >/dev/null 2>&1 || echo "warning: could not install iw (no internet?); devices are reported without Wi-Fi information"

/etc/init.d/nethera-agent enable
echo "3/3 Installed $(/usr/bin/nethera-agent -version)"

if [ "$(uci -q get nethera.agent.enabled)" = 1 ]; then
	/etc/init.d/nethera-agent restart
	echo "The agent was restarted. Check it with: logread -e nethera-agent"
else
	echo
	echo "Next: set the options on the router, then start the agent:"
	echo "  uci set nethera.agent.router_id=1"
	echo "  uci set nethera.agent.broker=it220208.cloud.htl-leonding.ac.at"
	echo "  uci set nethera.agent.password=<MQTT password of this router>"
	echo "  uci set nethera.agent.enabled=1"
	echo "  uci commit nethera"
	echo "  /etc/init.d/nethera-agent start"
fi
[ -n "$FIRST_INSTALL" ] && [ -f /root/nethera.config.before-agent ] && echo "(The previous /etc/config/nethera was saved as /root/nethera.config.before-agent)"
true'
