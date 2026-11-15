package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import at.htlleonding.model.RouterControlState;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.time.Instant;

// Stores the router's confirmation; the status endpoint compares it with the desired version
@ApplicationScoped
public class ControlIngestor {

    @Inject
    EntityManager entityManager;

    public void ingest(Router router, ControlSample sample) {
        RouterControlState state = entityManager.find(RouterControlState.class, router.getId());
        if (state == null) {
            state = new RouterControlState();
            state.setRouterId(router.getId());
            entityManager.persist(state);
        }
        state.setAppliedVersion(sample.version());
        state.setApplied(sample.applied());
        state.setAdblockInstalled(sample.adblockInstalled());
        state.setAdblockEnabled(sample.adblockEnabled());
        state.setError(sample.error());
        // The router's own clock: a retained old answer must not look freshly checked
        state.setCheckedAt(Instant.ofEpochSecond(sample.ts()));
    }
}
