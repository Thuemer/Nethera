package at.htlleonding.model;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.Set;

@Entity
@NamedQuery(name = Router.QUERY_FIND_ALL, query = "SELECT r FROM Router r")
public class Router {

    public final static String QUERY_FIND_ALL = "Router.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String model;
    private String firmware;
    @Column(name = "is_online")
    private Boolean isOnline;
    @Column(name = "last_seen")
    private LocalDateTime lastSeen;

    //if orphanRemoval is true, then it gets removed from the db
    @OneToMany(mappedBy = "router", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ConnectedDevice> connectedDevices;

    @OneToMany(mappedBy = "router", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ActivityLog> activityLogs;

    @OneToMany(mappedBy = "router", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<SpeedStat> speedStats;

    @OneToMany(mappedBy = "router", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<DnsStat> dnsStats;


    public Long getId() {
        return id;
    }

    public void setId(Long routerId) {
        this.id = routerId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getFirmware() {
        return firmware;
    }

    public void setFirmware(String firmware) {
        this.firmware = firmware;
    }

    public Boolean getOnline() {
        return isOnline;
    }

    public void setOnline(Boolean online) {
        isOnline = online;
    }

    public LocalDateTime getLastSeen() {
        return lastSeen;
    }

    public void setLastSeen(LocalDateTime lastSeen) {
        this.lastSeen = lastSeen;
    }

    public Set<ConnectedDevice> getConnectedDevices() {
        return connectedDevices;
    }

    public void setConnectedDevices(Set<ConnectedDevice> connectedDevices) {
        this.connectedDevices = connectedDevices;
    }

    public Set<ActivityLog> getActivityLogs() {
        return activityLogs;
    }

    public void setActivityLogs(Set<ActivityLog> activityLogs) {
        this.activityLogs = activityLogs;
    }

    public Set<SpeedStat> getSpeedStats() {
        return speedStats;
    }

    public void setSpeedStats(Set<SpeedStat> speedStats) {
        this.speedStats = speedStats;
    }

    public Set<DnsStat> getDnsStats() {
        return dnsStats;
    }

    public void setDnsStats(Set<DnsStat> dnsStats) {
        this.dnsStats = dnsStats;
    }
}
