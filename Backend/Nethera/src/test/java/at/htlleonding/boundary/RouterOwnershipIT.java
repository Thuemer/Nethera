package at.htlleonding.boundary;

import at.htlleonding.model.*;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

// openspec change router-ownership. Every test builds its own routers so test order does not matter.
@QuarkusTest
@WithTestResource(PostgresTestResource.class)
class RouterOwnershipIT {

    @Inject
    EntityManager em;

    // Claim and release

    @Test
    void configuredPairingCodeIsSetOnTheSshRouter() {
        assertEquals("NETHERA-TEST", tx(() -> em.find(Router.class, 1L).getPairingCode()));
    }

    @Test
    @TestSecurity(user = "claim-ok")
    void claimIsCaseInsensitiveTrimmedAndIdempotent() {
        String code = code();
        Long routerId = router("Claim me", code, null);

        given().contentType(ContentType.JSON).body("{\"pairingCode\":\"  " + code.toLowerCase() + " \"}")
                .when().post("/api/routers/claim")
                .then().statusCode(200).body("id", equalTo(routerId.intValue()));
        assertEquals("claim-ok", ownerSub(routerId));

        given().contentType(ContentType.JSON).body("{\"pairingCode\":\"" + code + "\"}")
                .when().post("/api/routers/claim")
                .then().statusCode(200);
        given().when().get("/api/routers/list").then().statusCode(200)
                .body("id", contains(routerId.intValue()));
    }

    @Test
    @TestSecurity(user = "claim-unknown")
    void unknownCodeIsNotFound() {
        given().contentType(ContentType.JSON).body("{\"pairingCode\":\"DOES-NOT-EXIST\"}")
                .when().post("/api/routers/claim").then().statusCode(404);
    }

    @Test
    @TestSecurity(user = "claim-blank")
    void blankOrMissingCodeIsBadRequest() {
        given().contentType(ContentType.JSON).body("{\"pairingCode\":\"  \"}")
                .when().post("/api/routers/claim").then().statusCode(400);
        given().contentType(ContentType.JSON).body("{}")
                .when().post("/api/routers/claim").then().statusCode(400);
        given().contentType(ContentType.JSON)
                .when().post("/api/routers/claim").then().statusCode(400);
    }

    @Test
    @TestSecurity(user = "claim-late")
    void routerOwnedBySomeoneElseIsConflict() {
        String code = code();
        Long routerId = router("Taken", code, "claim-first");

        given().contentType(ContentType.JSON).body("{\"pairingCode\":\"" + code + "\"}")
                .when().post("/api/routers/claim").then().statusCode(409);
        assertEquals("claim-first", ownerSub(routerId));
    }

    @Test
    @TestSecurity(user = "claim-twice")
    void secondRouterForSameAccountIsConflict() {
        Long own = router("Mine", code(), "claim-twice");
        String otherCode = code();
        Long other = router("Second", otherCode, null);

        given().contentType(ContentType.JSON).body("{\"pairingCode\":\"" + otherCode + "\"}")
                .when().post("/api/routers/claim").then().statusCode(409);
        assertEquals("claim-twice", ownerSub(own));
        assertNull(ownerSub(other));
    }

    @Test
    @TestSecurity(user = "release-me")
    void releaseRemovesOwnershipOnce() {
        Long routerId = router("Release", code(), "release-me");

        given().when().delete("/api/routers/mine").then().statusCode(204);
        assertNull(ownerSub(routerId));
        given().when().get("/api/routers/list").then().statusCode(200).body("", hasSize(0));
        given().when().delete("/api/routers/mine").then().statusCode(404);
    }

    // Reads

    @Test
    @TestSecurity(user = "iso-a")
    void readsOnlyReturnTheCallersRouter() {
        Fixture mine = fixture("iso-a");
        Fixture other = fixture("iso-b");

        given().when().get("/api/routers/list").then().statusCode(200)
                .body("id", contains(mine.routerId.intValue()));
        given().when().get("/api/devices").then().statusCode(200)
                .body("id", contains(mine.deviceId.intValue()));
        given().when().get("/api/configs/list").then().statusCode(200)
                .body("id", contains(mine.configId.intValue()));
        given().when().get("/api/device-time-limits").then().statusCode(200)
                .body("deviceId", contains(mine.deviceId.intValue()));

        given().when().get("/api/security/state").then().statusCode(200)
                .body("devices.id", contains(mine.deviceId.intValue()))
                .body("groups.id", contains(mine.groupId.intValue()))
                .body("members.deviceId", contains(mine.deviceId.intValue()))
                .body("blocklists.id", contains(mine.blocklistId.intValue()))
                .body("presets.id", contains(mine.presetId.intValue()))
                .body("assignments.deviceId", contains(mine.deviceId.intValue()))
                .body("timeLimits.deviceId", contains(mine.deviceId.intValue()))
                .body("groups.id", not(hasItem(other.groupId.intValue())));
    }

