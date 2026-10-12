package at.htlleonding.mqtt;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

import java.util.Map;

// Real Postgres + Mosquitto for the MQTT integration test
public class MqttTelemetryTestResource implements QuarkusTestResourceLifecycleManager {

    static GenericContainer<?> mosquitto;
    private GenericContainer<?> postgres;

    @Override
    public Map<String, String> start() {
        postgres = new GenericContainer<>("postgres:15")
                .withEnv("POSTGRES_DB", "nethera")
                .withEnv("POSTGRES_USER", "nethera")
                .withEnv("POSTGRES_PASSWORD", "nethera")
                .withExposedPorts(5432)
                .waitingFor(Wait.forLogMessage(".*database system is ready to accept connections.*", 2));
        mosquitto = new GenericContainer<>("eclipse-mosquitto:2")
                .withCommand("mosquitto", "-c", "/mosquitto-no-auth.conf")
                .withExposedPorts(1883)
                .waitingFor(Wait.forListeningPort());
        postgres.start();
        mosquitto.start();

        return Map.of(
                "quarkus.datasource.jdbc.url", "jdbc:postgresql://" + postgres.getHost() + ":" + postgres.getMappedPort(5432) + "/nethera",
                "nethera.mqtt.host", mosquitto.getHost(),
                "nethera.mqtt.port", String.valueOf(mosquitto.getMappedPort(1883)),
                // Profile-prefixed key, otherwise %test.nethera.telemetry.mode=ssh wins
                "%test.nethera.telemetry.mode", "mqtt",
                "quarkus.scheduler.enabled", "false",
                "quarkus.http.test-port", "0");
    }

    @Override
    public void stop() {
        if (mosquitto != null) mosquitto.stop();
        if (postgres != null) postgres.stop();
    }

    static void publish(String topic, String payload) throws Exception {
        var result = mosquitto.execInContainer("mosquitto_pub", "-h", "localhost", "-q", "1", "-t", topic, "-m", payload);
        if (result.getExitCode() != 0) {
            throw new IllegalStateException("mosquitto_pub failed: " + result.getStderr());
        }
    }
}
