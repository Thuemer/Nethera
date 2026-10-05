package at.htlleonding.telemetry;

import at.htlleonding.model.DnsStat;
import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@ApplicationScoped
public class DnsIngestor {

    @Inject
    EntityManager entityManager;

    // Baseline per router, shared by SSH and MQTT so a transport switch keeps the delta chain
    private final Map<Long, DnsSample> baselines = new HashMap<>();

    @Transactional
    public synchronized void ingest(Router router, DnsSample sample) {
        DnsSample previous = baselines.put(router.getId(), sample);
        if (previous == null) {
            return;
        }

        long deltaForwarded = sample.forwarded() - previous.forwarded();
        long deltaAnswered = sample.answeredLocally() - previous.answeredLocally();

        // dnsmasq restarted and counters reset: new sample is already the baseline
        if (deltaForwarded < 0 || deltaAnswered < 0) {
            return;
        }

        DnsStat stat = new DnsStat();
        stat.setTotalQueries((int) (deltaForwarded + deltaAnswered));
        stat.setBlockedQueries((int) deltaAnswered);
        stat.setTrackersDetected(0);
        stat.setTimestamp(LocalDateTime.now());
        stat.setRouter(router);
        entityManager.persist(stat);
    }
}
