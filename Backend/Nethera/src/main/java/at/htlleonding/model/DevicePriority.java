package at.htlleonding.model;
import jakarta.persistence.*;

// Independent override: changing priority must never change DNS rules or preset assignment status.
@Entity
@Table(name = "device_priority")
public class DevicePriority {
    @Id @Column(name = "device_id") private Long deviceId;
    @Column(nullable = false) private String mode;
    public Long getDeviceId() { return deviceId; }
    public void setDeviceId(Long value) { deviceId = value; }
    public String getMode() { return mode; }
    public void setMode(String value) { mode = value; }
}
