package at.htlleonding.mqtt;

import at.htlleonding.model.Router;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.function.Supplier;

import static at.htlleonding.mqtt.MqttTelemetryTestResource.publish;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// End-to-end: MQTT broker -> consumer -> ingestors -> Postgres
@QuarkusTest
@WithTestResource(MqttTelemetryTestResource.class)
class MqttTelemetryIT {

    @Inject
    EntityManager entityManager;

    @Test
    void ingestsEveryStreamAndSurvivesMalformedPayloads() throws Exception {
        long speedRows = count("SpeedStat");
        long dnsRows = count("DnsStat");

        publish("nethera/1/status", "online");
        publish("nethera/1/telemetry/metadata", "{\"v\":1,\"ts\":1000,\"model\":\"IT Router\",\"firmware\":\"OpenWrt IT\"}");
        publish("nethera/1/telemetry/speed", "{\"v\":1,\"ts\":1000,\"iface\":\"wan\",\"rxBytes\":1000000,\"txBytes\":500000}");
        publish("nethera/1/telemetry/speed", "{\"v\":1,\"ts\":1030,\"iface\":\"wan\",\"rxBytes\":38500000,\"txBytes\":4250000}");
        publish("nethera/1/telemetry/dns", "{\"v\":1,\"ts\":1000,\"forwarded\":100,\"answeredLocally\":40}");
        publish("nethera/1/telemetry/dns", "{not json");
        publish("nethera/1/telemetry/dns", "{\"v\":1,\"ts\":1030,\"forwarded\":130,\"answeredLocally\":50}");
        publish("nethera/1/telemetry/devices", """
                {"v":1,"ts":1030,"leases":[{"mac":"AA:BB:CC:00:00:01","ip":"192.168.1.50","hostname":"it-laptop"}],
                 "reachable":["aa:bb:cc:00:00:01"],"wifi":["aa:bb:cc:00:00:01"]}""");

        awaitTrue(() -> count("ActivityLog a WHERE a.details = 'it-laptop connected'") == 1);

        Router router = tx(() -> entityManager.find(Router.class, 1L));
        assertEquals("IT Router", router.getModel());
        assertEquals("OpenWrt IT", router.getFirmware());
        assertTrue(router.getOnline());

        assertEquals(speedRows + 1, count("SpeedStat"));
        assertEquals(10.0, (Double) single("SELECT s.downloadSpeed FROM SpeedStat s ORDER BY s.id DESC"));
        assertEquals(1.0, (Double) single("SELECT s.uploadSpeed FROM SpeedStat s ORDER BY s.id DESC"));

        // The malformed payload in between neither stopped the channel nor broke the delta chain
        assertEquals(dnsRows + 1, count("DnsStat"));
        assertEquals(40, (Integer) single("SELECT d.totalQueries FROM DnsStat d ORDER BY d.id DESC"));

        assertEquals("WIFI", single("SELECT d.connectionType FROM ConnectedDevice d WHERE d.macAddress = 'aa:bb:cc:00:00:01'"));

        publish("nethera/1/status", "offline");
        awaitTrue(() -> !tx(() -> entityManager.find(Router.class, 1L).getOnline()));
    }

    private long count(String entityAndWhere) {
        String alias = entityAndWhere.contains(" ") ? "" : " e";
        return tx(() -> entityManager.createQuery("SELECT COUNT(*) FROM " + entityAndWhere + alias, Long.class).getSingleResult());
    }

    private Object single(String jpql) {
        return tx(() -> entityManager.createQuery(jpql).setMaxResults(1).getSingleResult());
    }

    private <T> T tx(Supplier<T> work) {
        return QuarkusTransaction.requiringNew().call(work::get);
    }

    private static void awaitTrue(Supplier<Boolean> condition) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(20));
        while (Instant.now().isBefore(deadline)) {
            if (condition.get()) return;
            Thread.sleep(200);
        }
        throw new AssertionError("condition not met within 20s");
    }
}
