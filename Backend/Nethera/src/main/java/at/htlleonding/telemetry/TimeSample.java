package at.htlleonding.telemetry;

import java.util.Map;

public record TimeSample(long ts, long version, boolean applied, boolean clockSynced,
                         String error, Map<String, Device> devices) {
    public record Device(int usedMinutes, Integer budgetMinutes, boolean blocked, String reason) {}
}
