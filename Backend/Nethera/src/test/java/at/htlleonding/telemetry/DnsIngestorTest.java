package at.htlleonding.telemetry;

import at.htlleonding.model.DnsStat;
import at.htlleonding.model.Router;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.*;

class DnsIngestorTest {

    private DnsIngestor ingestor;
    private EntityManager entityManager;
    private Router router;

    @BeforeEach
    void setUp() {
        entityManager = mock(EntityManager.class);
        ingestor = new DnsIngestor();
        ingestor.entityManager = entityManager;
        router = router(1L);
    }

    @Test
    void firstSampleOnlySetsBaseline() {
        ingestor.ingest(router, new DnsSample(100, 40));

        verify(entityManager, never()).persist(any());
    }

    @Test
    void subsequentSampleStoresDelta() {
        ingestor.ingest(router, new DnsSample(100, 40));
        ingestor.ingest(router, new DnsSample(130, 50));

        DnsStat stat = capturePersisted();
        assertEquals(40, stat.getTotalQueries());
        assertEquals(10, stat.getBlockedQueries());
        assertEquals(0, stat.getTrackersDetected());
        assertSame(router, stat.getRouter());
    }

    @Test
    void negativeDeltaIsDiscardedAndReplacesBaseline() {
        ingestor.ingest(router, new DnsSample(100, 40));
        ingestor.ingest(router, new DnsSample(5, 2));
        verify(entityManager, never()).persist(any());

        ingestor.ingest(router, new DnsSample(15, 4));
        DnsStat stat = capturePersisted();
        assertEquals(12, stat.getTotalQueries());
        assertEquals(2, stat.getBlockedQueries());
    }

    @Test
    void baselineIsKeptPerRouter() {
        Router other = router(2L);
        ingestor.ingest(router, new DnsSample(100, 40));
        ingestor.ingest(other, new DnsSample(1000, 400));

        verify(entityManager, never()).persist(any());

        ingestor.ingest(other, new DnsSample(1001, 401));
        assertEquals(2, capturePersisted().getTotalQueries());
    }

    private DnsStat capturePersisted() {
        ArgumentCaptor<DnsStat> captor = ArgumentCaptor.forClass(DnsStat.class);
        verify(entityManager).persist(captor.capture());
        return captor.getValue();
    }

    static Router router(long id) {
        Router router = new Router();
        router.setId(id);
        return router;
    }
}
