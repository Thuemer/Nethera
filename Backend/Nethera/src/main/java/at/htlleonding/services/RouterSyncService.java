package at.htlleonding.services;

import at.htlleonding.model.Router;
import at.htlleonding.repository.ConnectedDevicesRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.BufferedReader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class RouterSyncService {

    @Inject
    ConnectedDevicesRepository deviceRepository;

    @ConfigProperty(name = "nethera.router.ip", defaultValue = "192.168.1.1")
    String routerIp;

    @ConfigProperty(name = "nethera.router.ssh-key-path")
    String sshKeyPath;

    public void syncDhcpLeases(Router router) {
        try (SSHClient ssh = new SSHClient()) {
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.connect(routerIp);
            ssh.authPublickey("root", sshKeyPath);

            String arpOutput;
            String dhcpOutput;

            try (Session session = ssh.startSession()) {

                String cmdString = "for ip in $(awk '{print $3}' /tmp/dhcp.leases); do ping -c 1 -W 1 $ip > /dev/null 2>&1 & done; sleep 2; cat /proc/net/arp";

                Session.Command cmd = session.exec(cmdString);
                cmd.join(7, TimeUnit.SECONDS);
                arpOutput = new String(cmd.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }

            try (Session session = ssh.startSession()) {
                Session.Command cmd = session.exec("cat /tmp/dhcp.leases");
                cmd.join(5, TimeUnit.SECONDS);
                dhcpOutput = new String(cmd.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }
            Set<String> activeMacs = parseActiveMacs(arpOutput);
            parseAndSaveLeases(router, dhcpOutput, activeMacs);

        } catch (Exception e) {
            throw new RuntimeException("SSH-Sync mit Router fehlgeschlagen", e);
        }
    }

    private Set<String> parseActiveMacs(String arpOutput) throws Exception {
        Set<String> activeMacs = new HashSet<>();
        try (BufferedReader reader = new BufferedReader(new StringReader(arpOutput))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("IP address") || line.isBlank()) continue;

                String[] parts = line.split("\\s+");
                if (parts.length >= 4) {
                    String flags = parts[2];
                    String mac = parts[3].toLowerCase();

                    if (!flags.equals("0x0") && !mac.equals("00:00:00:00:00:00")) {
                        activeMacs.add(mac);
                    }
                }
            }
        }
        return activeMacs;
    }

    private void parseAndSaveLeases(Router router, String dhcpOutput, Set<String> activeMacs) throws Exception {
        try (BufferedReader reader = new BufferedReader(new StringReader(dhcpOutput))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;

                String[] parts = line.split("\\s+");
                if (parts.length >= 4) {
                    String mac = parts[1].toLowerCase();
                    String ip = parts[2];
                    String hostname = parts[3].equals("*") ? "Unbekannt" : parts[3];

                    boolean isOnline = activeMacs.contains(mac);

                    deviceRepository.syncDevice(router, mac, ip, hostname, isOnline);
                }
            }
        }
    }
}