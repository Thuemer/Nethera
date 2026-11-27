package at.htlleonding.mqtt;

import at.htlleonding.model.Router;
import at.htlleonding.telemetry.ControlIngestor;
import at.htlleonding.telemetry.ControlSample;
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
        handler.controlIngestor = mock(ControlIngestor.class);
        handler.priorityControl = mock(at.htlleonding.control.PriorityControlService.class);
        handler.timeIngestor = mock(at.htlleonding.telemetry.TimeIngestor.class);
        handler.freshness = mock(TelemetryFreshness.class);

        router = new Router();
        router.setId(1L);
        when(handler.entityManager.find(Router.class, 1L)).thenReturn(router);
    }

    @Test
    void routesPriorityWithoutChangingTimeDnsOrConnectionFreshness() {
        String payload = "priority payload is validated by the independent ingestor";
        handler.handle("nethera/1/telemetry/priority", payload);
        verify(handler.priorityControl).ingest(1L, payload);
        verifyNoInteractions(handler.timeIngestor, handler.controlIngestor, handler.freshness);
        assertNull(router.getLastSeen());
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
    void controlAnswerIsStoredButDoesNotProveRouterIsAlive() {
        handler.handle("nethera/1/telemetry/control",
                "{\"v\":1,\"ts\":100,\"version\":7,\"applied\":false,\"adblock\":{\"installed\":true,\"enabled\":false},\"error\":\"nft: failed\"}");

        verify(handler.controlIngestor).ingest(router, new ControlSample(100, 7, false, true, false, "nft: failed"));
        // The answer is retained and also arrives after a backend restart
        assertNull(router.getLastSeen());
        verifyNoInteractions(handler.freshness);
    }

    @Test
    void timeAnswerDoesNotProveRouterIsAlive() {
        handler.handle("nethera/1/telemetry/time", TimePayloadParserTest.REPORT);
        verify(handler.timeIngestor).ingest(router, TelemetryPayloadParser.time(TimePayloadParserTest.REPORT));
        assertNull(router.getLastSeen());
        verifyNoInteractions(handler.freshness, handler.controlIngestor, handler.dnsIngestor);
    }

    @Test
    void controlAnswerWithoutAdblockStateIsRejected() {
        assertThrows(InvalidPayloadException.class,
                () -> handler.handle("nethera/1/telemetry/control", "{\"v\":1,\"ts\":100,\"version\":7,\"applied\":true}"));

        verifyNoInteractions(handler.controlIngestor);
    }

    @Test
    void ownDesiredStateMessagesAreIgnored() {
        handler.handle("nethera/1/config/dns", "{\"v\":1,\"version\":7,\"adblock\":true,\"network\":[],\"devices\":{}}");

        verifyNoInteractions(handler.entityManager, handler.controlIngestor, handler.freshness);
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
