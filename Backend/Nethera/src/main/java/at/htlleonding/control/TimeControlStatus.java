package at.htlleonding.control;

import at.htlleonding.model.*;
import at.htlleonding.telemetry.TimeSample;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.*;

@ApplicationScoped
public class TimeControlStatus {
    private static final ObjectMapper JSON = new ObjectMapper();
    @Inject EntityManager em;
    @Inject TimeControlPublisher publisher;

    public record Result(Map<String, Object> devices, Instant checkedAt, String error, Boolean applied) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Device(boolean applied, Boolean blockedNow, String reason, Integer usedMinutesToday,
                         Integer budgetMinutesToday, Boolean clockSynced, String error, Boolean requiresActivation) {}

    public Result read(long routerId, String connection) {
        TimeControlState state = em.find(TimeControlState.class, routerId);
        TimeDesiredState desired;
        try { desired = publisher.desired(routerId); }
        catch (IllegalArgumentException e) { return new Result(Map.of(), null, e.getMessage(), false); }
        boolean fresh = state != null && state.checkedAt != null
                && !state.checkedAt.isBefore(Instant.now().minusSeconds(180))
                && !state.checkedAt.isAfter(Instant.now().plusSeconds(5));
        boolean same = state != null && TimeControlPublisher.content(desired).equals(state.desiredContent);
        boolean confirmed = publisher.enabled() && "online".equals(connection) && fresh && same && state.versionConfirmed();
        Map<String, TimeSample.Device> report = Map.of();
        if (confirmed && state.report != null) {
            try { report = JSON.readValue(state.report, new TypeReference<Map<String, TimeSample.Device>>() {}); }
            catch (Exception e) { confirmed = false; }
        }
        confirmed = confirmed && report.keySet().equals(desired.devices().keySet());
        String error = fresh && same && state.desiredVersion != null && state.desiredVersion.equals(state.appliedVersion) ? state.error : null;
        Map<String, Object> entries = new TreeMap<>();
        var limits = em.createQuery("SELECT l FROM DeviceTimeLimit l JOIN FETCH l.device d WHERE d.router.id = :id", DeviceTimeLimit.class)
                .setParameter("id", routerId).getResultList();
        for (var limit : limits) {
            var device = limit.getDevice();
            String mac = device.getMacAddress() == null ? "" : device.getMacAddress().toLowerCase(Locale.ROOT);
            boolean activated = Boolean.TRUE.equals(limit.getRouterEnforcement());
            boolean hasRule = desired.devices().containsKey(mac);
            var actual = report.get(mac);
            boolean applied = confirmed && activated && device.isRouterData() && (!hasRule || actual != null);
            boolean live = applied && hasRule && actual != null;
            entries.put(String.valueOf(device.getId()), new Device(applied,
                    live ? actual.blocked() : null, live ? actual.reason() : null,
                    live && Boolean.TRUE.equals(state.clockSynced) ? actual.usedMinutes() : null,
                    live && Boolean.TRUE.equals(state.clockSynced) ? actual.budgetMinutes() : null,
                    live ? state.clockSynced : null, error, !activated ? true : null));
        }
        return new Result(entries, state == null ? null : state.checkedAt, error, state == null ? null : confirmed);
    }
}
