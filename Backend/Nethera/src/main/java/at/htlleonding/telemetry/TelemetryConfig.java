package at.htlleonding.telemetry;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

@ConfigMapping(prefix = "nethera.telemetry")
public interface TelemetryConfig {

    // ssh | mqtt | auto; an unknown value fails startup listing the allowed values
    @WithDefault("auto")
    TelemetryMode mode();
}
