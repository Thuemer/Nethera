package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import at.htlleonding.model.SpeedStat;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@ApplicationScoped
public class SpeedIngestor {

    private static final double BYTES_PER_MBIT = 125000.0;

    @Inject
    EntityManager entityManager;

    private final Map<Long, CounterSample> baselines = new HashMap<>();

    @Transactional
    public void ingestRate(Router router, SpeedSample sample) {
        SpeedStat stat = new SpeedStat();
        stat.setDownloadSpeed(sample.downloadMbps());
        stat.setUploadSpeed(sample.uploadMbps());
        stat.setTimestamp(LocalDateTime.now());
        stat.setRouter(router);
        entityManager.persist(stat);
    }

    // Rate = Δbytes / Δts between two consecutive counter samples of the same router
    @Transactional
    public synchronized void ingestCounters(Router router, CounterSample sample) {
        CounterSample previous = baselines.put(router.getId(), sample);
        if (previous == null) {
            return;
        }

        long seconds = sample.ts() - previous.ts();
        long deltaRx = sample.rxBytes() - previous.rxBytes();
        long deltaTx = sample.txBytes() - previous.txBytes();

        // Router reboot, counter wrap or clock jump: new sample is already the baseline
        if (seconds <= 0 || deltaRx < 0 || deltaTx < 0) {
            return;
        }

        ingestRate(router, new SpeedSample(toMbps(deltaRx, seconds), toMbps(deltaTx, seconds)));
    }

    static double toMbps(long bytes, double seconds) {
        return Math.round((bytes / seconds / BYTES_PER_MBIT) * 10.0) / 10.0;
    }
}
