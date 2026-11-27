package at.htlleonding.mqtt;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TimePayloadParserTest {
    static final String REPORT = """
        {"v":1,"ts":1795366800,"version":7,"applied":true,"clockSynced":true,
         "devices":{"AA:BB:CC:DD:EE:01":{"usedMinutes":12,"budgetMinutes":120,"blocked":true,"reason":"window"}}}
        """;

    @Test void parsesRealWireReport() {
        var report = TelemetryPayloadParser.time(REPORT);
        assertEquals(7, report.version()); assertTrue(report.applied());
        assertEquals(12, report.devices().get("aa:bb:cc:dd:ee:01").usedMinutes());
        assertEquals("window", report.devices().get("aa:bb:cc:dd:ee:01").reason());
    }

    @Test void rejectsUntrustworthyReports() {
        for (String invalid : new String[] {
                REPORT.replace("\"v\":1", "\"v\":2"), REPORT.replace("\"version\":7", "\"version\":0"),
                REPORT.replace("\"usedMinutes\":12", "\"usedMinutes\":1441"),
                REPORT.replace("\"clockSynced\":true", "\"clockSynced\":\"true\""),
                REPORT.replace("\"blocked\":true", "\"blocked\":false"),
                REPORT.replace("window", "unknown"), REPORT.replace("AA:BB:CC:DD:EE:01", "invalid"),
                REPORT.replace("\"applied\":true", "\"applied\":true,\"error\":\"failed\"") }) {
            assertThrows(InvalidPayloadException.class, () -> TelemetryPayloadParser.time(invalid), invalid);
        }
    }

    @Test void unlimitedBudgetAndUnsyncedClockAreValid() {
        var report = TelemetryPayloadParser.time(REPORT.replace("\"budgetMinutes\":120", "\"budgetMinutes\":null")
                .replace("\"clockSynced\":true", "\"clockSynced\":false").replace("window", "clock"));
        assertNull(report.devices().get("aa:bb:cc:dd:ee:01").budgetMinutes());
        assertFalse(report.clockSynced());
    }
}
