package at.htlleonding.control;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import static org.junit.jupiter.api.Assertions.*;

class PriorityMigrationTest {
    @Test void additivePriorityMigrationPreservesDnsTimeUsersAndExistingPreferences() throws Exception {
        try (var postgres = new GenericContainer<>("postgres:15")
                .withEnv("POSTGRES_USER", "nethera").withEnv("POSTGRES_PASSWORD", "test-only")
                .withEnv("POSTGRES_DB", "migration").withExposedPorts(5432)
                .waitingFor(Wait.forLogMessage(".*database system is ready to accept connections.*", 2))) {
            postgres.start();
            try (var db = DriverManager.getConnection("jdbc:postgresql://" + postgres.getHost() + ":" + postgres.getMappedPort(5432) + "/migration", "nethera", "test-only");
                 var sql = db.createStatement()) {
                sql.execute("CREATE TABLE router(id bigint PRIMARY KEY); INSERT INTO router VALUES (1);"
                        + "CREATE TABLE device(id bigint PRIMARY KEY, router_id bigint); INSERT INTO device VALUES (7,1);"
                        + "CREATE TABLE router_control_state(router_id bigint PRIMARY KEY, desired_version bigint, desired_content text);"
                        + "INSERT INTO router_control_state VALUES (1,77,'keep DNS and adblock');"
                        + "CREATE TABLE time_control_state(router_id bigint PRIMARY KEY, desired_version bigint, desired_content text);"
                        + "INSERT INTO time_control_state VALUES (1,88,'keep active time rules');"
                        + "CREATE TABLE account(id bigint PRIMARY KEY, name text); INSERT INTO account VALUES(1,'keep login');");
                String migration = Files.readString(Path.of("migrations/20261127_device_priority.sql"));
                sql.execute(migration);
                String shaping=Files.readString(Path.of("migrations/20261127_priority_bandwidth.sql"));
                sql.execute(shaping);
                sql.execute(shaping);
                sql.execute("INSERT INTO device_priority VALUES(7,'high');"
                        + "INSERT INTO priority_control_state(router_id,desired_version,applied_version) VALUES(1,99,99);");
                sql.execute(migration);
                for (String query : new String[]{
                        "SELECT desired_content FROM router_control_state WHERE router_id=1",
                        "SELECT desired_content FROM time_control_state WHERE router_id=1",
                        "SELECT name FROM account WHERE id=1", "SELECT mode FROM device_priority WHERE device_id=7"}) {
                    try (var row = sql.executeQuery(query)) { assertTrue(row.next()); assertFalse(row.getString(1).isBlank()); }
                }
                try (var row = sql.executeQuery("SELECT desired_version, applied_version FROM priority_control_state WHERE router_id=1")) {
                    assertTrue(row.next()); assertEquals(99,row.getLong(1)); assertEquals(99,row.getLong(2));
                }
                assertThrows(java.sql.SQLException.class, () -> sql.execute("INSERT INTO device_priority VALUES(999,'normal')"));
            }
        }
    }
}
