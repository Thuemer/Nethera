package at.htlleonding.services;

import at.htlleonding.model.Router;
import at.htlleonding.telemetry.DnsIngestor;
import at.htlleonding.telemetry.DnsSample;
import at.htlleonding.telemetry.MetadataIngestor;
import at.htlleonding.telemetry.MetadataSample;
import at.htlleonding.telemetry.SpeedIngestor;
import at.htlleonding.telemetry.SpeedSample;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class RouterMetricsSyncService {

    private static final Logger LOG = Logger.getLogger(RouterMetricsSyncService.class);

    @Inject
    SpeedIngestor speedIngestor;

    @Inject
    DnsIngestor dnsIngestor;

    @Inject
    MetadataIngestor metadataIngestor;

    @ConfigProperty(name = "nethera.router.ip", defaultValue = "192.168.1.1")
    String routerIp;

    @ConfigProperty(name = "nethera.router.ssh-key-path")
    String sshKeyPath;

    @ConfigProperty(name = "nethera.router.wan-interface", defaultValue = "wan")
    String wanInterface;

    @Transactional
    public void syncSpeed(Router router) {
        try (SSHClient ssh = new SSHClient()) {
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.setConnectTimeout(5000);
            ssh.connect(routerIp);
            ssh.authPublickey("root", sshKeyPath);

            String output;
            try (Session session = ssh.startSession()) {
                String cmd = "cat /proc/net/dev | grep '^ *" + wanInterface + ":'; sleep 2; cat /proc/net/dev | grep '^ *" + wanInterface + ":'";
                Session.Command command = session.exec(cmd);
                command.join(10, TimeUnit.SECONDS);
                output = new String(command.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }

            String[] lines = output.strip().split("\n");
            if (lines.length < 2) {
                LOG.warn("Speed sync: unexpected /proc/net/dev output (need 2 lines, got " + lines.length + ")");
                return;
            }

            long[] t1 = parseProcNetDevLine(lines[0]);
            long[] t2 = parseProcNetDevLine(lines[1]);

            // /proc/net/dev columns (after interface name): rx_bytes(0) ... tx_bytes(8)
            double downloadMbps = Math.round(((t2[0] - t1[0]) / 2.0 / 125000.0) * 10.0) / 10.0;
            double uploadMbps = Math.round(((t2[8] - t1[8]) / 2.0 / 125000.0) * 10.0) / 10.0;

            speedIngestor.ingestRate(router, new SpeedSample(downloadMbps, uploadMbps));

        } catch (Exception e) {
            LOG.warn("Speed sync failed: " + e.getMessage());
        }
    }

    // Returns values[0..15] where [0]=rx_bytes, [8]=tx_bytes
    private long[] parseProcNetDevLine(String line) {
        String[] parts = line.strip().split("[:\\s]+");
        long[] values = new long[16];
        for (int i = 0; i < Math.min(16, parts.length - 1); i++) {
            try {
                values[i] = Long.parseLong(parts[i + 1]);
            } catch (NumberFormatException ignored) {
            }
        }
        return values;
    }

    @Transactional
    public void syncDnsStats(Router router) {
        try (SSHClient ssh = new SSHClient()) {
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.setConnectTimeout(5000);
            ssh.connect(routerIp);
            ssh.authPublickey("root", sshKeyPath);

            String output;
            try (Session session = ssh.startSession()) {
                Session.Command command = session.exec("kill -USR1 $(pidof dnsmasq); sleep 1; tail -40 /var/log/messages");
                command.join(10, TimeUnit.SECONDS);
                output = new String(command.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }

            long[] parsed = parseDnsmasqStats(output);
            if (parsed == null) {
                LOG.warn("DNS sync: no valid dnsmasq stats block found");
                return;
            }

            dnsIngestor.ingest(router, new DnsSample(parsed[0], parsed[1]));

        } catch (Exception e) {
            LOG.warn("DNS sync failed: " + e.getMessage());
        }
    }

    // Returns [forwarded, answeredLocally] from the most recent dnsmasq stats block, or null
    private long[] parseDnsmasqStats(String output) {
        String[] lines = output.split("\n");

        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i];
            if (line.contains("queries forwarded") && line.contains("queries answered locally")) {
                try {
                    int fwdIdx = line.indexOf("queries forwarded ") + "queries forwarded ".length();
                    int localIdx = line.indexOf("queries answered locally ") + "queries answered locally ".length();
                    long forwarded = Long.parseLong(line.substring(fwdIdx).split("[,\\s]")[0].trim());
                    long answeredLocally = Long.parseLong(line.substring(localIdx).split("[,\\s]")[0].trim());
                    return new long[]{forwarded, answeredLocally};
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return null;
    }

    @Transactional
    public void syncRouterMetadata(Router router) {
        try (SSHClient ssh = new SSHClient()) {
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.setConnectTimeout(5000);
            ssh.connect(routerIp);
            ssh.authPublickey("root", sshKeyPath);

            String output;
            try (Session session = ssh.startSession()) {
                Session.Command command = session.exec("ubus call system board");
                command.join(5, TimeUnit.SECONDS);
                output = new String(command.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }

            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(output);
            String model = root.path("model").asText(null);
            String firmware = root.path("release").path("description").asText(null);

            metadataIngestor.ingest(router, new MetadataSample(model, firmware));
            metadataIngestor.setOnline(router, true);

        } catch (Exception e) {
            LOG.warn("Router metadata sync failed: " + e.getMessage());
            metadataIngestor.setOnline(router, false);
        }
    }
}
