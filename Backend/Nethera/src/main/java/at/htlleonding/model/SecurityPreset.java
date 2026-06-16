package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "security_preset")
@NamedQuery(name = SecurityPreset.QUERY_FIND_ALL, query = "SELECT p FROM SecurityPreset p ORDER BY p.name")
public class SecurityPreset {

    public static final String QUERY_FIND_ALL = "SecurityPreset.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "blocklist_id")
    private Long blocklistId;

    @Column(name = "time_limit_minutes")
    private Integer timeLimitMinutes;

    @Column(name = "blocked_from")
    private String blockedFrom;

    @Column(name = "blocked_until")
    private String blockedUntil;

    @Column(name = "priority_mode")
    private Boolean priorityMode;

    @Column(name = "parental_mode")
    private Boolean parentalMode;

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

    public Integer getTimeLimitMinutes() {
        return timeLimitMinutes;
    }

    public void setTimeLimitMinutes(Integer timeLimitMinutes) {
        this.timeLimitMinutes = timeLimitMinutes;
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

    public Boolean getPriorityMode() {
        return priorityMode;
    }

    public void setPriorityMode(Boolean priorityMode) {
        this.priorityMode = priorityMode;
    }

    public Boolean getParentalMode() {
        return parentalMode;
    }

    public void setParentalMode(Boolean parentalMode) {
        this.parentalMode = parentalMode;
    }
}
