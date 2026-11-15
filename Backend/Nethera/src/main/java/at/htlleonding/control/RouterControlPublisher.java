package at.htlleonding.control;

import at.htlleonding.model.BlockList;
import at.htlleonding.model.Config;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.DeviceGroup;
import at.htlleonding.model.DeviceGroupMember;
import at.htlleonding.model.DevicePresetAssignment;
import at.htlleonding.model.Router;
import at.htlleonding.model.RouterControlState;
import at.htlleonding.model.SecurityPreset;
import at.htlleonding.telemetry.TelemetryConfig;
import at.htlleonding.telemetry.TelemetryMode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.netty.handler.codec.mqtt.MqttQoS;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.runtime.StartupEvent;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.UnicastProcessor;
import io.smallrye.reactive.messaging.mqtt.MqttMessage;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.event.TransactionPhase;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.eclipse.microprofile.reactive.messaging.Message;
import org.eclipse.microprofile.reactive.messaging.Outgoing;
import org.jboss.logging.Logger;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

// Sends each router its complete desired DNS settings as one retained message on
// nethera/<id>/config/dns. Retained = a router that was offline gets it when it reconnects.
@ApplicationScoped
public class RouterControlPublisher {

    private static final Logger LOG = Logger.getLogger(RouterControlPublisher.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    static final int SCHEMA_VERSION = 1;

    private record Prepared(String topic, byte[] payload) {
    }

    @Inject
    EntityManager entityManager;

    @Inject
    TelemetryConfig telemetryConfig;

    @Inject
    ExecutorService executor;

    // Not an Emitter: that fails at startup when the channel is disabled (ssh mode).
    // The queue keeps messages until the MQTT connection has subscribed.
    private final UnicastProcessor<Message<byte[]>> outgoing = UnicastProcessor.create();

    @Outgoing("router-config")
    Multi<Message<byte[]>> outgoing() {
        return outgoing;
    }

    public boolean enabled() {
        return telemetryConfig.mode() != TelemetryMode.SSH;
    }

    // The broker may have lost its retained messages, so send everything once at startup
    void onStart(@Observes StartupEvent event) {
        executor.execute(() -> publishAll(true));
    }

    // Only after the commit: a rolled back change must never reach the router.
    // On another thread, because the request's finished transaction is still bound to this one.
    void onChanged(@Observes(during = TransactionPhase.AFTER_SUCCESS) RouterControlChanged event) {
        executor.execute(() -> publishAll(false));
    }

    // force = send even when nothing changed. synchronized keeps versions and messages in the same order.
    public synchronized void publishAll(boolean force) {
        if (!enabled()) {
            return;
        }
        try {
            List<Prepared> messages = QuarkusTransaction.requiringNew().call(() -> prepare(force));
            for (Prepared message : messages) {
                outgoing.onNext(MqttMessage.of(message.topic(), message.payload(), MqttQoS.AT_LEAST_ONCE, true));
            }
        } catch (Exception e) {
            // The saved desired version stays ahead of the confirmed one, so the UI shows "not applied"
            LOG.warn("Router control: could not publish desired state: " + e.getMessage());
        }
    }

    private List<Prepared> prepare(boolean force) throws Exception {
        List<Router> routers = entityManager.createNamedQuery(Router.QUERY_FIND_ALL, Router.class).getResultList();
        List<BlockList> blocklists = entityManager.createQuery("SELECT b FROM BlockList b", BlockList.class).getResultList();
        List<DeviceGroup> groups = entityManager.createNamedQuery(DeviceGroup.QUERY_FIND_ALL, DeviceGroup.class).getResultList();
        List<DeviceGroupMember> members = entityManager.createNamedQuery(DeviceGroupMember.QUERY_FIND_ALL, DeviceGroupMember.class).getResultList();
        List<SecurityPreset> presets = entityManager.createNamedQuery(SecurityPreset.QUERY_FIND_ALL, SecurityPreset.class).getResultList();
        List<DevicePresetAssignment> assignments = entityManager.createNamedQuery(DevicePresetAssignment.QUERY_FIND_ALL, DevicePresetAssignment.class).getResultList();
        List<ConnectedDevice> devices = entityManager.createNamedQuery(ConnectedDevice.QUERY_FIND_ALL, ConnectedDevice.class).getResultList();
        boolean adblock = adblockWanted(entityManager);

        List<Prepared> messages = new ArrayList<>();
        for (Router router : routers) {
            DnsDesiredState desired = DnsDesiredState.build(router.getId(), adblock, blocklists, groups, members, presets, assignments, devices);
            ObjectNode json = MAPPER.createObjectNode();
            json.put("adblock", desired.adblock());
            json.set("network", MAPPER.valueToTree(desired.network()));
            json.set("devices", MAPPER.valueToTree(desired.devices()));
            String content = MAPPER.writeValueAsString(json);

            RouterControlState state = entityManager.find(RouterControlState.class, router.getId());
            if (state == null) {
                state = new RouterControlState();
                state.setRouterId(router.getId());
                entityManager.persist(state);
            }
            boolean changed = !content.equals(state.getDesiredContent());
            if (!changed && !force) {
                continue;
            }
            if (changed || state.getDesiredVersion() == null) {
                // Clock based, so versions keep growing even after the database was recreated
                long previous = state.getDesiredVersion() == null ? 0 : state.getDesiredVersion();
                state.setDesiredVersion(Math.max(previous + 1, System.currentTimeMillis()));
                state.setDesiredContent(content);
                state.setDesiredAdblock(desired.adblock());
            }

            ObjectNode message = MAPPER.createObjectNode();
            message.put("v", SCHEMA_VERSION);
            message.put("version", state.getDesiredVersion());
            message.setAll(json);
            messages.add(new Prepared("nethera/" + router.getId() + "/config/dns",
                    MAPPER.writeValueAsString(message).getBytes(StandardCharsets.UTF_8)));
        }
        return messages;
    }

    // The app has one settings row; its "DNS Blocking" switch is the wanted adblock state
    public static boolean adblockWanted(EntityManager entityManager) {
        return entityManager.createQuery("SELECT c FROM Config c ORDER BY c.id", Config.class)
                .setMaxResults(1)
                .getResultStream()
                .anyMatch(config -> Boolean.TRUE.equals(config.getDnsBlocking()));
    }
}
