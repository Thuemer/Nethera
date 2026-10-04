package at.htlleonding.boundary;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

import java.util.Map;

// Real Postgres so endpoints can run their queries in @QuarkusTest
public class PostgresTestResource implements QuarkusTestResourceLifecycleManager {

    private GenericContainer<?> postgres;

    @Override
    public Map<String, String> start() {
        postgres = new GenericContainer<>("postgres:15")
                .withEnv("POSTGRES_DB", "nethera")
                .withEnv("POSTGRES_USER", "nethera")
                .withEnv("POSTGRES_PASSWORD", "nethera")
                .withExposedPorts(5432)
                .waitingFor(Wait.forLogMessage(".*database system is ready to accept connections.*", 2));
        postgres.start();

        return Map.of(
                "quarkus.datasource.jdbc.url", "jdbc:postgresql://" + postgres.getHost() + ":" + postgres.getMappedPort(5432) + "/nethera",
                "quarkus.scheduler.enabled", "false",
                "quarkus.http.test-port", "0");
    }

    @Override
    public void stop() {
        if (postgres != null) postgres.stop();
    }
}
