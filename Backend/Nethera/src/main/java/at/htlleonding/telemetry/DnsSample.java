package at.htlleonding.telemetry;

// Cumulative dnsmasq counters
public record DnsSample(long forwarded, long answeredLocally) {
}
