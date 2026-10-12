package at.htlleonding.mqtt;

import io.smallrye.common.annotation.Blocking;
import io.smallrye.reactive.messaging.mqtt.ReceivingMqttMessageMetadata;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.reactive.messaging.Incoming;
import org.eclipse.microprofile.reactive.messaging.Message;
import org.jboss.logging.Logger;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletionStage;

// One subscription on nethera/# for status and all telemetry streams of every router
@ApplicationScoped
public class MqttTelemetryConsumer {

    private static final Logger LOG = Logger.getLogger(MqttTelemetryConsumer.class);

    @Inject
    TelemetryMessageHandler handler;

    @Incoming("router-telemetry")
    @Blocking
    public CompletionStage<Void> consume(Message<byte[]> message) {
        String topic = message.getMetadata(ReceivingMqttMessageMetadata.class)
                .map(ReceivingMqttMessageMetadata::getTopic)
                .orElse("<unknown>");
        try {
            handler.handle(topic, new String(message.getPayload(), StandardCharsets.UTF_8));
        } catch (InvalidPayloadException e) {
            LOG.warn("MQTT: discarding invalid payload on " + topic + ": " + e.getMessage());
        } catch (Exception e) {
            LOG.warn("MQTT: failed to process message on " + topic + ": " + e.getMessage());
        }
        // Always ack: a bad message must never stop the channel
        return message.ack();
    }
}
