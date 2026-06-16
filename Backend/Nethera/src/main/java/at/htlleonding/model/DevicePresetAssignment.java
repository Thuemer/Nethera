package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "device_preset_assignment", uniqueConstraints = @UniqueConstraint(columnNames = "device_id"))
@NamedQuery(name = DevicePresetAssignment.QUERY_FIND_ALL, query = "SELECT a FROM DevicePresetAssignment a ORDER BY a.deviceId")
@NamedQuery(name = DevicePresetAssignment.QUERY_FIND_BY_DEVICE, query = "SELECT a FROM DevicePresetAssignment a WHERE a.deviceId = :deviceId")
public class DevicePresetAssignment {

    public static final String QUERY_FIND_ALL = "DevicePresetAssignment.findAll";
    public static final String QUERY_FIND_BY_DEVICE = "DevicePresetAssignment.findByDevice";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "device_id")
    private Long deviceId;

    @Column(name = "preset_id")
    private Long presetId;

    private String status;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(Long deviceId) {
        this.deviceId = deviceId;
    }

    public Long getPresetId() {
        return presetId;
    }

    public void setPresetId(Long presetId) {
        this.presetId = presetId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
