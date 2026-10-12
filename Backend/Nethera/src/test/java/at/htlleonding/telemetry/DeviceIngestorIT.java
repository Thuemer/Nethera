package at.htlleonding.telemetry;

import at.htlleonding.boundary.PostgresTestResource;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

// Devices that disappear from the lease list go offline (shared by SSH and MQTT)
@QuarkusTest
@WithTestResource(PostgresTestResource.class)
class DeviceIngestorIT {

    private static final DeviceSnapshot.Lease LAPTOP = new DeviceSnapshot.Lease("bb:00:00:00:00:0a", "192.168.1.10", "laptop");
    private static final DeviceSnapshot.Lease TABLET = new DeviceSnapshot.Lease("bb:00:00:00:00:0b", "192.168.1.11", "tablet");

    @Inject
    DeviceIngestor ingestor;

    @Inject
    EntityManager entityManager;

    @Test
    void deviceMissingFromLeasesGoesOfflineOnce() {
        Set<String> reachable = Set.of(LAPTOP.mac(), TABLET.mac());
        ingest(List.of(LAPTOP, TABLET), reachable);
        assertEquals(Boolean.TRUE, online(TABLET.mac()));

        // Router rebooted / lease expired: tablet is no longer in the lease file
        ingest(List.of(LAPTOP), reachable);
        assertEquals(Boolean.FALSE, online(TABLET.mac()));
        assertEquals(Boolean.TRUE, online(LAPTOP.mac()));
        assertEquals(1L, disconnects("tablet"));

        ingest(List.of(LAPTOP), reachable);
        assertEquals(1L, disconnects("tablet"));
    }

    @Test
    void emptyLeaseListChangesNothing() {
        DeviceSnapshot.Lease phone = new DeviceSnapshot.Lease("bb:00:00:00:00:0c", "192.168.1.12", "phone");
        ingest(List.of(phone), Set.of(phone.mac()));

        ingest(List.of(), Set.of());

        assertEquals(Boolean.TRUE, online(phone.mac()));
    }

    private void ingest(List<DeviceSnapshot.Lease> leases, Set<String> reachable) {
        QuarkusTransaction.requiringNew().run(() ->
                ingestor.ingest(entityManager.find(Router.class, 1L), new DeviceSnapshot(leases, reachable, Set.of())));
    }

    private Boolean online(String mac) {
        return QuarkusTransaction.requiringNew().call(() -> entityManager.createQuery(
                        "SELECT d FROM ConnectedDevice d WHERE d.macAddress = :mac", ConnectedDevice.class)
                .setParameter("mac", mac).getSingleResult().getOnline());
    }

    private long disconnects(String hostname) {
        return QuarkusTransaction.requiringNew().call(() -> entityManager.createQuery(
                        "SELECT COUNT(a) FROM ActivityLog a WHERE a.details = :details", Long.class)
                .setParameter("details", hostname + " disconnected").getSingleResult());
    }
}
