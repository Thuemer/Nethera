package at.htlleonding.telemetry;

// The router's answer to a desired state: which version it handled and what really runs
public record ControlSample(long ts, long version, boolean applied, boolean adblockInstalled, boolean adblockEnabled, String error) {
}
