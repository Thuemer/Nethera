package at.htlleonding.telemetry;

// Cumulative WAN byte counters; ts is the router's Unix time in seconds
public record CounterSample(long rxBytes, long txBytes, long ts) {
}
