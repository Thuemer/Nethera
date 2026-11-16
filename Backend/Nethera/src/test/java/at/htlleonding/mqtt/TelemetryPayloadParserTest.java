package at.htlleonding.mqtt;

import at.htlleonding.telemetry.CounterSample;
import at.htlleonding.telemetry.DeviceSnapshot;
import at.htlleonding.telemetry.DnsSample;
import at.htlleonding.telemetry.MetadataSample;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class TelemetryPayloadParserTest {

    @Test
    void parsesMetadata() {
        MetadataSample sample = TelemetryPayloadParser.metadata(
                "{\"v\":1,\"ts\":1759579200,\"model\":\"Cudy WR3000S\",\"firmware\":\"OpenWrt 25.12.5\"}");

        assertEquals(new MetadataSample("Cudy WR3000S", "OpenWrt 25.12.5"), sample);
    }

    @Test
    void metadataFieldsAreOptional() {
        assertEquals(new MetadataSample("Cudy WR3000S", null), TelemetryPayloadParser.metadata(
                "{\"v\":1,\"ts\":1759579200,\"model\":\"Cudy WR3000S\"}"));
        assertEquals(new MetadataSample(null, ""), TelemetryPayloadParser.metadata(
                "{\"v\":1,\"ts\":1759579200,\"model\":null,\"firmware\":\"\"}"));
    }

    @Test
    void rejectsNonStringMetadataField() {
        assertInvalid(() -> TelemetryPayloadParser.metadata("{\"v\":1,\"ts\":1,\"model\":42}"), "model");
    }

    @Test
    void parsesSpeed() {
        CounterSample sample = TelemetryPayloadParser.speed(
                "{\"v\":1,\"ts\":1759579200,\"iface\":\"wan\",\"rxBytes\":123456789012,\"txBytes\":42}");

        assertEquals(new CounterSample(123456789012L, 42, 1759579200), sample);
    }

    @Test
    void parsesDns() {
        DnsSample sample = TelemetryPayloadParser.dns(
                "{\"v\":1,\"ts\":1759579200,\"forwarded\":120,\"answeredLocally\":30}");

        assertEquals(new DnsSample(120, 30), sample);
    }

    @Test
    void parsesDevicesAndNormalizesMacs() {
        DeviceSnapshot snapshot = TelemetryPayloadParser.devices("""
                {"v":1,"ts":1759579200,
                 "leases":[{"mac":"AA:BB:CC:DD:EE:FF","ip":"192.168.1.20","hostname":"laptop"},
                           {"mac":"11:22:33:44:55:66","ip":"192.168.1.21"}],
                 "reachable":["AA:BB:CC:DD:EE:FF"],
                 "wifi":[]}
                """);

        assertEquals(2, snapshot.leases().size());
        assertEquals(new DeviceSnapshot.Lease("aa:bb:cc:dd:ee:ff", "192.168.1.20", "laptop"), snapshot.leases().get(0));
        assertNull(snapshot.leases().get(1).hostname());
        assertEquals(Set.of("aa:bb:cc:dd:ee:ff"), snapshot.reachableMacs());
        assertEquals(Set.of(), snapshot.wifiMacs());
    }

    @Test
    void rejectsInvalidJson() {
        assertInvalid(() -> TelemetryPayloadParser.dns("{not json"), "not valid JSON");
    }

    @Test
    void rejectsUnsupportedVersion() {
        assertInvalid(() -> TelemetryPayloadParser.dns("{\"v\":2,\"ts\":1,\"forwarded\":1,\"answeredLocally\":1}"), "v=2");
    }

    @Test
    void rejectsMissingTimestamp() {
        assertInvalid(() -> TelemetryPayloadParser.dns("{\"v\":1,\"forwarded\":1,\"answeredLocally\":1}"), "'ts'");
    }

    @Test
    void rejectsMissingOrWronglyTypedField() {
        assertInvalid(() -> TelemetryPayloadParser.speed("{\"v\":1,\"ts\":1,\"iface\":\"wan\",\"rxBytes\":1}"), "'txBytes'");
        assertInvalid(() -> TelemetryPayloadParser.speed("{\"v\":1,\"ts\":1,\"iface\":\"wan\",\"rxBytes\":\"1\",\"txBytes\":1}"), "'rxBytes'");
        assertInvalid(() -> TelemetryPayloadParser.devices("{\"v\":1,\"ts\":1,\"leases\":[],\"reachable\":[]}"), "'wifi'");
    }

    private static void assertInvalid(Runnable parse, String expectedMessagePart) {
        InvalidPayloadException e = assertThrows(InvalidPayloadException.class, parse::run);
        assertTrue(e.getMessage().contains(expectedMessagePart), e.getMessage());
    }
}
