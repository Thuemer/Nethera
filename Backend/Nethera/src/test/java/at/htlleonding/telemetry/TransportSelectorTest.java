package at.htlleonding.telemetry;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TransportSelectorTest {

    private TransportSelector selector;
    private TelemetryFreshness freshness;
    private TelemetryMode mode;

    @BeforeEach
    void setUp() {
        freshness = mock(TelemetryFreshness.class);
        selector = new TransportSelector();
        selector.telemetryConfig = () -> mode;
        selector.freshness = freshness;
    }

    @Test
    void sshModeAlwaysUsesSsh() {
        mode = TelemetryMode.SSH;
        when(freshness.isFresh(anyLong(), any())).thenReturn(true);

        assertTrue(selector.sshEnabled());
        assertTrue(selector.useSsh(1, TelemetryStream.SPEED));
    }

    @Test
    void mqttModeNeverUsesSsh() {
        mode = TelemetryMode.MQTT;

        assertFalse(selector.sshEnabled());
        assertFalse(selector.useSsh(1, TelemetryStream.SPEED));
    }

    @Test
    void autoModeFollowsFreshnessPerStream() {
        mode = TelemetryMode.AUTO;
        when(freshness.isFresh(1, TelemetryStream.SPEED)).thenReturn(true);

        assertTrue(selector.sshEnabled());
        assertFalse(selector.useSsh(1, TelemetryStream.SPEED));
        assertTrue(selector.useSsh(1, TelemetryStream.DEVICES));
    }

    @Test
    void autoModeSwitchesBackWhenStreamGoesStale() {
        mode = TelemetryMode.AUTO;
        when(freshness.isFresh(1, TelemetryStream.DNS)).thenReturn(true);
        assertFalse(selector.useSsh(1, TelemetryStream.DNS));

        when(freshness.isFresh(1, TelemetryStream.DNS)).thenReturn(false);
        assertTrue(selector.useSsh(1, TelemetryStream.DNS));
        assertTrue(selector.useSsh(1, TelemetryStream.DNS));
    }
}
