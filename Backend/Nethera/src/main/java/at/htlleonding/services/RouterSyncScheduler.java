package at.htlleonding.services;

import at.htlleonding.model.Router;
import at.htlleonding.telemetry.TelemetryStream;
import at.htlleonding.telemetry.TransportSelector;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.function.Consumer;

@ApplicationScoped
public class RouterSyncScheduler {

    private static final Logger LOG = Logger.getLogger(RouterSyncScheduler.class);

    @Inject
    RouterSyncService routerSyncService;

    @Inject
    RouterMetricsSyncService routerMetricsSyncService;

    @Inject
    TransportSelector transportSelector;

    @Inject
    EntityManager entityManager;

    // The router that nethera.router.ip / ssh-key-path point to; MQTT covers any router
    @ConfigProperty(name = "nethera.router.id", defaultValue = "1")
    Long sshRouterId;

    @Scheduled(every = "${nethera.sync.interval}")
    public void syncAll() {
        if (!transportSelector.sshEnabled()) {
            return;
        }

        Router router = findRouter();
        if (router == null) {
            LOG.warn("Scheduler: Router with ID " + sshRouterId + " not found, skipping sync cycle");
            return;
        }

        sync(router, TelemetryStream.METADATA, "syncRouterMetadata", routerMetricsSyncService::syncRouterMetadata);
        sync(router, TelemetryStream.SPEED, "syncSpeed", routerMetricsSyncService::syncSpeed);
        sync(router, TelemetryStream.DNS, "syncDnsStats", routerMetricsSyncService::syncDnsStats);
        sync(router, TelemetryStream.DEVICES, "syncDhcpLeases", routerSyncService::syncDhcpLeases);
    }

    private void sync(Router router, TelemetryStream stream, String name, Consumer<Router> operation) {
        if (!transportSelector.useSsh(router.getId(), stream)) {
            return;
        }
        try {
            operation.accept(router);
        } catch (Exception e) {
            LOG.warn("Scheduler: " + name + " failed: " + e.getMessage());
        }
    }

    @Transactional
    public Router findRouter() {
        return entityManager.find(Router.class, sshRouterId);
    }
}
