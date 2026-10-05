package at.htlleonding.telemetry;

import at.htlleonding.model.ActivityLog;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import at.htlleonding.repository.ConnectedDevicesRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.LocalDateTime;

@ApplicationScoped
public class DeviceIngestor {

    static final String UNKNOWN_HOSTNAME = "Unbekannt";

    @Inject
    ConnectedDevicesRepository deviceRepository;

    @Inject
    EntityManager entityManager;

    @Transactional
    public void ingest(Router router, DeviceSnapshot snapshot) {
        for (DeviceSnapshot.Lease lease : snapshot.leases()) {
            String mac = lease.mac().toLowerCase();
            String hostname = normalizeHostname(lease.hostname());
            boolean isOnline = snapshot.reachableMacs().contains(mac);
            String connectionType = snapshot.wifiMacs().contains(mac) ? "WIFI" : "LAN";

            ConnectedDevice existing = deviceRepository.findByMac(router, mac);
            boolean wasNew = existing == null;
            boolean wasOnline = existing != null && Boolean.TRUE.equals(existing.getOnline());

            ConnectedDevice device = deviceRepository.syncDevice(router, mac, lease.ip(), hostname, isOnline, connectionType);

            if (isOnline && !wasOnline) {
                emitActivityLog(router, device, "CONNECTED", hostname + " connected");
            } else if (!wasNew && wasOnline && !isOnline) {
                emitActivityLog(router, device, "DISCONNECTED", hostname + " disconnected");
            }
        }
    }

    private static String normalizeHostname(String hostname) {
        if (hostname == null || hostname.isBlank() || hostname.equals("*")) {
            return UNKNOWN_HOSTNAME;
        }
        return hostname;
    }

    private void emitActivityLog(Router router, ConnectedDevice device, String eventType, String details) {
        ActivityLog log = new ActivityLog();
        log.setEventType(eventType);
        log.setDetails(details);
        log.setTimestamp(LocalDateTime.now());
        log.setRouter(router);
        log.setDevice(device);
        entityManager.persist(log);
    }
}
