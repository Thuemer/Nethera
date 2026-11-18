package at.htlleonding.mqtt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import at.htlleonding.boundary.TestRouters;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Callable;

import static at.htlleonding.mqtt.MqttTelemetryTestResource.publish;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// End-to-end: REST write -> retained desired state on the broker -> router answer -> status endpoint
@QuarkusTest
@WithTestResource(MqttTelemetryTestResource.class)
class RouterControlIT {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Inject
    EntityManager em;

    // Router control acts on the caller's router; "max" owns router 1
    @BeforeEach
    void maxOwnsRouterOne() {
        TestRouters.own(em, "max", 1L);
    }

    @Test
    @TestSecurity(user = "max")
    void savedBlocklistReachesRouterAndStatusFollowsItsAnswer() throws Exception {
        publish("nethera/1/status", "online");

        String listId = String.valueOf(given().contentType(ContentType.JSON)
                .body("{\"routerId\":1,\"name\":\"Websites\",\"sourceType\":\"NETWORK\",\"urlPattern\":\"TikTok.com|adult\"}")
                .when().post("/api/security/blocklists")
                .then().statusCode(200).extract().path("id").toString());

        JsonNode desired = await(() -> {
            JsonNode message = retainedConfig();
            return message != null && message.path("network").toString().contains("tiktok.com") ? message : null;
        });
        assertEquals(1, desired.path("v").asInt());
        assertEquals("[\"tiktok.com\"]", desired.path("network").toString());
        assertEquals("{}", desired.path("devices").toString());
        assertTrue(!desired.path("adblock").asBoolean());
        long version = desired.path("version").asLong();
        assertTrue(version > 0);

        // Saved, but the router has not answered yet
        given().when().get("/api/router-control/status")
                .then().statusCode(200)
                .body("blocklists.'" + listId + "'.applied", equalTo(false))
                .body("capabilities.adblockInstall", equalTo(true));

        // An answer for an older version proves nothing
        publish("nethera/1/telemetry/control", control(version - 1, true, false, false, null));
        publish("nethera/1/telemetry/control", control(version, true, false, false, null));
        await(() -> given().when().get("/api/router-control/status").path("blocklists.'" + listId + "'.applied").equals(true) ? true : null);

        given().when().get("/api/router-control/status")
                .then().statusCode(200)
                .body("connection", equalTo("online"))
                .body("checkedAt", equalTo("2026-11-15T13:00:00Z"))
                .body("adblock.installed", equalTo(false))
                .body("adblock.applied", equalTo(true))
                .body("error", nullValue());

        // Install = adblock wanted; the new state goes out, confirmed only after the router's readback
        given().when().post("/api/router-control/adblock/install").then().statusCode(202);
        JsonNode withAdblock = await(() -> {
            JsonNode message = retainedConfig();
            return message != null && message.path("adblock").asBoolean() ? message : null;
        });
        long adblockVersion = withAdblock.path("version").asLong();
        assertTrue(adblockVersion > version);
        given().when().get("/api/router-control/status").then().body("adblock.applied", equalTo(false));

        publish("nethera/1/telemetry/control", control(adblockVersion, false, false, false, "adblock: apk add adblock-fast: no internet"));
        await(() -> "adblock: apk add adblock-fast: no internet".equals(
                given().when().get("/api/router-control/status").path("error")) ? true : null);
        given().when().get("/api/router-control/status").then()
                .body("adblock.applied", equalTo(false))
                .body("blocklists.'" + listId + "'.applied", equalTo(false));

        publish("nethera/1/telemetry/control", control(adblockVersion, true, true, true, null));
        await(() -> given().when().get("/api/router-control/status").path("adblock.applied").equals(true) ? true : null);
        given().when().get("/api/router-control/status").then()
                .body("adblock.installed", equalTo(true))
                .body("adblock.enabled", equalTo(true));
    }

    @Test
    void statusNeedsLogin() {
        given().when().get("/api/router-control/status").then().statusCode(401);
        given().when().post("/api/router-control/adblock/install").then().statusCode(401);
    }

    private static String control(long version, boolean applied, boolean installed, boolean enabled, String error) {
        return "{\"v\":1,\"ts\":1794747600,\"version\":" + version + ",\"applied\":" + applied
                + ",\"adblock\":{\"installed\":" + installed + ",\"enabled\":" + enabled + "}"
                + (error == null ? "" : ",\"error\":\"" + error + "\"") + "}";
    }

    // Reads the retained message like a router that has just connected
    private static JsonNode retainedConfig() throws Exception {
        var result = MqttTelemetryTestResource.mosquitto.execInContainer(
                "mosquitto_sub", "-h", "localhost", "-t", "nethera/1/config/dns", "-C", "1", "-W", "2");
        String out = result.getStdout().trim();
        return out.isEmpty() ? null : MAPPER.readTree(out);
    }

    private static <T> T await(Callable<T> probe) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(20));
        while (Instant.now().isBefore(deadline)) {
            T value = probe.call();
            if (value != null) return value;
            Thread.sleep(200);
        }
        throw new AssertionError("condition not met within 20s");
    }
}
