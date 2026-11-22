package at.htlleonding.mqtt;

import at.htlleonding.model.Router;
import at.htlleonding.telemetry.ControlIngestor;
import at.htlleonding.telemetry.TimeIngestor;
import at.htlleonding.telemetry.DeviceIngestor;
import at.htlleonding.telemetry.DnsIngestor;
import at.htlleonding.telemetry.MetadataIngestor;
import at.htlleonding.telemetry.SpeedIngestor;
import at.htlleonding.telemetry.TelemetryFreshness;
import at.htlleonding.telemetry.TelemetryStream;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Routes one MQTT message (topic + payload) to the matching ingestor
@ApplicationScoped
public class TelemetryMessageHandler {

    private static final Logger LOG = Logger.getLogger(TelemetryMessageHandler.class);

    private static final Pattern TOPIC = Pattern.compile("nethera/(\\d+)/(status|telemetry/(metadata|speed|dns|devices|control|time))");
    // The backend's own desired-state messages come back through the nethera/# subscription
    private static final Pattern OWN_CONFIG = Pattern.compile("nethera/[^/]+/config/.*");

    @Inject
    EntityManager entityManager;

    @Inject
    MetadataIngestor metadataIngestor;

    @Inject
    SpeedIngestor speedIngestor;

    @Inject
    DnsIngestor dnsIngestor;

    @Inject
    DeviceIngestor deviceIngestor;

    @Inject
    ControlIngestor controlIngestor;

    @Inject TimeIngestor timeIngestor;

    @Inject
    TelemetryFreshness freshness;

    @Transactional
    public void handle(String topic, String payload) {
        if (OWN_CONFIG.matcher(topic).matches()) {
            return;
        }
        Matcher matcher = TOPIC.matcher(topic);
        if (!matcher.matches()) {
            LOG.warn("MQTT: ignoring message on unknown topic " + topic);
            return;
        }

        long routerId = Long.parseLong(matcher.group(1));
        Router router = entityManager.find(Router.class, routerId);
        if (router == null) {
            LOG.warn("MQTT: no router with ID " + routerId + ", discarding message on " + topic);
            return;
        }

        String stream = matcher.group(3);
        if (stream == null) {
            handleStatus(router, payload.trim());
            return;
        }

        if (stream.equals("control")) {
            // Retained, so it also arrives when the backend starts: no proof that the router is alive now
            controlIngestor.ingest(router, TelemetryPayloadParser.control(payload));
            return;
        }

        if (stream.equals("time")) {
            timeIngestor.ingest(router, TelemetryPayloadParser.time(payload));
            return; // Retained time reports do not prove a current connection.
        }

        switch (stream) {
            case "metadata" -> {
                metadataIngestor.ingest(router, TelemetryPayloadParser.metadata(payload));
                freshness.markIngested(routerId, TelemetryStream.METADATA);
            }
            case "speed" -> {
                speedIngestor.ingestCounters(router, TelemetryPayloadParser.speed(payload));
                freshness.markIngested(routerId, TelemetryStream.SPEED);
            }
            case "dns" -> {
                dnsIngestor.ingest(router, TelemetryPayloadParser.dns(payload));
                freshness.markIngested(routerId, TelemetryStream.DNS);
            }
            case "devices" -> {
                deviceIngestor.ingest(router, TelemetryPayloadParser.devices(payload));
                freshness.markIngested(routerId, TelemetryStream.DEVICES);
            }
            default -> throw new IllegalStateException("unhandled stream " + stream);
        }
        // Device/counter ingestors confirm contact. Retained metadata alone cannot.
        if (!"metadata".equals(stream)) router.recordContact(true);
    }

    private void handleStatus(Router router, String status) {
        boolean online = switch (status) {
            case "online" -> true;
            case "offline" -> false;
            default -> throw new InvalidPayloadException("status must be 'online' or 'offline'");
        };
        metadataIngestor.setOnline(router, online);
        freshness.setStatus(router.getId(), online);
    }
}
