package at.htlleonding.services;

import at.htlleonding.model.Router;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

@ApplicationScoped
public class RouterSyncScheduler {

    private static final Logger LOG = Logger.getLogger(RouterSyncScheduler.class);

    @Inject
    RouterSyncService routerSyncService;

    @Inject
    RouterMetricsSyncService routerMetricsSyncService;

    @Inject
    EntityManager entityManager;

    @Scheduled(every = "${nethera.sync.interval}")
    public void syncAll() {
        Router router = findRouter();
        if (router == null) {
            LOG.warn("Scheduler: Router with ID 1 not found, skipping sync cycle");
            return;
        }

        try {
            routerMetricsSyncService.syncRouterMetadata(router);
        } catch (Exception e) {
            LOG.warn("Scheduler: syncRouterMetadata failed: " + e.getMessage());
        }

        try {
            routerMetricsSyncService.syncSpeed(router);
        } catch (Exception e) {
            LOG.warn("Scheduler: syncSpeed failed: " + e.getMessage());
        }

        try {
            routerMetricsSyncService.syncDnsStats(router);
        } catch (Exception e) {
            LOG.warn("Scheduler: syncDnsStats failed: " + e.getMessage());
        }

        try {
            routerSyncService.syncDhcpLeases(router);
        } catch (Exception e) {
            LOG.warn("Scheduler: syncDhcpLeases failed: " + e.getMessage());
        }
    }

    @Transactional
    public Router findRouter() {
        return entityManager.find(Router.class, 1L);
    }
}
