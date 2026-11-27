#!/bin/sh
# Install ONLY the independent priority worker; never replace the existing DNS agent.
# Usage: scripts/router-priority-deploy.sh [root@192.168.1.1]
# SSH authentication follows ~/.ssh/config or ssh-agent.
set -eu
HOST=${1:-root@192.168.1.1}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cd "$ROOT/router/agent"
go test ./...
mkdir -p "$STAGE/usr/bin" "$STAGE/etc/init.d" "$STAGE/lib/upgrade/keep.d"
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags '-s -w' -o "$STAGE/usr/bin/nethera-priority" .
cp "$ROOT/router/files/etc/init.d/nethera-priority" "$STAGE/etc/init.d/"
cp "$ROOT/router/files/lib/upgrade/keep.d/nethera-priority" "$STAGE/lib/upgrade/keep.d/"
tar -C "$STAGE" -czf - . | ssh "$HOST" '
set -eu
stage=$(mktemp -d /tmp/nethera-priority-install.XXXXXX)
trap '\''rm -rf "$stage"'\'' EXIT
tar -xzf - -C "$stage"
# Refuse a foreign service under the same name.
if [ -f /etc/init.d/nethera-priority ]; then
 grep -q -- "--priority-only" /etc/init.d/nethera-priority || exit 1
 /etc/init.d/nethera-priority stop
fi
apk add tc-full kmod-sched-core kmod-sched-drr kmod-sched
cp "$stage/usr/bin/nethera-priority" /usr/bin/nethera-priority
chmod 755 /usr/bin/nethera-priority
cp "$stage/etc/init.d/nethera-priority" /etc/init.d/nethera-priority
chmod 755 /etc/init.d/nethera-priority
cp "$stage/lib/upgrade/keep.d/nethera-priority" /lib/upgrade/keep.d/nethera-priority
chmod 644 /lib/upgrade/keep.d/nethera-priority
/etc/init.d/nethera-priority enable
/etc/init.d/nethera-priority start
/etc/init.d/nethera-priority status
'
