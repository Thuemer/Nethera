package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static at.htlleonding.telemetry.DnsIngestorTest.router;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MetadataIngestorTest {

    private MetadataIngestor ingestor;
    private Router router;

    @BeforeEach
    void setUp() {
        EntityManager entityManager = mock(EntityManager.class);
        ingestor = new MetadataIngestor();
        ingestor.entityManager = entityManager;
        router = router(1L);
        router.setModel("Old Model");
        router.setFirmware("OpenWrt 22.03");
        when(entityManager.merge(router)).thenReturn(router);
    }

    @Test
    void updatesModelFirmwareAndLastSeen() {
        ingestor.ingest(router, new MetadataSample("Cudy WR3000S", "OpenWrt 25.12.5"));

        assertEquals("Cudy WR3000S", router.getModel());
        assertEquals("OpenWrt 25.12.5", router.getFirmware());
        assertNotNull(router.getLastSeen());
    }

    @Test
    void missingOrEmptyFieldsKeepStoredValues() {
        ingestor.ingest(router, new MetadataSample("New Model", null));
        assertEquals("OpenWrt 22.03", router.getFirmware());

        ingestor.ingest(router, new MetadataSample("  ", ""));
        assertEquals("New Model", router.getModel());
        assertEquals("OpenWrt 22.03", router.getFirmware());
    }

    @Test
    void onlineRefreshesLastSeen() {
        ingestor.setOnline(router, true);

        assertTrue(router.getOnline());
        assertNotNull(router.getLastSeen());
    }

    @Test
    void offlineLeavesLastSeenUnchanged() {
        LocalDateTime lastSeen = LocalDateTime.of(2026, 10, 1, 12, 0);
        router.setLastSeen(lastSeen);

        ingestor.setOnline(router, false);

        assertFalse(router.getOnline());
        assertEquals(lastSeen, router.getLastSeen());
    }
}
