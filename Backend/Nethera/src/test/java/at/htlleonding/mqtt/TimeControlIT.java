package at.htlleonding.mqtt;

import at.htlleonding.boundary.TestRouters;
import at.htlleonding.model.*;
import at.htlleonding.telemetry.TimeIngestor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.concurrent.Callable;
import static at.htlleonding.mqtt.MqttTelemetryTestResource.publish;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
@WithTestResource(MqttTelemetryTestResource.class)
class TimeControlIT {
    static final ObjectMapper JSON = new ObjectMapper();
    static final String MAC = "02:27:00:00:00:01";
    @Inject EntityManager em;
    @Inject TimeIngestor ingestor;

    @Test @TestSecurity(user = "time-owner")
    void restBrokerReadbackPauseDeleteAndDnsIsolation() throws Exception {
        TestRouters.own(em, "time-owner", 1L);
        long id = QuarkusTransaction.requiringNew().call(() -> {
            ConnectedDevice device = new ConnectedDevice(); device.setRouter(em.find(Router.class, 1L));
            device.setMacAddress(MAC); device.setHostname("Time integration test");
            device.setDataSource(TelemetryRecord.DataSource.ROUTER); em.persist(device); em.flush();
            DeviceTimeLimit legacy = new DeviceTimeLimit(); legacy.setDevice(device); legacy.setStatus("active");
            legacy.setDailyLimitMinutes(60); legacy.setBlockedFrom("20:00"); legacy.setBlockedUntil("08:00");
            em.persist(legacy); return device.getId();
        });
        String endpoint = "/api/device-time-limits/" + id;
        String path = "timeLimits.'" + id + "'";
        given().get("/api/router-control/status").then().statusCode(200)
                .body(path + ".requiresActivation", equalTo(true)).body(path + ".applied", equalTo(false));
        JsonNode dnsBefore = await(() -> retained("dns"));
        publish("nethera/1/status", "online");
        await(() -> "online".equals(status().path("connection").asText()) ? true : null);

        String body = "{\"dailyLimitMinutes\":120,\"usedMinutesToday\":999,\"blockedFrom\":\"21:00\",\"blockedUntil\":\"07:00\",\"status\":\"active\"}";
        given().contentType(ContentType.JSON).body(body).put(endpoint).then().statusCode(200)
                .body("usedMinutesToday", nullValue()).body("routerEnforcement", equalTo(true));
        JsonNode desired = await(() -> {
            var config = retained("time"); return config != null && config.path("devices").has(MAC) ? config : null;
        });
        long version = desired.path("version").asLong();
        assertTrue(version > 0); assertEquals("Europe/Vienna", desired.path("timezone").asText());
        assertEquals(7, desired.path("devices").path(MAC).path("budgets").size());
        assertEquals("21:00", desired.path("devices").path(MAC).path("windows").get(0).path("from").asText());
        assertFalse(status().path("timeApplied").asBoolean());

        // Old acknowledgements, client counters and unrelated telemetry cannot confirm a new rule.
        publish("nethera/1/telemetry/time", report(version - 1, true, true, null, true));
        publish("nethera/1/telemetry/time", report(version, true, true, null, true));
        await(() -> status().path("timeLimits").path(Long.toString(id)).path("applied").asBoolean() ? true : null);
        given().get("/api/router-control/status").then().body("timeApplied", equalTo(true))
                .body(path + ".blockedNow", equalTo(true)).body(path + ".usedMinutesToday", equalTo(12))
                .body(path + ".budgetMinutesToday", equalTo(120)).body(path + ".reason", equalTo("window"));

        // Replay and far-future packets must not overwrite the current report.
        QuarkusTransaction.requiringNew().run(() -> {
            Router router = em.find(Router.class, 1L);
            ingestor.ingest(router, new at.htlleonding.telemetry.TimeSample(100, version - 1, false, true, "old", java.util.Map.of()));
            var future = JSON.createObjectNode();
            try {
                future = (com.fasterxml.jackson.databind.node.ObjectNode) JSON.readTree(report(version, false, true, "future", true));
            } catch (Exception e) { throw new IllegalStateException(e); }
            future.put("ts", Instant.now().plusSeconds(3600).getEpochSecond());
            ingestor.ingest(router, TelemetryPayloadParser.time(future.toString()));
        });
        assertTrue(status().path("timeApplied").asBoolean());

        QuarkusTransaction.requiringNew().run(() -> ingestor.ingest(em.find(Router.class, 1L),
                TelemetryPayloadParser.time(report(version, true, true, null, false))));
        assertFalse(status().path("timeApplied").asBoolean(), "Missing device readback cannot confirm the full ruleset");

        publish("nethera/1/telemetry/time", report(version, false, true, "nft: test failure", true));
        await(() -> "nft: test failure".equals(status().path("timeError").asText()) ? true : null);
        given().get("/api/router-control/status").then().body("timeApplied", equalTo(false))
                .body(path + ".usedMinutesToday", nullValue());
        publish("nethera/1/telemetry/time", report(version, true, false, null, true));
        await(() -> status().path("timeApplied").asBoolean() ? true : null);
        given().get("/api/router-control/status").then().body(path + ".usedMinutesToday", nullValue())
                .body(path + ".clockSynced", equalTo(false));

        publish("nethera/1/status", "offline");
        await(() -> "offline".equals(status().path("connection").asText()) ? true : null);
        assertFalse(status().path("timeApplied").asBoolean());
        publish("nethera/1/status", "online");
        await(() -> "online".equals(status().path("connection").asText()) ? true : null);
        QuarkusTransaction.requiringNew().run(() -> em.find(TimeControlState.class, 1L).checkedAt = Instant.now().minusSeconds(600));
        assertFalse(status().path("timeApplied").asBoolean());

        // Identical saves retain the version; malformed requests do not replace the retained config.
        given().contentType(ContentType.JSON).body(body).put(endpoint).then().statusCode(200);
        assertEquals(version, retained("time").path("version").asLong());
        for (String invalid : new String[] {body.replace("21:00", "07:00"), body.replace("21:00", "25:00"),
                body.replace("120", "1441"), body.replace("active", "invalid")}) {
            given().contentType(ContentType.JSON).body(invalid).put(endpoint).then().statusCode(400);
        }
        assertEquals(desired, retained("time"));
        given().contentType(ContentType.JSON).body(body.replace("active", "paused")).put(endpoint).then().statusCode(200);
        JsonNode paused = await(() -> {
            var config = retained("time"); return config.path("version").asLong() > version ? config : null;
        });
        assertFalse(paused.path("devices").has(MAC)); assertFalse(status().path("timeApplied").asBoolean());
        publish("nethera/1/telemetry/time", report(paused.path("version").asLong(), true, true, null, false));
        await(() -> status().path("timeApplied").asBoolean() ? true : null);
        given().get("/api/router-control/status").then().body(path + ".applied", equalTo(true));

        given().contentType(ContentType.JSON).body(body.replace("120", "0")).put(endpoint).then().statusCode(200);
        JsonNode unlimited = await(() -> {
            var config = retained("time"); return config.path("devices").has(MAC) && config.path("devices").path(MAC).path("budgets").isEmpty() ? config : null;
        });
        given().delete(endpoint).then().statusCode(204);
        assertFalse(status().path("timeApplied").asBoolean());
        JsonNode deleted = await(() -> {
            var config = retained("time"); return config.path("version").asLong() > unlimited.path("version").asLong() ? config : null;
        });
        assertFalse(deleted.path("devices").has(MAC));
        publish("nethera/1/telemetry/time", report(deleted.path("version").asLong(), true, true, null, false));
        await(() -> status().path("timeApplied").asBoolean() ? true : null);
        assertFalse(status().path("timeLimits").has(Long.toString(id)));
        var cleared = MqttTelemetryTestResource.mosquitto.execInContainer("mosquitto_pub", "-h", "localhost",
                "-q", "1", "-r", "-n", "-t", "nethera/1/config/time");
        assertEquals(0, cleared.getExitCode());
        assertEquals(deleted, await(() -> retained("time")), "Retry must work with the general scheduler disabled");
        assertEquals(dnsBefore, retained("dns"), "Time changes must not modify DNS/adblock desired state");
    }