    @Test
    @TestSecurity(user = "no-router")
    void userWithoutRouterGetsEmptyReadsAndNotFoundWrites() {
        given().when().get("/api/routers/list").then().statusCode(200).body("", hasSize(0));
        given().when().get("/api/devices").then().statusCode(200).body("", hasSize(0));
        given().when().get("/api/configs/list").then().statusCode(200).body("", hasSize(0));
        given().when().get("/api/device-time-limits").then().statusCode(200).body("", hasSize(0));
        given().when().get("/api/security/state").then().statusCode(200)
                .body("devices", hasSize(0)).body("groups", hasSize(0)).body("blocklists", hasSize(0));

        given().contentType(ContentType.JSON).body("{\"name\":\"x\"}")
                .when().post("/api/security/groups").then().statusCode(404);
        given().contentType(ContentType.JSON).body("{\"name\":\"x\"}")
                .when().post("/api/security/blocklists").then().statusCode(404);
    }

    // Writes

    @Test
    @TestSecurity(user = "writer-a")
    void foreignIdsAreNotFoundOnEveryWrite() {
        Fixture mine = fixture("writer-a");
        Fixture other = fixture("writer-b");
        String limit = "{\"dailyLimitMinutes\":60,\"blockedFrom\":\"21:00\",\"blockedUntil\":\"07:00\"}";

        given().contentType(ContentType.JSON).body(limit)
                .when().put("/api/device-time-limits/" + other.deviceId).then().statusCode(404);
        given().when().delete("/api/device-time-limits/" + other.deviceId).then().statusCode(404);
        given().contentType(ContentType.JSON).body("{\"routerName\":\"x\"}")
                .when().put("/api/configs/" + other.configId).then().statusCode(404);

        given().contentType(ContentType.JSON).body("{\"id\":" + other.groupId + ",\"name\":\"hijack\"}")
                .when().post("/api/security/groups").then().statusCode(404);
        given().when().delete("/api/security/groups/" + other.groupId).then().statusCode(404);
        assertNotNull(tx(() -> em.find(DeviceGroup.class, other.groupId)));

        given().when().put("/api/security/groups/" + mine.groupId + "/members/" + other.deviceId).then().statusCode(404);
        given().when().put("/api/security/groups/" + other.groupId + "/members/" + mine.deviceId).then().statusCode(404);
        given().when().delete("/api/security/groups/" + other.groupId + "/members/" + other.deviceId).then().statusCode(404);

        given().contentType(ContentType.JSON).body("{\"id\":" + other.blocklistId + ",\"name\":\"hijack\"}")
                .when().post("/api/security/blocklists").then().statusCode(404);
        given().contentType(ContentType.JSON).body("{\"name\":\"x\",\"blocklistId\":" + other.blocklistId + "}")
                .when().post("/api/security/groups").then().statusCode(404);
        given().contentType(ContentType.JSON).body("{\"id\":" + other.presetId + ",\"name\":\"hijack\"}")
                .when().post("/api/security/presets").then().statusCode(404);

        given().when().put("/api/security/devices/" + other.deviceId + "/preset/" + mine.presetId).then().statusCode(404);
        given().when().put("/api/security/devices/" + mine.deviceId + "/preset/" + other.presetId).then().statusCode(404);
        given().when().delete("/api/security/devices/" + other.deviceId + "/preset").then().statusCode(404);

        assertEquals(1L, tx(() -> em.createQuery("SELECT COUNT(a) FROM DevicePresetAssignment a WHERE a.deviceId = :id", Long.class)
                .setParameter("id", other.deviceId).getSingleResult()));
    }

