package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;

@ApplicationScoped
public class RouterDataPolicy {
    @ConfigProperty(name = "nethera.telemetry.live-max-age", defaultValue = "180s")
    Duration maxAge = Duration.ofSeconds(180);

    Clock clock = Clock.systemDefaultZone();

    public String connection(Router router) {
        if (router.getConnectionCheckedAt() == null || router.getOnline() == null) return "unknown";
        LocalDateTime now = LocalDateTime.now(clock);
        if (router.getConnectionCheckedAt().isAfter(now.plusSeconds(5))) return "unknown";
        if (!router.getOnline()) return "offline";
        return router.getConnectionCheckedAt().isBefore(now.minus(maxAge)) ? "offline" : "online";
    }

    public String mode(Router router) {
        return switch (connection(router)) {
            case "online" -> "live";
            case "offline" -> "demo";
            default -> "unavailable";
        };
    }
}
