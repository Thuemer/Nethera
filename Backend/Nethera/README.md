# nethera

This project uses Quarkus, the Supersonic Subatomic Java Framework.

If you want to learn more about Quarkus, please visit its website: <https://quarkus.io/>.

## Development

### Prerequisites

The complete application (frontend, backend, Keycloak and databases) is started from the repository root:

```shell script
docker compose up -d --build
```

Open <http://localhost:5500/index.html>. On a fresh database, sign in as `demo` / `nethera-demo`. See the root README for details. Do not run the old compose file in this backend directory for the complete app.

### Authentication

Protected API endpoints require a valid Bearer token issued by the `Nethera` Keycloak realm.

**Obtain a token (dev user):**

```shell script
TOKEN=$(curl -s -X POST http://localhost:8081/realms/Nethera/protocol/openid-connect/token \
  -d "client_id=Nethera-frontend&grant_type=password&username=demo&password=nethera-demo" \
  | jq -r .access_token)
```

**Call an endpoint with the token:**

```shell script
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/routers/list
```

> **Note**: The root Compose stack imports the realm and demo user automatically into a new Keycloak database. Existing Keycloak data is kept; the import does not overwrite it.

## Router telemetry over MQTT

Router data (metadata, WAN speed, DNS stats, devices) arrives over two transports that write identical rows:

- **MQTT:** the router pushes to the Mosquitto broker and the backend subscribes to `nethera/#`.
- **SSH:** the scheduler pulls from the router at `nethera.router.ip` (the router `nethera.router.id`).

`nethera.telemetry.mode` selects the transport:

| Mode | Behavior |
|---|---|
| `auto` (default) | Per router and stream: MQTT while a valid message arrived within `nethera.mqtt.stale-after` (180s), otherwise SSH |
| `mqtt` | MQTT only, no SSH connections (used by the Compose stack) |
| `ssh` | SSH only, no broker connection is attempted |

### Topics (`<id>` = `Router` primary key)

| Topic | Payload | Retained |
|---|---|---|
| `nethera/<id>/status` | `online` / `offline` (Last Will) | yes |
| `nethera/<id>/telemetry/metadata` | `{"v":1,"ts":1759579200,"model":"GL.iNet GL-MT3000","firmware":"OpenWrt 23.05.3"}` | yes |
| `nethera/<id>/telemetry/speed` | `{"v":1,"ts":1759579200,"iface":"wan","rxBytes":123456789,"txBytes":9876543}` | no |
| `nethera/<id>/telemetry/dns` | `{"v":1,"ts":1759579200,"forwarded":1200,"answeredLocally":340}` | no |
| `nethera/<id>/telemetry/devices` | `{"v":1,"ts":1759579200,"leases":[{"mac":"aa:bb:cc:dd:ee:ff","ip":"192.168.1.20","hostname":"laptop"}],"reachable":["aa:bb:cc:dd:ee:ff"],"wifi":[]}` | no |

`ts` is the router's Unix time in seconds. Speed and DNS values are cumulative counters, and the backend stores the deltas between two messages. Invalid payloads are logged and discarded. The full contract is in `openspec/changes/mqtt-router-telemetry/specs/mqtt-telemetry-ingestion/spec.md`.

### Simulating a router

With the Compose stack running, from the repository root:

```shell script
scripts/mqtt-simulate-router.sh 1
```

For a local `./mvnw quarkus:dev` run against the Compose broker, set `NETHERA_MQTT_PASSWORD` if you changed the default.

## Running the application in dev mode

You can run your application in dev mode that enables live coding using:

```shell script
./mvnw quarkus:dev
```

> **_NOTE:_**  Quarkus now ships with a Dev UI, which is available in dev mode only at <http://localhost:8080/q/dev/>.

## Packaging and running the application

The application can be packaged using:

```shell script
./mvnw package
```

It produces the `quarkus-run.jar` file in the `target/quarkus-app/` directory.
Be aware that it’s not an _über-jar_ as the dependencies are copied into the `target/quarkus-app/lib/` directory.

The application is now runnable using `java -jar target/quarkus-app/quarkus-run.jar`.

If you want to build an _über-jar_, execute the following command:

```shell script
./mvnw package -Dquarkus.package.jar.type=uber-jar
```

The application, packaged as an _über-jar_, is now runnable using `java -jar target/*-runner.jar`.

## Creating a native executable

You can create a native executable using:

```shell script
./mvnw package -Dnative
```

Or, if you don't have GraalVM installed, you can run the native executable build in a container using:

```shell script
./mvnw package -Dnative -Dquarkus.native.container-build=true
```

You can then execute your native executable with: `./target/nethera-1.0-SNAPSHOT-runner`

If you want to learn more about building native executables, please consult <https://quarkus.io/guides/maven-tooling>.

## Related Guides

- REST ([guide](https://quarkus.io/guides/rest)): A Jakarta REST implementation utilizing build time processing and
  Vert.x. This extension is not compatible with the quarkus-resteasy extension, or any of the extensions that depend on
  it.
- Hibernate ORM ([guide](https://quarkus.io/guides/hibernate-orm)): Define your persistent model with Hibernate ORM and
  Jakarta Persistence
- REST Jackson ([guide](https://quarkus.io/guides/rest#json-serialisation)): Jackson serialization support for Quarkus
  REST. This extension is not compatible with the quarkus-resteasy extension, or any of the extensions that depend on it
- JDBC Driver - PostgreSQL ([guide](https://quarkus.io/guides/datasource)): Connect to the PostgreSQL database via JDBC

## Provided Code

### Hibernate ORM

Create your first JPA entity

[Related guide section...](https://quarkus.io/guides/hibernate-orm)

### REST

Easily start your REST Web Services

[Related guide section...](https://quarkus.io/guides/getting-started-reactive#reactive-jax-rs-resources)
