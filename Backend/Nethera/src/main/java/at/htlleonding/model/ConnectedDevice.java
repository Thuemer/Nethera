package at.htlleonding.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.Set;

@Entity
 // Geändert von "connected_device" zu "device"
@Table(name = "device")
@NamedQuery(name = ConnectedDevice.QUERY_FIND_ALL, query = "SELECT d FROM ConnectedDevice d")

public class ConnectedDevice {

    public final static String QUERY_FIND_ALL = "ConnectedDevice.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "mac_address")
    private String macAddress;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "hostname")
    private String hostname;

    @Column(name = "connection_type")
    private String connectionType;

    @Column(name = "last_seen")
    private LocalDateTime lastSeen;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "router_id")
    private Router router;

    @OneToMany(mappedBy = "device", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private Set<ActivityLog> activityLogs;

    // Getter und Setter (füge getId/setId hinzu, falls nicht vorhanden)
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getMacAddress() {
        return macAddress;
    }

    public void setMacAddress(String macAddress) {
        this.macAddress = macAddress;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getHostname() {
        return hostname;
    }

    public void setHostname(String hostname) {
        this.hostname = hostname;
    }

    public String getConnectionType() {
        return connectionType;
    }

    public void setConnectionType(String connectionType) {
        this.connectionType = connectionType;
    }

    public LocalDateTime getLastSeen() {
        return lastSeen;
    }

    public void setLastSeen(LocalDateTime lastSeen) {
        this.lastSeen = lastSeen;
    }

    public Router getRouter() {
        return router;
    }

    public void setRouter(Router router) {
        this.router = router;
    }

    public Set<ActivityLog> getActivityLogs() {
        return activityLogs;
    }

    public void setActivityLogs(Set<ActivityLog> activityLogs) {
        this.activityLogs = activityLogs;
    }
}
