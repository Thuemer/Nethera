package at.htlleonding.services;

import at.htlleonding.model.Router;
import at.htlleonding.repository.ConnectedDevicesRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.BufferedReader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class RouterSyncService {

    @Inject
    ConnectedDevicesRepository deviceRepository;

    @ConfigProperty(name = "nethera.router.ip", defaultValue = "192.168.1.1")
    String routerIp;

    @ConfigProperty(name = "nethera.router.ssh-key-path")
    String sshKeyPath;

    @Transactional
    public void syncDhcpLeases(Router router) {
        try (SSHClient ssh = new SSHClient()) {
            // Im Testnetz akzeptieren wir den Hostkey dynamisch
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.connect(routerIp); // Später durch router.getIpAddress() ersetzen, sobald die DB gefüllt ist

            // Authentifizierung über deinen ED25519-Key
            ssh.authPublickey("root", sshKeyPath);

            try (Session session = ssh.startSession()) {
                Session.Command cmd = session.exec("cat /tmp/dhcp.leases");
                cmd.join(5, TimeUnit.SECONDS);

                // Sauberer Java-Standard ab Java 9, ohne Abhängigkeit von externen IOUtils!
                String rawOutput = new String(cmd.getInputStream().readAllBytes(), StandardCharsets.UTF_8);

                parseAndSaveLeases(router, rawOutput);
                System.out.println(cmd.getExitStatus());
                System.out.println(rawOutput);
            }
        } catch (Exception e) {
            throw new RuntimeException("SSH-Sync mit Router fehlgeschlagen", e);
        }
    }

    private void parseAndSaveLeases(Router router, String rawOutput) throws Exception {
        try (BufferedReader reader = new BufferedReader(new StringReader(rawOutput))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;

                // dnsmasq trennt: [Timestamp] [MAC] [IP] [Hostname] [Client-ID]
                String[] parts = line.split("\\s+");
                if (parts.length >= 4) {
                    long epochSeconds = Long.parseLong(parts[0]);
                    String mac = parts[1];
                    String ip = parts[2];
                    String hostname = parts[3].equals("*") ? "Unbekannt" : parts[3];

                    LocalDateTime expiresAt = LocalDateTime.ofInstant(
                            Instant.ofEpochSecond(epochSeconds),
                            ZoneId.systemDefault()
                    );

                    // Ab ans Repository zur Speicherung/Aktualisierung in der Datenbank
                    deviceRepository.syncDevice(router, mac, ip, hostname, expiresAt);
                }
            }
        }
    }
}