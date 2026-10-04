package at.htlleonding.telemetry;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

import java.time.Duration;

// Broker connection values are wired into the router-telemetry channel in application.properties
@ConfigMapping(prefix = "nethera.mqtt")
public interface MqttConfig {

    String host();

    int port();

    String username();

    String password();

    // An MQTT stream counts as fresh if a valid message arrived within this window
    @WithDefault("180s")
    Duration staleAfter();
}
