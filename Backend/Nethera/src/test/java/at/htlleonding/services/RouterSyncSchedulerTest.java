package at.htlleonding.services;

import at.htlleonding.model.Router;
import at.htlleonding.telemetry.TelemetryStream;
import at.htlleonding.telemetry.TransportSelector;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

class RouterSyncSchedulerTest {

    private RouterSyncScheduler scheduler;
    private RouterSyncService routerSyncService;
    private RouterMetricsSyncService metricsSyncService;
    private TransportSelector selector;
    private EntityManager entityManager;
    private Router router;

    @BeforeEach
    void setUp() {
        routerSyncService = mock(RouterSyncService.class);
        metricsSyncService = mock(RouterMetricsSyncService.class);
        selector = mock(TransportSelector.class);
        entityManager = mock(EntityManager.class);

        scheduler = new RouterSyncScheduler();
        scheduler.routerSyncService = routerSyncService;
        scheduler.routerMetricsSyncService = metricsSyncService;
        scheduler.transportSelector = selector;
        scheduler.entityManager = entityManager;
        scheduler.sshRouterId = 1L;

        router = new Router();
        router.setId(1L);
        when(entityManager.find(Router.class, 1L)).thenReturn(router);
    }

    @Test
    void runsAllOperationsWhenEveryStreamNeedsSsh() {
        when(selector.sshEnabled()).thenReturn(true);
        when(selector.useSsh(anyLong(), any())).thenReturn(true);

        scheduler.syncAll();

        verifyAllSsh();
    }

    @Test
    void opensNoSshWhenSshIsDisabled() {
        when(selector.sshEnabled()).thenReturn(false);

        scheduler.syncAll();

        verifyNoInteractions(routerSyncService, metricsSyncService, entityManager);
    }

    @Test
    void skipsOnlyStreamsServedByMqtt() {
        when(selector.sshEnabled()).thenReturn(true);
        when(selector.useSsh(anyLong(), any())).thenReturn(true);
        when(selector.useSsh(1L, TelemetryStream.SPEED)).thenReturn(false);

        scheduler.syncAll();

        verify(metricsSyncService, never()).syncSpeed(any());
        verify(metricsSyncService).syncRouterMetadata(router);
        verify(metricsSyncService).syncDnsStats(router);
        verify(routerSyncService).syncDhcpLeases(router);
    }

    @Test
    void failingOperationDoesNotStopTheOthers() {
        when(selector.sshEnabled()).thenReturn(true);
        when(selector.useSsh(anyLong(), any())).thenReturn(true);
        doThrow(new RuntimeException("boom")).when(metricsSyncService).syncSpeed(router);

        scheduler.syncAll();

        verifyAllSsh();
    }

    private void verifyAllSsh() {
        verify(metricsSyncService).syncRouterMetadata(router);
        verify(metricsSyncService).syncSpeed(router);
        verify(metricsSyncService).syncDnsStats(router);
        verify(routerSyncService).syncDhcpLeases(router);
    }
}
