package at.htlleonding.telemetry;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TelemetryFreshnessTest {

    private static final Instant START = Instant.parse("2026-10-04T12:00:00Z");

    private TelemetryFreshness freshness;

    @BeforeEach
    void setUp() {
        freshness = new TelemetryFreshness();
        freshness.mqttConfig = mock(MqttConfig.class);
        when(freshness.mqttConfig.staleAfter()).thenReturn(Duration.ofSeconds(180));
        at(START);
    }

    @Test
    void neverReceivedIsStale() {
        assertFalse(freshness.isFresh(1, TelemetryStream.SPEED));
    }

    @Test
    void recentMessageIsFresh() {
        freshness.markIngested(1, TelemetryStream.SPEED);
        at(START.plusSeconds(30));

        assertTrue(freshness.isFresh(1, TelemetryStream.SPEED));
        assertFalse(freshness.isFresh(1, TelemetryStream.DNS));
        assertFalse(freshness.isFresh(2, TelemetryStream.SPEED));
    }

    @Test
    void messageOlderThanStaleAfterIsStale() {
        freshness.markIngested(1, TelemetryStream.DNS);
        at(START.plusSeconds(180));
        assertTrue(freshness.isFresh(1, TelemetryStream.DNS));

        at(START.plusSeconds(181));
        assertFalse(freshness.isFresh(1, TelemetryStream.DNS));
    }

    @Test
    void metadataRequiresOnlineStatus() {
        freshness.markIngested(1, TelemetryStream.METADATA);
        assertFalse(freshness.isFresh(1, TelemetryStream.METADATA));

        freshness.setStatus(1, true);
        assertTrue(freshness.isFresh(1, TelemetryStream.METADATA));

        freshness.setStatus(1, false);
        assertFalse(freshness.isFresh(1, TelemetryStream.METADATA));
    }

    private void at(Instant instant) {
        freshness.clock = Clock.fixed(instant, ZoneOffset.UTC);
    }
}
