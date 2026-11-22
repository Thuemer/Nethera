package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import at.htlleonding.model.TimeControlState;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;

@ApplicationScoped
public class TimeIngestor {
    private static final ObjectMapper JSON = new ObjectMapper();
    @Inject EntityManager em;

    public void ingest(Router router, TimeSample sample) {
        Instant checkedAt = Instant.ofEpochSecond(sample.ts());
        // A future retained timestamp must not prevent all subsequent valid reports.
        if (checkedAt.isAfter(Instant.now().plusSeconds(5))) return;
        em.lock(router, LockModeType.PESSIMISTIC_WRITE);
        TimeControlState state = em.find(TimeControlState.class, router.getId());
        // Do not create desired-state ownership from an unsolicited report.
        if (state == null) return;
        if (state.checkedAt != null && (checkedAt.isBefore(state.checkedAt)
                || (checkedAt.equals(state.checkedAt) && state.appliedVersion != null && sample.version() < state.appliedVersion))) return;
        state.checkedAt = checkedAt;
        state.appliedVersion = sample.version();
        state.applied = sample.applied();
        state.clockSynced = sample.clockSynced();
        state.error = sample.error();
        try { state.report = JSON.writeValueAsString(sample.devices()); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
