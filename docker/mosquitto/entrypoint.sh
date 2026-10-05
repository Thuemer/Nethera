#!/bin/sh
# Builds the password file from env vars and installs the ACL on every start, then runs the broker.
# Both files must be owned by mosquitto, which a read-only bind mount can't guarantee.
set -e

PASSWD=/mosquitto/data/passwd
rm -f "$PASSWD"
touch "$PASSWD"
chmod 0700 "$PASSWD"
mosquitto_passwd -b "$PASSWD" nethera-backend "${NETHERA_MQTT_BACKEND_PASSWORD:?}"
mosquitto_passwd -b "$PASSWD" router-1 "${NETHERA_MQTT_ROUTER1_PASSWORD:?}"
chown mosquitto:mosquitto "$PASSWD"

ACL=/mosquitto/data/acl
cp /mosquitto/config/acl "$ACL"
chmod 0700 "$ACL"
chown mosquitto:mosquitto "$ACL"

exec mosquitto -c /mosquitto/config/mosquitto.conf
