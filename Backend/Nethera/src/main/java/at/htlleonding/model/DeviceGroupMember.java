package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "device_group_member", uniqueConstraints = @UniqueConstraint(columnNames = {"group_id", "device_id"}))
@NamedQuery(name = DeviceGroupMember.QUERY_FIND_ALL, query = "SELECT m FROM DeviceGroupMember m ORDER BY m.groupId, m.deviceId")
public class DeviceGroupMember {

    public static final String QUERY_FIND_ALL = "DeviceGroupMember.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id")
    private Long groupId;

    @Column(name = "device_id")
    private Long deviceId;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getGroupId() {
        return groupId;
    }

    public void setGroupId(Long groupId) {
        this.groupId = groupId;
    }

    public Long getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(Long deviceId) {
        this.deviceId = deviceId;
    }
}
