package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import at.htlleonding.model.SpeedStat;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static at.htlleonding.telemetry.DnsIngestorTest.router;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.*;

class SpeedIngestorTest {

    private SpeedIngestor ingestor;
    private EntityManager entityManager;
    private Router router;

    @BeforeEach
    void setUp() {
        entityManager = mock(EntityManager.class);
        ingestor = new SpeedIngestor();
        ingestor.entityManager = entityManager;
        router = router(1L);
    }

    @Test
    void rateIsPersistedAsIs() {
        ingestor.ingestRate(router, new SpeedSample(12.3, 4.5));

        SpeedStat stat = capturePersisted();
        assertEquals(12.3, stat.getDownloadSpeed());
        assertEquals(4.5, stat.getUploadSpeed());
        assertSame(router, stat.getRouter());
    }

    @Test
    void firstCounterSampleOnlySetsBaseline() {
        ingestor.ingestCounters(router, new CounterSample(1_000, 500, 1000));

        verify(entityManager, never()).persist(any());
    }

    @Test
    void consecutiveCounterSamplesComputeRate() {
        ingestor.ingestCounters(router, new CounterSample(1_000_000, 500_000, 1000));
        ingestor.ingestCounters(router, new CounterSample(38_500_000, 4_250_000, 1030));

        SpeedStat stat = capturePersisted();
        assertEquals(10.0, stat.getDownloadSpeed());
        assertEquals(1.0, stat.getUploadSpeed());
    }

    @Test
    void counterResetIsDiscardedAndReplacesBaseline() {
        ingestor.ingestCounters(router, new CounterSample(1_000_000, 500_000, 1000));
        ingestor.ingestCounters(router, new CounterSample(10, 10, 1030));
        verify(entityManager, never()).persist(any());

        ingestor.ingestCounters(router, new CounterSample(1_250_010, 10, 1040));
        assertEquals(1.0, capturePersisted().getDownloadSpeed());
    }

    @Test
    void nonIncreasingTimestampIsDiscarded() {
        ingestor.ingestCounters(router, new CounterSample(1_000, 1_000, 1000));
        ingestor.ingestCounters(router, new CounterSample(2_000, 2_000, 1000));
        ingestor.ingestCounters(router, new CounterSample(3_000, 3_000, 990));

        verify(entityManager, never()).persist(any());
    }

    private SpeedStat capturePersisted() {
        ArgumentCaptor<SpeedStat> captor = ArgumentCaptor.forClass(SpeedStat.class);
        verify(entityManager).persist(captor.capture());
        return captor.getValue();
    }
}
