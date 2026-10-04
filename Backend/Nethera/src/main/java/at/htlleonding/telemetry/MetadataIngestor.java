package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.LocalDateTime;

@ApplicationScoped
public class MetadataIngestor {

    @Inject
    EntityManager entityManager;

    // Updates model/firmware and lastSeen; null or blank fields keep the stored value
    @Transactional
    public void ingest(Router router, MetadataSample sample) {
        Router managed = entityManager.merge(router);
        if (hasText(sample.model())) managed.setModel(sample.model());
        if (hasText(sample.firmware())) managed.setFirmware(sample.firmware());
        managed.setLastSeen(LocalDateTime.now());
    }

    // Online refreshes lastSeen, offline leaves it unchanged
    @Transactional
    public void setOnline(Router router, boolean online) {
        Router managed = entityManager.merge(router);
        managed.setOnline(online);
        if (online) {
            managed.setLastSeen(LocalDateTime.now());
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
