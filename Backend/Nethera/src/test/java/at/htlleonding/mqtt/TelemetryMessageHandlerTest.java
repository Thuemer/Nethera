package at.htlleonding.mqtt;

import at.htlleonding.model.Router;
import at.htlleonding.telemetry.CounterSample;
import at.htlleonding.telemetry.DeviceIngestor;
import at.htlleonding.telemetry.DnsIngestor;
import at.htlleonding.telemetry.DnsSample;
import at.htlleonding.telemetry.MetadataIngestor;
import at.htlleonding.telemetry.SpeedIngestor;
import at.htlleonding.telemetry.TelemetryFreshness;
import at.htlleonding.telemetry.TelemetryStream;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TelemetryMessageHandlerTest {

    private TelemetryMessageHandler handler;
    private Router router;

    @BeforeEach
    void setUp() {
        handler = new TelemetryMessageHandler();
        handler.entityManager = mock(EntityManager.class);
        handler.metadataIngestor = mock(MetadataIngestor.class);
        handler.speedIngestor = mock(SpeedIngestor.class);
        handler.dnsIngestor = mock(DnsIngestor.class);
        handler.deviceIngestor = mock(DeviceIngestor.class);
        handler.freshness = mock(TelemetryFreshness.class);

        router = new Router();
        router.setId(1L);
        when(handler.entityManager.find(Router.class, 1L)).thenReturn(router);
    }

    @Test
    void routesSpeedToIngestorAndMarksFresh() {
        handler.handle("nethera/1/telemetry/speed", "{\"v\":1,\"ts\":100,\"iface\":\"wan\",\"rxBytes\":5,\"txBytes\":6}");

        verify(handler.speedIngestor).ingestCounters(router, new CounterSample(5, 6, 100));
        verify(handler.freshness).markIngested(1L, TelemetryStream.SPEED);
    }

    @Test
    void routesDnsToIngestorAndMarksFresh() {
        handler.handle("nethera/1/telemetry/dns", "{\"v\":1,\"ts\":100,\"forwarded\":7,\"answeredLocally\":3}");

        verify(handler.dnsIngestor).ingest(router, new DnsSample(7, 3));
        verify(handler.freshness).markIngested(1L, TelemetryStream.DNS);
    }

    @Test
    void validTelemetryRefreshesLastSeen() {
        handler.handle("nethera/1/telemetry/dns", "{\"v\":1,\"ts\":100,\"forwarded\":7,\"answeredLocally\":3}");

        assertNotNull(router.getLastSeen());
    }

    @Test
    void unknownRouterIsDiscarded() {
        handler.handle("nethera/99/telemetry/dns", "{\"v\":1,\"ts\":100,\"forwarded\":7,\"answeredLocally\":3}");

        verifyNoInteractions(handler.dnsIngestor, handler.freshness);
    }

    @Test
    void invalidPayloadIsNotIngestedOrMarkedFresh() {
        assertThrows(InvalidPayloadException.class,
                () -> handler.handle("nethera/1/telemetry/dns", "{\"v\":1,\"ts\":100}"));

        verifyNoInteractions(handler.dnsIngestor, handler.freshness);
        assertNull(router.getLastSeen());
    }

    @Test
    void onlineStatusSetsRouterOnline() {
        handler.handle("nethera/1/status", "online\n");

        verify(handler.metadataIngestor).setOnline(router, true);
        verify(handler.freshness).setStatus(1L, true);
    }

    @Test
    void offlineStatusSetsRouterOffline() {
        handler.handle("nethera/1/status", "offline");

        verify(handler.metadataIngestor).setOnline(router, false);
        verify(handler.freshness).setStatus(1L, false);
    }

    @Test
    void unknownTopicIsIgnored() {
        handler.handle("nethera/1/commands/reboot", "{}");

        verifyNoInteractions(handler.entityManager, handler.metadataIngestor, handler.freshness);
    }

    @Test
    void unknownStatusIsRejected() {
        assertThrows(InvalidPayloadException.class, () -> handler.handle("nethera/1/status", "sleeping"));

        verify(handler.metadataIngestor, never()).setOnline(any(), anyBoolean());
    }
}
