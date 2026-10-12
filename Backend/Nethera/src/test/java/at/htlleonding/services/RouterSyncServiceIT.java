package at.htlleonding.services;

import at.htlleonding.boundary.PostgresTestResource;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

// #5: devices that disappear from the lease list go offline
@QuarkusTest
@WithTestResource(PostgresTestResource.class)
class RouterSyncServiceIT {

    private static final String LEASE_A = "1759579200 bb:00:00:00:00:0a 192.168.1.10 laptop *";
    private static final String LEASE_B = "1759579200 bb:00:00:00:00:0b 192.168.1.11 tablet *";

    @Inject
    RouterSyncService service;

    @Inject
    EntityManager entityManager;

    @Test
    void deviceMissingFromLeasesGoesOfflineOnce() {
        Set<String> reachable = Set.of("bb:00:00:00:00:0a", "bb:00:00:00:00:0b");
        sync(LEASE_A + "\n" + LEASE_B, reachable);
        assertEquals(Boolean.TRUE, online("bb:00:00:00:00:0b"));

        // Router rebooted / lease expired: tablet is no longer in the lease file
        sync(LEASE_A, reachable);
        assertEquals(Boolean.FALSE, online("bb:00:00:00:00:0b"));
        assertEquals(Boolean.TRUE, online("bb:00:00:00:00:0a"));
        assertEquals(1L, disconnects("tablet"));

        sync(LEASE_A, reachable);
        assertEquals(1L, disconnects("tablet"));
    }

    @Test
    void emptyLeaseListChangesNothing() {
        sync("1759579200 bb:00:00:00:00:0c 192.168.1.12 phone *", Set.of("bb:00:00:00:00:0c"));

        sync("", Set.of());

        assertEquals(Boolean.TRUE, online("bb:00:00:00:00:0c"));
    }

    private void sync(String leases, Set<String> reachable) {
        QuarkusTransaction.requiringNew().run(() -> {
            try {
                service.parseAndSaveLeases(entityManager.find(Router.class, 1L), leases, reachable, Set.of());
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
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
