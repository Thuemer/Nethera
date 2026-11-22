package at.htlleonding.telemetry;

import io.smallrye.config.ConfigSourceInterceptor;
import io.smallrye.config.ConfigSourceInterceptorContext;
import io.smallrye.config.ConfigValue;

import java.util.Set;

// Disables the MQTT channels when nethera.telemetry.mode=ssh, so no broker connection is attempted
public class TelemetryModeConfigInterceptor implements ConfigSourceInterceptor {

    static final String CHANNEL_ENABLED = "mp.messaging.incoming.router-telemetry.enabled";
    static final String CONTROL_CHANNEL_ENABLED = "mp.messaging.outgoing.router-config.enabled";

    private static final Set<String> CHANNELS = Set.of(CHANNEL_ENABLED, CONTROL_CHANNEL_ENABLED,
            "mp.messaging.outgoing.router-time-config.enabled");

    @Override
    public ConfigValue getValue(ConfigSourceInterceptorContext context, String name) {
        if (CHANNELS.contains(name)) {
            ConfigValue mode = context.proceed("nethera.telemetry.mode");
            if (mode != null && mode.getValue() != null && mode.getValue().trim().equalsIgnoreCase("ssh")) {
                return ConfigValue.builder().withName(name).withValue("false").build();
            }
        }
        return context.proceed(name);
    }
}
