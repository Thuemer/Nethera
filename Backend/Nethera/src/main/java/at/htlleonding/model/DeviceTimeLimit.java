package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "device_time_limit")
@NamedQuery(name = DeviceTimeLimit.QUERY_FIND_ALL, query = "SELECT l FROM DeviceTimeLimit l")
@NamedQuery(name = DeviceTimeLimit.QUERY_FIND_BY_DEVICE, query = "SELECT l FROM DeviceTimeLimit l WHERE l.device.id = :deviceId")
public class DeviceTimeLimit {

    public static final String QUERY_FIND_ALL = "DeviceTimeLimit.findAll";
    public static final String QUERY_FIND_BY_DEVICE = "DeviceTimeLimit.findByDevice";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id", nullable = false, unique = true)
    private ConnectedDevice device;

    @Column(name = "daily_limit_minutes")
    private Integer dailyLimitMinutes;

    @Column(name = "used_minutes_today")
    private Integer usedMinutesToday;

    @Column(name = "blocked_from")
    private String blockedFrom;

    @Column(name = "blocked_until")
    private String blockedUntil;

    private String status;
    private String note;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ConnectedDevice getDevice() {
        return device;
    }

    public void setDevice(ConnectedDevice device) {
        this.device = device;
    }

    public Integer getDailyLimitMinutes() {
        return dailyLimitMinutes;
    }

    public void setDailyLimitMinutes(Integer dailyLimitMinutes) {
        this.dailyLimitMinutes = dailyLimitMinutes;
    }

    public Integer getUsedMinutesToday() {
        return usedMinutesToday;
    }

    public void setUsedMinutesToday(Integer usedMinutesToday) {
        this.usedMinutesToday = usedMinutesToday;
    }

    public String getBlockedFrom() {
        return blockedFrom;
    }

    public void setBlockedFrom(String blockedFrom) {
        this.blockedFrom = blockedFrom;
    }

    public String getBlockedUntil() {
        return blockedUntil;
    }

    public void setBlockedUntil(String blockedUntil) {
        this.blockedUntil = blockedUntil;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
