#!/usr/bin/env bash
set -euo pipefail
CONTAINER=${1:-nethera-keycloak}
REALM=${2:-Nethera}

cd "$(dirname "$0")/.."
docker cp themes/nethera "$CONTAINER":/opt/keycloak/themes/nethera

docker exec -it "$CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin

docker exec -it "$CONTAINER" /opt/keycloak/bin/kcadm.sh update realms/$REALM -s loginTheme=nethera

docker restart "$CONTAINER"
echo "Nethera Keycloak Theme installiert und Realm '$REALM' auf Theme 'nethera' gesetzt."
