package at.htlleonding.services;

import at.htlleonding.model.Router;
import at.htlleonding.telemetry.DeviceIngestor;
import at.htlleonding.telemetry.DeviceSnapshot;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.io.BufferedReader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class RouterSyncService {

    private static final Logger LOG = Logger.getLogger(RouterSyncService.class);

    @Inject
    DeviceIngestor deviceIngestor;

    @ConfigProperty(name = "nethera.router.ip", defaultValue = "192.168.1.1")
    String routerIp;

    @ConfigProperty(name = "nethera.router.ssh-key-path")
    String sshKeyPath;

    @Transactional
    public void syncDhcpLeases(Router router) {
        try (SSHClient ssh = new SSHClient()) {
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.setConnectTimeout(5000);
            ssh.connect(routerIp);
            ssh.authPublickey("root", sshKeyPath);

            String arpOutput;
            String dhcpOutput;
            String wifiOutput;

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

            try (Session session = ssh.startSession()) {
                // Collect station MACs from all wireless interfaces
                String cmd = "for i in $(iw dev 2>/dev/null | awk '/Interface/{print $2}'); do iw dev \"$i\" station dump 2>/dev/null | grep -i '^Station' | awk '{print tolower($2)}'; done";
                Session.Command command = session.exec(cmd);
                command.join(5, TimeUnit.SECONDS);
                wifiOutput = new String(command.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }

            Set<String> activeMacs = parseActiveMacs(arpOutput);
            Set<String> wifiMacs = parseWifiMacs(wifiOutput);
            deviceIngestor.ingest(router, new DeviceSnapshot(parseLeases(dhcpOutput), activeMacs, wifiMacs));

        } catch (Exception e) {
            LOG.warn("DHCP sync failed: " + e.getMessage());
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

    private Set<String> parseWifiMacs(String wifiOutput) {
        Set<String> wifiMacs = new HashSet<>();
        for (String line : wifiOutput.split("\n")) {
            String mac = line.strip().toLowerCase();
            if (mac.matches("([0-9a-f]{2}:){5}[0-9a-f]{2}")) {
                wifiMacs.add(mac);
            }
        }
        return wifiMacs;
    }

    private List<DeviceSnapshot.Lease> parseLeases(String dhcpOutput) throws Exception {
        List<DeviceSnapshot.Lease> leases = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new StringReader(dhcpOutput))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;

                String[] parts = line.split("\\s+");
                if (parts.length >= 4) {
                    leases.add(new DeviceSnapshot.Lease(parts[1].toLowerCase(), parts[2], parts[3]));
                }
            }
        }
        return leases;
    }
}
