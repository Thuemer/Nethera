package at.htlleonding.control;

import at.htlleonding.model.*;
import at.htlleonding.telemetry.TelemetryConfig;
import at.htlleonding.telemetry.TelemetryMode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.netty.handler.codec.mqtt.MqttQoS;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.runtime.ShutdownEvent;
import io.vertx.core.Vertx;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.UnicastProcessor;
import io.smallrye.reactive.messaging.mqtt.MqttMessage;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.*;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.eclipse.microprofile.reactive.messaging.*;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

@ApplicationScoped
public class TimeControlPublisher {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Logger LOG = Logger.getLogger(TimeControlPublisher.class);
    @Inject EntityManager em;
    @Inject TelemetryConfig config;
    @Inject ExecutorService executor;
    @Inject Vertx vertx;
    @ConfigProperty(name = "nethera.time-control.retry-millis", defaultValue = "60000")
    long retryMillis;
    private long retryTimer = -1;
    private final AtomicBoolean retryRunning = new AtomicBoolean();
    private final UnicastProcessor<Message<byte[]>> outgoing = UnicastProcessor.create();

    @Outgoing("router-time-config")
    Multi<Message<byte[]>> outgoing() { return outgoing; }
    public boolean enabled() { return config.mode() != TelemetryMode.SSH; }

    public TimeDesiredState desired(long routerId) {
        return TimeDesiredState.build(routerId, em.createQuery(
                "SELECT l FROM DeviceTimeLimit l JOIN FETCH l.device d JOIN FETCH d.router WHERE d.router.id = :id", DeviceTimeLimit.class)
                .setParameter("id", routerId).getResultList());
    }

    public static String content(TimeDesiredState desired) {
        try { return JSON.writeValueAsString(desired); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    // Prepare inside the save transaction, so a status read immediately after PUT
    // cannot confirm the previous version. No MQTT side effects before commit.
    public TimeControlState prepare(long routerId) {
        em.flush();
        String content = content(desired(routerId));
        TimeControlState state = em.find(TimeControlState.class, routerId);
        if (state == null) {
            state = new TimeControlState();
            state.routerId = routerId;
            em.persist(state);
        }
        if (!content.equals(state.desiredContent) || state.desiredVersion == null) {
            state.desiredVersion = Math.max(state.desiredVersion == null ? 1 : Math.addExact(state.desiredVersion, 1), System.currentTimeMillis());
            state.desiredContent = content;
        }
        return state;
    }

    void onStart(@Observes StartupEvent event) {
        if (!enabled()) return;
        requestRetry();
        // LeoCloud disables the general scheduler to prevent SSH polling.
        // Keep MQTT repair independent, with database work on a worker thread.
        retryTimer = vertx.setPeriodic(Math.max(1000, retryMillis), ignored -> requestRetry());
    }
    void onStop(@Observes ShutdownEvent event) {
        if (retryTimer >= 0) vertx.cancelTimer(retryTimer);
    }
    private void requestRetry() {
        if (!retryRunning.compareAndSet(false, true)) return;
        executor.execute(() -> {
            try { retry(); }
            finally { retryRunning.set(false); }
        });
    }
    void onChanged(@Observes(during = TransactionPhase.AFTER_SUCCESS) TimeControlChanged event) {
        executor.execute(() -> publish(event.routerId()));
    }

    // Bounded periodic retry also repairs broker retention loss. Only explicitly
    // configured routers have a state row; startup never activates legacy limits.
    void retry() {
        if (!enabled()) return;
        try {
            List<Long> ids = QuarkusTransaction.requiringNew().call(() ->
                    em.createQuery("SELECT s.routerId FROM TimeControlState s", Long.class).getResultList());
            ids.forEach(this::publish);
        } catch (Exception e) { LOG.warn("Time control retry: " + e.getMessage()); }
    }

    public synchronized void publish(long routerId) {
        if (!enabled()) return;
        try {
            byte[] payload = QuarkusTransaction.requiringNew().call(() -> {
                // Same per-router lock as writes, preventing concurrent versions.
                em.find(Router.class, routerId, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
                TimeControlState state = prepare(routerId);
                ObjectNode message = (ObjectNode) JSON.readTree(state.desiredContent);
                message.put("v", 1);
                message.put("version", state.desiredVersion);
                return JSON.writeValueAsString(message).getBytes(StandardCharsets.UTF_8);
            });
            outgoing.onNext(MqttMessage.of("nethera/" + routerId + "/config/time", payload, MqttQoS.AT_LEAST_ONCE, true));
        } catch (Exception e) { LOG.warn("Time control publish: " + e.getMessage()); }
    }
}