    private static String report(long version, boolean applied, boolean clock, String error, boolean device) {
        var root = JSON.createObjectNode().put("v", 1).put("ts", Instant.now().getEpochSecond()).put("version", version)
                .put("applied", applied).put("clockSynced", clock);
        if (error != null) root.put("error", error);
        var devices = root.putObject("devices");
        if (device) devices.putObject(MAC).put("usedMinutes", 12).put("budgetMinutes", 120).put("blocked", true).put("reason", "window");
        return root.toString();
    }
    private static JsonNode status() throws Exception {
        return JSON.readTree(given().get("/api/router-control/status").then().statusCode(200).extract().asString());
    }
    private static JsonNode retained(String topic) throws Exception {
        var result = MqttTelemetryTestResource.mosquitto.execInContainer("mosquitto_sub", "-h", "localhost",
                "-t", "nethera/1/config/" + topic, "-C", "1", "-W", "2");
        return result.getStdout().isBlank() ? null : JSON.readTree(result.getStdout());
    }
    private static <T> T await(Callable<T> probe) throws Exception {
        Instant deadline = Instant.now().plusSeconds(20);
        while (Instant.now().isBefore(deadline)) {
            T value = probe.call(); if (value != null) return value; Thread.sleep(100);
        }
        throw new AssertionError("No expected router state within 20 seconds");
    }
}
