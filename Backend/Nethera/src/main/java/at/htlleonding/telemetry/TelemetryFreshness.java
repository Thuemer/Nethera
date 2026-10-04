package at.htlleonding.telemetry;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@ApplicationScoped
public class TelemetryFreshness {

    private record Key(long routerId, TelemetryStream stream) {
    }

    @Inject
    MqttConfig mqttConfig;

    Clock clock = Clock.systemUTC();

    private final Map<Key, Instant> lastIngested = new ConcurrentHashMap<>();
    private final Map<Long, Boolean> online = new ConcurrentHashMap<>();

    public void markIngested(long routerId, TelemetryStream stream) {
        lastIngested.put(new Key(routerId, stream), clock.instant());
    }

    public void setStatus(long routerId, boolean isOnline) {
        online.put(routerId, isOnline);
    }

    public boolean isFresh(long routerId, TelemetryStream stream) {
        if (stream == TelemetryStream.METADATA && !online.getOrDefault(routerId, false)) {
            return false;
        }
        Instant last = lastIngested.get(new Key(routerId, stream));
        return last != null && !Duration.between(last, clock.instant()).minus(mqttConfig.staleAfter()).isPositive();
    }
}
