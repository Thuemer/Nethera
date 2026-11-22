package at.htlleonding.control;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import static org.junit.jupiter.api.Assertions.*;

class TimeMigrationTest {
    @Test void additiveMigrationIsRepeatableAndPreservesLegacyRowsAndAcknowledgements() throws Exception {
        try (var postgres = new GenericContainer<>("postgres:15")
                .withEnv("POSTGRES_USER", "nethera").withEnv("POSTGRES_PASSWORD", "test-only")
                .withEnv("POSTGRES_DB", "migration").withExposedPorts(5432)
                .waitingFor(Wait.forLogMessage(".*database system is ready to accept connections.*", 2))) {
            postgres.start();
            try (var db = DriverManager.getConnection("jdbc:postgresql://" + postgres.getHost() + ":" + postgres.getMappedPort(5432) + "/migration", "nethera", "test-only");
                 var sql = db.createStatement()) {
                sql.execute("CREATE TABLE router(id bigint PRIMARY KEY); INSERT INTO router VALUES (1);"
                        + "CREATE TABLE device_time_limit(id bigint PRIMARY KEY, used_minutes_today int, note text);"
                        + "INSERT INTO device_time_limit VALUES(9,25,'keep existing rule');"
                        + "CREATE TABLE account(id bigint PRIMARY KEY, name text); INSERT INTO account VALUES(1,'keep account');");
                String migration = Files.readString(Path.of("migrations/20261122_time_control_bridge.sql"));
                sql.execute(migration);
                try (var result = sql.executeQuery("SELECT used_minutes_today, note, router_enforcement FROM device_time_limit WHERE id=9")) {
                    assertTrue(result.next()); assertEquals(25, result.getInt(1));
                    assertEquals("keep existing rule", result.getString(2)); assertFalse(result.getBoolean(3));
                }
                sql.execute("UPDATE device_time_limit SET router_enforcement=true WHERE id=9;"
                        + "INSERT INTO time_control_state(router_id, desired_version, applied_version) VALUES(1,77,77);");
                sql.execute(migration);
                try (var result = sql.executeQuery("SELECT router_enforcement FROM device_time_limit WHERE id=9")) {
                    assertTrue(result.next()); assertTrue(result.getBoolean(1));
                }
                try (var result = sql.executeQuery("SELECT desired_version, applied_version FROM time_control_state WHERE router_id=1")) {
                    assertTrue(result.next()); assertEquals(77, result.getLong(1)); assertEquals(77, result.getLong(2));
                }
                try (var result = sql.executeQuery("SELECT name FROM account WHERE id=1")) {
                    assertTrue(result.next()); assertEquals("keep account", result.getString(1));
                }
            }
        }
    }
}
