package at.htlleonding.boundary;

import at.htlleonding.model.ActivityLog;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.DnsStat;
import at.htlleonding.model.Router;
import at.htlleonding.model.SpeedStat;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.jwt.Claim;
import io.quarkus.test.security.jwt.JwtSecurity;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.lessThan;
import static org.junit.jupiter.api.Assertions.assertThrows;

@QuarkusTest
@WithTestResource(PostgresTestResource.class)
class BackendFixesIT {

    @Inject
    EntityManager entityManager;

    // #1: accounts are keyed by the token's sub, not by the (reusable) username

    @Test
    @TestSecurity(user = "max")
    @JwtSecurity(claims = {@Claim(key = "sub", value = "kc-original-max"), @Claim(key = "email", value = "max@example.com")})
    void accountIsKeyedBySubject() {
        given().when().get("/api/accounts/me")
                .then().statusCode(200)
                .body("keycloakSub", equalTo("kc-original-max"));
    }

    @Test
    @TestSecurity(user = "reused-name")
    @JwtSecurity(claims = {@Claim(key = "sub", value = "kc-new-user"), @Claim(key = "email", value = "new@example.com")})
    void newUserWithReusedUsernameGetsOwnAccount() {
        tx(() -> entityManager.createNativeQuery(
                        "INSERT INTO account (keycloak_sub, email) VALUES ('reused-name', 'old@example.com') ON CONFLICT DO NOTHING")
                .executeUpdate());

        given().when().get("/api/accounts/me")
                .then().statusCode(200)
                .body("keycloakSub", equalTo("kc-new-user"))
                .body("email", equalTo("new@example.com"));
    }

    // #2: router list returns bounded, recent data

    @Test
    @TestSecurity(user = "demo")
    void routerListIsBounded() {
        tx(() -> {
            Router router = entityManager.find(Router.class, 1L);
            LocalDateTime now = LocalDateTime.now();
            for (int i = 0; i < 1500; i++) {
                SpeedStat stat = new SpeedStat();
                stat.setRouter(router);
                stat.setTimestamp(now.minusSeconds(30L * i));
                stat.setDownloadSpeed(10.0);
                stat.setUploadSpeed(1.0);
                entityManager.persist(stat);
            }
            for (int i = 0; i < 60; i++) {
                ActivityLog log = new ActivityLog();
                log.setRouter(router);
                log.setEventType("CONNECTED");
                log.setDetails("bulk " + i);
                log.setTimestamp(now.minusMinutes(i));
                entityManager.persist(log);
            }
            entityManager.persist(dnsStat(router, LocalDate.now().minusDays(1).atTime(12, 0)));
            entityManager.persist(dnsStat(router, LocalDateTime.now()));
            return null;
        });

        given().when().get("/api/routers/list")
                .then().statusCode(200)
                .body("[0].speedStats", hasSize(1440))
                .body("[0].activityLogs", hasSize(50))
                .body("[0].dnsStats.timestamp", everyItem(greaterThanOrEqualTo(LocalDate.now().atStartOfDay().toString())));
    }

    // #3: (router, mac) is unique

    @Test
    void duplicateDeviceIsRejectedByDatabase() {
        tx(() -> {
            entityManager.persist(device("aa:aa:aa:aa:aa:01", true));
            return null;
        });
        assertThrows(Exception.class, () -> tx(() -> {
            entityManager.persist(device("aa:aa:aa:aa:aa:01", true));
            entityManager.flush();
            return null;
        }));
    }

    // #4: GET /api/devices no longer waits for an SSH sync

    @Test
    @TestSecurity(user = "demo")
    void devicesListIsReadOnlyAndFast() {
        given().when().get("/api/devices")
                .then().statusCode(200)
                .time(lessThan(1500L));
    }

    // #6: bad input is a 400, not a 500

    @Test
    @TestSecurity(user = "demo")
    void missingBodyIsBadRequest() {
        given().contentType(ContentType.JSON).when().put("/api/device-time-limits/1").then().statusCode(400);
        given().contentType(ContentType.JSON).when().put("/api/settings/account.theme").then().statusCode(400);
        given().contentType(ContentType.JSON).when().post("/api/security/presets").then().statusCode(400);
        given().contentType(ContentType.JSON).when().put("/api/configs/1").then().statusCode(400);
    }

    @Test
    @TestSecurity(user = "demo")
    void invalidTimeLimitValuesAreRejected() {
        Long deviceId = tx(() -> {
            ConnectedDevice device = device("aa:aa:aa:aa:aa:02", true);
            entityManager.persist(device);
            return device.getId();
        });

        given().contentType(ContentType.JSON).body("{\"dailyLimitMinutes\":60,\"blockedFrom\":\"25:99\",\"blockedUntil\":\"07:00\"}")
                .when().put("/api/device-time-limits/" + deviceId).then().statusCode(400);
        given().contentType(ContentType.JSON).body("{\"dailyLimitMinutes\":-5,\"blockedFrom\":\"21:00\",\"blockedUntil\":\"07:00\"}")
                .when().put("/api/device-time-limits/" + deviceId).then().statusCode(400);
        given().contentType(ContentType.JSON).body("{\"dailyLimitMinutes\":60,\"blockedFrom\":\"21:00\",\"blockedUntil\":\"07:00\"}")
                .when().put("/api/device-time-limits/" + deviceId).then().statusCode(200);
        given().contentType(ContentType.JSON).body("{\"name\":\"x\",\"blockedFrom\":\"later\"}")
                .when().post("/api/security/presets").then().statusCode(400);
    }

    private ConnectedDevice device(String mac, boolean online) {
        ConnectedDevice device = new ConnectedDevice();
        device.setRouter(entityManager.find(Router.class, 1L));
        device.setMacAddress(mac);
        device.setHostname("test-" + mac.substring(15));
        device.setIpAddress("192.168.1.50");
        device.setConnectionType("LAN");
        device.setOnline(online);
        return device;
    }

    private static DnsStat dnsStat(Router router, LocalDateTime timestamp) {
        DnsStat stat = new DnsStat();
        stat.setRouter(router);
        stat.setTimestamp(timestamp);
        stat.setTotalQueries(10);
        stat.setBlockedQueries(2);
        stat.setTrackersDetected(0);
        return stat;
    }

    private <T> T tx(java.util.concurrent.Callable<T> work) {
        return QuarkusTransaction.requiringNew().call(work);
    }
}
