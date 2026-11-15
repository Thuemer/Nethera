package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;


@ApplicationScoped
public class MetadataIngestor {

    @Inject
    EntityManager entityManager;

    // Only previously verified metadata may survive a partial router update.
    @Transactional
    public void ingest(Router router, MetadataSample sample) {
        if (!router.isRouterData()) {
            router.setModel(null);
            router.setFirmware(null);
        }
        if (hasText(sample.model())) router.setModel(sample.model());
        if (hasText(sample.firmware())) router.setFirmware(sample.firmware());
        router.setDataSource(Router.DataSource.ROUTER);
        // MQTT metadata can be retained; it does not prove a current connection.
        entityManager.merge(router);
    }

    // Online refreshes lastSeen, offline leaves it unchanged
    @Transactional
    public void setOnline(Router router, boolean online) {
        router.recordContact(online);
        entityManager.merge(router);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
