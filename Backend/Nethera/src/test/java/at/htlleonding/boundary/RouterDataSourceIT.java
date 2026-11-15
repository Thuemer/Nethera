package at.htlleonding.boundary;

import at.htlleonding.model.*;
import at.htlleonding.telemetry.*;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
@WithTestResource(PostgresTestResource.class)
@TestSecurity(user = "source-test")
class RouterDataSourceIT {
    @Inject EntityManager em;
    @Inject DeviceIngestor devices;
    @Inject SpeedIngestor speeds;
    @Inject DnsIngestor dns;

    @Test void onlyVerifiedTelemetryIsReturnedFromMixedTables() {
        Long id = QuarkusTransaction.requiringNew().call(() -> {
            Router router = new Router(); router.setName("Mixed source test");
            router.setModel("Seed model"); router.setFirmware("Seed firmware");
            em.persist(router);
            ConnectedDevice seed = new ConnectedDevice(); seed.setRouter(router);
            seed.setMacAddress("02:00:00:00:00:01"); seed.setHostname("Seed phone");
            em.persist(seed);
            SpeedStat seedSpeed = new SpeedStat(); seedSpeed.setRouter(router);
            seedSpeed.setTimestamp(LocalDateTime.now().plusMinutes(1)); seedSpeed.setDownloadSpeed(999.0);
            em.persist(seedSpeed);
            DnsStat seedDns = new DnsStat(); seedDns.setRouter(router); seedDns.setTimestamp(LocalDateTime.now());
            seedDns.setTotalQueries(99999); em.persist(seedDns);
            ActivityLog seedLog = new ActivityLog(); seedLog.setRouter(router);
            seedLog.setTimestamp(LocalDateTime.now()); seedLog.setDetails("Seed log"); em.persist(seedLog);

            devices.ingest(router, new DeviceSnapshot(List.of(new DeviceSnapshot.Lease("02:00:00:00:00:02", "192.0.2.22", "Real router phone")), Set.of("02:00:00:00:00:02"), Set.of()));
            speeds.ingestRate(router, new SpeedSample(7, 2));
            dns.ingest(router, new DnsSample(10, 2));
            dns.ingest(router, new DnsSample(13, 3));
            return router.getId();
        });
        var result = read(id);
        assertEquals("live", result.dataMode());
        assertEquals(1, result.devices().size());
        assertEquals("Real router phone", result.devices().getFirst().hostname());
        assertEquals(1, result.speedStats().size());
        assertEquals(7.0, result.speedStats().getFirst().downloadSpeed());
        assertEquals(1, result.dnsStats().size());
        assertEquals(4, result.dnsStats().getFirst().totalQueries());
        assertEquals(1, result.activityLogs().size());
        assertNull(result.model()); assertNull(result.firmware());

        QuarkusTransaction.requiringNew().run(() -> em.find(Router.class, id).recordContact(false));
        var offline = read(id);
        assertEquals("demo", offline.dataMode());
        assertTrue(offline.devices().isEmpty()); assertTrue(offline.speedStats().isEmpty());
        assertTrue(offline.dnsStats().isEmpty()); assertTrue(offline.activityLogs().isEmpty());
        assertEquals(2L, QuarkusTransaction.requiringNew().call(() -> em.createQuery("SELECT COUNT(d) FROM ConnectedDevice d WHERE d.router.id = :id", Long.class).setParameter("id", id).getSingleResult()));
    }

    @Test void onlineWithoutTelemetryHasEmptyStreamsNotDemo() {
        Long id = QuarkusTransaction.requiringNew().call(() -> {
            Router router = new Router(); router.setName("No measurements yet"); router.recordContact(true);
            em.persist(router); return router.getId();
        });
        var result = read(id);
        assertEquals("live", result.dataMode());
        assertTrue(result.devices().isEmpty()); assertTrue(result.speedStats().isEmpty());
    }

    private at.htlleonding.dto.RouterDto read(Long id) {
        return given().when().get("/api/routers/list").then().statusCode(200).extract().jsonPath()
                .getList("", at.htlleonding.dto.RouterDto.class).stream().filter(row -> row.id().equals(id)).findFirst().orElseThrow();
    }
}