    @Test
    @TestSecurity(user = "body-router")
    void routerIdInBlocklistBodyIsIgnored() {
        Fixture mine = fixture("body-router");
        Fixture other = fixture("body-router-other");

        Integer id = given().contentType(ContentType.JSON)
                .body("{\"routerId\":" + other.routerId + ",\"name\":\"Neu\",\"urlPattern\":\"example.com\"}")
                .when().post("/api/security/blocklists")
                .then().statusCode(200).body("routerId", equalTo(mine.routerId.intValue()))
                .extract().path("id");
        assertEquals(mine.routerId, tx(() -> em.find(BlockList.class, id.longValue()).getRouterId()));
    }

    @Test
    @TestSecurity(user = "own-writes")
    void ownWritesStillWork() {
        Fixture mine = fixture("own-writes");
        given().contentType(ContentType.JSON).body("{\"dailyLimitMinutes\":90,\"blockedFrom\":\"21:00\",\"blockedUntil\":\"07:00\"}")
                .when().put("/api/device-time-limits/" + mine.deviceId).then().statusCode(200);
        given().when().put("/api/security/groups/" + mine.groupId + "/members/" + mine.deviceId).then().statusCode(200);
        given().contentType(ContentType.JSON).body("{\"name\":\"Neue Gruppe\",\"blocklistId\":" + mine.blocklistId + "}")
                .when().post("/api/security/groups").then().statusCode(200);
        given().contentType(ContentType.JSON).body("{\"routerName\":\"Wohnzimmer\",\"dnsBlocking\":true}")
                .when().put("/api/configs/" + mine.configId).then().statusCode(200).body("routerName", equalTo("Wohnzimmer"));
    }

    // Fixtures

    record Fixture(Long routerId, Long deviceId, Long groupId, Long blocklistId, Long presetId, Long configId) {}

    private Fixture fixture(String ownerSub) {
        Long routerId = router("Router of " + ownerSub, code(), ownerSub);
        return tx(() -> {
            Router router = em.find(Router.class, routerId);
            ConnectedDevice device = new ConnectedDevice();
            device.setRouter(router);
            device.setMacAddress("02:00:00:00:00:01");
            device.setHostname("device of " + ownerSub);
            em.persist(device);

            BlockList blocklist = new BlockList();
            blocklist.setRouterId(routerId);
            blocklist.setName("list of " + ownerSub);
            blocklist.setSourceType("CUSTOM");
            blocklist.setUrlPattern("example.org");
            em.persist(blocklist);

            DeviceGroup group = new DeviceGroup();
            group.setRouterId(routerId);
            group.setName("group of " + ownerSub);
            em.persist(group);

            SecurityPreset preset = new SecurityPreset();
            preset.setRouterId(routerId);
            preset.setName("preset of " + ownerSub);
            em.persist(preset);

            DeviceGroupMember member = new DeviceGroupMember();
            member.setGroupId(group.getId());
            member.setDeviceId(device.getId());
            em.persist(member);

            DevicePresetAssignment assignment = new DevicePresetAssignment();
            assignment.setDeviceId(device.getId());
            assignment.setPresetId(preset.getId());
            assignment.setStatus("active");
            em.persist(assignment);

            DeviceTimeLimit limit = new DeviceTimeLimit();
            limit.setDevice(device);
            limit.setDailyLimitMinutes(60);
            limit.setUsedMinutesToday(0);
            limit.setStatus("active");
            em.persist(limit);

            Config config = new Config();
            config.setRouterId(routerId);
            config.setRouterName("config of " + ownerSub);
            em.persist(config);

            return new Fixture(routerId, device.getId(), group.getId(), blocklist.getBlocklistId(), preset.getId(), config.getId());
        });
    }

    private Long router(String name, String pairingCode, String ownerSub) {
        return tx(() -> {
            Router router = new Router();
            router.setName(name);
            router.setPairingCode(pairingCode);
            if (ownerSub != null) {
                Account owner = TestRouters.account(em, ownerSub);
                em.createQuery("UPDATE Router r SET r.owner = null WHERE r.owner = :owner")
                        .setParameter("owner", owner).executeUpdate();
                router.setOwner(owner);
            }
            em.persist(router);
            return router.getId();
        });
    }

    private String ownerSub(Long routerId) {
        return tx(() -> {
            Account owner = em.find(Router.class, routerId).getOwner();
            return owner == null ? null : owner.getKeycloakSub();
        });
    }

    private static String code() {
        return "T-" + UUID.randomUUID();
    }

    private <T> T tx(java.util.concurrent.Callable<T> work) {
        return QuarkusTransaction.requiringNew().call(work);
    }
}
