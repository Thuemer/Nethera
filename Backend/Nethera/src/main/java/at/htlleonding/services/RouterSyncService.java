package at.htlleonding.services;

import at.htlleonding.model.ActivityLog;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import at.htlleonding.repository.ConnectedDevicesRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.NoResultException;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.BufferedReader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class RouterSyncService {

    @Inject
    ConnectedDevicesRepository deviceRepository;

    @Inject
    EntityManager entityManager;

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

                    // Task 5.1: Query existing device state before upsert
                    ConnectedDevice existing = findExistingDevice(router, mac);
                    boolean wasNew = existing == null;
                    boolean wasOnline = existing != null && Boolean.TRUE.equals(existing.getOnline());

                    // Task 5.2/5.3: Upsert device (Task 5.4: shared @Transactional scope via scheduler's outer tx)
                    ConnectedDevice device = deviceRepository.syncDevice(router, mac, ip, hostname, isOnline);

                    // Emit activity log on state change
                    if (wasNew && isOnline) {
                        emitActivityLog(router, device, "CONNECTED", hostname + " connected");
                    } else if (!wasNew && !wasOnline && isOnline) {
                        emitActivityLog(router, device, "CONNECTED", hostname + " connected");
                    } else if (!wasNew && wasOnline && !isOnline) {
                        emitActivityLog(router, device, "DISCONNECTED", hostname + " disconnected");
                    }
                }
            }
        }
    }

    private ConnectedDevice findExistingDevice(Router router, String mac) {
        try {
            return entityManager.createQuery(
                            "SELECT d FROM ConnectedDevice d WHERE d.macAddress = :mac AND d.router = :router",
                            ConnectedDevice.class)
                    .setParameter("mac", mac)
                    .setParameter("router", router)
                    .getSingleResult();
        } catch (NoResultException e) {
            return null;
        }
    }

    private void emitActivityLog(Router router, ConnectedDevice device, String eventType, String details) {
        ActivityLog log = new ActivityLog();
        log.setEventType(eventType);
        log.setDetails(details);
        log.setTimestamp(LocalDateTime.now());
        log.setRouter(router);
        log.setDevice(device);
        entityManager.persist(log);
    }
}
