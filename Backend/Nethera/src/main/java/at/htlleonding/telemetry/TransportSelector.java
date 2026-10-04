package at.htlleonding.telemetry;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// Decides per router and stream whether the scheduler still has to fetch over SSH
@ApplicationScoped
public class TransportSelector {

    private static final Logger LOG = Logger.getLogger(TransportSelector.class);

    private record Key(long routerId, TelemetryStream stream) {
    }

    @Inject
    TelemetryConfig telemetryConfig;

    @Inject
    TelemetryFreshness freshness;

    // Last decision per stream; absent means SSH, the behavior before MQTT existed
    private final Map<Key, Boolean> usingMqtt = new ConcurrentHashMap<>();

    public boolean sshEnabled() {
        return telemetryConfig.mode() != TelemetryMode.MQTT;
    }

    public boolean useSsh(long routerId, TelemetryStream stream) {
        return switch (telemetryConfig.mode()) {
            case SSH -> true;
            case MQTT -> false;
            case AUTO -> {
                boolean mqtt = freshness.isFresh(routerId, stream);
                Boolean previous = usingMqtt.put(new Key(routerId, stream), mqtt);
                if (mqtt != Boolean.TRUE.equals(previous)) {
                    String name = stream.name().toLowerCase();
                    LOG.info(mqtt
                            ? "Router " + routerId + " " + name + ": receiving MQTT, skipping SSH"
                            : "Router " + routerId + " " + name + ": MQTT stale, falling back to SSH");
                }
                yield !mqtt;
            }
        };
    }
}
