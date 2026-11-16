#!/usr/bin/env bash
# Publishes fake router telemetry to the Compose Mosquitto broker, so the backend
# can be developed and demoed without a physical router. Stop with Ctrl+C.
#
# Usage: scripts/mqtt-simulate-router.sh [router-id]
# Env:   INTERVAL (seconds, default 10), NETWORK (default nethera_default),
#        BROKER (default mosquitto), MQTT_USER (default router-<id>),
#        MQTT_PASSWORD (default $NETHERA_MQTT_ROUTER1_PASSWORD or nethera-router)
set -euo pipefail

ROUTER_ID=${1:-1}
INTERVAL=${INTERVAL:-10}
NETWORK=${NETWORK:-nethera_default}
BROKER=${BROKER:-mosquitto}
MQTT_USER=${MQTT_USER:-router-$ROUTER_ID}
MQTT_PASSWORD=${MQTT_PASSWORD:-${NETHERA_MQTT_ROUTER1_PASSWORD:-nethera-router}}

echo "Simulating router $ROUTER_ID -> $BROKER on network $NETWORK every ${INTERVAL}s (Ctrl+C to stop)"

exec docker run --rm -i --network "$NETWORK" \
  -e ROUTER_ID="$ROUTER_ID" -e INTERVAL="$INTERVAL" -e BROKER="$BROKER" \
  -e MQTT_USER="$MQTT_USER" -e MQTT_PASSWORD="$MQTT_PASSWORD" \
  eclipse-mosquitto:2 sh -s <<'SIMULATOR'
set -u
T="nethera/$ROUTER_ID"
pub() { mosquitto_pub -h "$BROKER" -u "$MQTT_USER" -P "$MQTT_PASSWORD" "$@" || echo "publish failed: $*"; }

# Long-lived connection whose Last Will marks the router offline if it dies
mosquitto_sub -h "$BROKER" -u "$MQTT_USER" -P "$MQTT_PASSWORD" -t "$T/status" -k 30 \
  --will-topic "$T/status" --will-payload offline --will-retain --will-qos 1 >/dev/null &
SUB=$!
sleep 1
pub -q 1 -r -t "$T/status" -m online

running=1
trap 'running=0' INT TERM

rx=$((RANDOM * 100000)); tx=$((RANDOM * 10000))
forwarded=$((RANDOM % 1000)); answered=$((RANDOM % 300))
cycle=0

while [ "$running" = 1 ]; do
  now=$(date +%s)

  if [ $((cycle % 10)) = 0 ]; then
    pub -q 1 -r -t "$T/telemetry/metadata" \
      -m "{\"v\":1,\"ts\":$now,\"model\":\"Nethera Simulator\",\"firmware\":\"OpenWrt 25.12.5 (simulated)\"}"
  fi

  # 5-50 Mbit/s down, 1-10 Mbit/s up over the interval
  rx=$((rx + (5 + RANDOM % 46) * 125000 * INTERVAL))
  tx=$((tx + (1 + RANDOM % 10) * 125000 * INTERVAL))
  pub -q 0 -t "$T/telemetry/speed" \
    -m "{\"v\":1,\"ts\":$now,\"iface\":\"wan\",\"rxBytes\":$rx,\"txBytes\":$tx}"

  forwarded=$((forwarded + 20 + RANDOM % 180))
  answered=$((answered + 5 + RANDOM % 55))
  pub -q 1 -t "$T/telemetry/dns" \
    -m "{\"v\":1,\"ts\":$now,\"forwarded\":$forwarded,\"answeredLocally\":$answered}"

  # The tablet drops off every third cycle to produce DISCONNECTED/CONNECTED events
  reachable='"02:00:00:00:00:01","02:00:00:00:00:02","02:00:00:00:00:03"'
  if [ $((cycle % 3)) != 2 ]; then reachable="$reachable,\"02:00:00:00:00:04\""; fi
  pub -q 1 -t "$T/telemetry/devices" -m "{\"v\":1,\"ts\":$now,
    \"leases\":[
      {\"mac\":\"02:00:00:00:00:01\",\"ip\":\"192.168.1.101\",\"hostname\":\"sim-desktop\"},
      {\"mac\":\"02:00:00:00:00:02\",\"ip\":\"192.168.1.102\",\"hostname\":\"sim-phone\"},
      {\"mac\":\"02:00:00:00:00:03\",\"ip\":\"192.168.1.103\",\"hostname\":\"sim-tv\"},
      {\"mac\":\"02:00:00:00:00:04\",\"ip\":\"192.168.1.104\",\"hostname\":\"sim-tablet\"}],
    \"reachable\":[$reachable],
    \"wifi\":[\"02:00:00:00:00:02\",\"02:00:00:00:00:04\"]}"

  echo "cycle $cycle published (rx=$rx tx=$tx dns=$forwarded/$answered)"
  cycle=$((cycle + 1))

  i=0
  while [ "$running" = 1 ] && [ "$i" -lt "$INTERVAL" ]; do sleep 1; i=$((i + 1)); done
done

pub -q 1 -r -t "$T/status" -m offline
kill "$SUB" 2>/dev/null
echo "router $ROUTER_ID marked offline"
SIMULATOR
