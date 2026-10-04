package at.htlleonding.telemetry;

import at.htlleonding.model.ActivityLog;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import at.htlleonding.repository.ConnectedDevicesRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Set;

import static at.htlleonding.telemetry.DnsIngestorTest.router;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class DeviceIngestorTest {

    private static final String MAC = "aa:bb:cc:dd:ee:ff";

    private DeviceIngestor ingestor;
    private ConnectedDevicesRepository repository;
    private EntityManager entityManager;
    private Router router;
    private ConnectedDevice device;

    @BeforeEach
    void setUp() {
        repository = mock(ConnectedDevicesRepository.class);
        entityManager = mock(EntityManager.class);
        ingestor = new DeviceIngestor();
        ingestor.deviceRepository = repository;
        ingestor.entityManager = entityManager;
        router = router(1L);
        device = new ConnectedDevice();
        when(repository.syncDevice(eq(router), anyString(), anyString(), anyString(), anyBoolean(), anyString()))
                .thenReturn(device);
    }

    @Test
    void newReachableDeviceEmitsConnected() {
        when(repository.findByMac(router, MAC)).thenReturn(null);

        ingestor.ingest(router, snapshot("laptop", true));

        ActivityLog log = capturePersisted();
        assertEquals("CONNECTED", log.getEventType());
        assertEquals("laptop connected", log.getDetails());
        assertSame(router, log.getRouter());
        assertSame(device, log.getDevice());
    }

    @Test
    void newUnreachableDeviceEmitsNothing() {
        when(repository.findByMac(router, MAC)).thenReturn(null);

        ingestor.ingest(router, snapshot("laptop", false));

        verify(entityManager, never()).persist(any());
    }

    @Test
    void onlineDeviceGoingOfflineEmitsDisconnected() {
        when(repository.findByMac(router, MAC)).thenReturn(existing(true));

        ingestor.ingest(router, snapshot("laptop", false));

        ActivityLog log = capturePersisted();
        assertEquals("DISCONNECTED", log.getEventType());
        assertEquals("laptop disconnected", log.getDetails());
    }

    @Test
    void offlineDeviceComingBackEmitsConnected() {
        when(repository.findByMac(router, MAC)).thenReturn(existing(false));

        ingestor.ingest(router, snapshot("laptop", true));

        assertEquals("CONNECTED", capturePersisted().getEventType());
    }

    @Test
    void unchangedStateEmitsNothing() {
        // Covers the transport-switch case too: state comes from the DB, not from the previous transport
        when(repository.findByMac(router, MAC)).thenReturn(existing(true));

        ingestor.ingest(router, snapshot("laptop", true));

        verify(entityManager, never()).persist(any());
    }

    @Test
    void normalizesMacHostnameAndConnectionType() {
        when(repository.findByMac(router, MAC)).thenReturn(existing(true));
        DeviceSnapshot snapshot = new DeviceSnapshot(
                List.of(new DeviceSnapshot.Lease("AA:BB:CC:DD:EE:FF", "192.168.1.20", "*")),
                Set.of(MAC),
                Set.of(MAC));

        ingestor.ingest(router, snapshot);

        verify(repository).syncDevice(router, MAC, "192.168.1.20", "Unbekannt", true, "WIFI");
    }

    private DeviceSnapshot snapshot(String hostname, boolean reachable) {
        return new DeviceSnapshot(
                List.of(new DeviceSnapshot.Lease(MAC, "192.168.1.20", hostname)),
                reachable ? Set.of(MAC) : Set.of(),
                Set.of());
    }

    private ConnectedDevice existing(boolean online) {
        ConnectedDevice existing = new ConnectedDevice();
        existing.setMacAddress(MAC);
        existing.setOnline(online);
        return existing;
    }

    private ActivityLog capturePersisted() {
        ArgumentCaptor<ActivityLog> captor = ArgumentCaptor.forClass(ActivityLog.class);
        verify(entityManager).persist(captor.capture());
        return captor.getValue();
    }
}
