package at.htlleonding.services;

import at.htlleonding.model.Router;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.Optional;

// Makes the SSH router (nethera.router.id) claimable with nethera.router.pairing-code.
// Runs at startup and again before every claim: in Compose the seed container creates the router
// only after the backend has started.
@ApplicationScoped
public class RouterPairingCodeInitializer {

    private static final Logger LOG = Logger.getLogger(RouterPairingCodeInitializer.class);

    @Inject
    EntityManager entityManager;

    @ConfigProperty(name = "nethera.router.id", defaultValue = "1")
    Long routerId;

    @ConfigProperty(name = "nethera.router.pairing-code")
    Optional<String> pairingCode;

    void onStart(@Observes StartupEvent event) {
        apply();
    }

    @Transactional
    public void apply() {
        String code = Router.normalizePairingCode(pairingCode.orElse(null));
        if (code == null) {
            return;
        }
        Router router = entityManager.find(Router.class, routerId);
        if (router == null) {
            LOG.info("Pairing code configured, but router " + routerId + " does not exist yet");
            return;
        }
        if (!code.equals(router.getPairingCode())) {
            // A different router may hold the code from an earlier configuration
            entityManager.createNamedQuery(Router.QUERY_FIND_BY_PAIRING_CODE, Router.class)
                    .setParameter("code", code)
                    .getResultStream()
                    .forEach(other -> other.setPairingCode(null));
            entityManager.flush();
            router.setPairingCode(code);
        }
    }
}
