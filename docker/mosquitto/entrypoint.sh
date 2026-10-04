#!/bin/sh
# Builds the password file from env vars on every start, then runs the broker
set -e

PASSWD=/mosquitto/data/passwd
rm -f "$PASSWD"
touch "$PASSWD"
chmod 0700 "$PASSWD"
mosquitto_passwd -b "$PASSWD" nethera-backend "${NETHERA_MQTT_BACKEND_PASSWORD:?}"
mosquitto_passwd -b "$PASSWD" router-1 "${NETHERA_MQTT_ROUTER1_PASSWORD:?}"
chown mosquitto:mosquitto "$PASSWD"

exec mosquitto -c /mosquitto/config/mosquitto.conf
