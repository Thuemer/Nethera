package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "device_group")
@NamedQuery(name = DeviceGroup.QUERY_FIND_ALL, query = "SELECT g FROM DeviceGroup g ORDER BY g.name")
public class DeviceGroup {

    public static final String QUERY_FIND_ALL = "DeviceGroup.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "blocklist_id")
    private Long blocklistId;

    @Column(name = "color")
    private String color;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Long getBlocklistId() {
        return blocklistId;
    }

    public void setBlocklistId(Long blocklistId) {
        this.blocklistId = blocklistId;
    }

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color;
    }
}
