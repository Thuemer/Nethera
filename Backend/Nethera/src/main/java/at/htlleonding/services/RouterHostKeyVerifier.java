package at.htlleonding.services;

import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.transport.verification.FingerprintVerifier;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.Optional;

// Checks the router's SSH host key when a fingerprint is configured, e.g.
// nethera.router.ssh-host-key=SHA256:abc... (from `ssh-keygen -lf` on the router's host key)
@ApplicationScoped
public class RouterHostKeyVerifier {

    private static final Logger LOG = Logger.getLogger(RouterHostKeyVerifier.class);

    @ConfigProperty(name = "nethera.router.ssh-host-key")
    Optional<String> fingerprint;

    void warnIfUnverified(@Observes StartupEvent event) {
        if (fingerprint.filter(f -> !f.isBlank()).isEmpty()) {
            LOG.warn("nethera.router.ssh-host-key is not set: the router's SSH host key is not verified");
        }
    }

    public void apply(SSHClient ssh) {
        ssh.addHostKeyVerifier(fingerprint.filter(f -> !f.isBlank())
                .map(FingerprintVerifier::getInstance)
                .orElseGet(PromiscuousVerifier::new));
    }
}
