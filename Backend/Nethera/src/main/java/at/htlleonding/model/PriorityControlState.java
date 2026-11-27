package at.htlleonding.model;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "priority_control_state")
public class PriorityControlState {
    @Id
    @Column(name = "router_id")
    private Long routerId;
    @Column(name = "desired_version")
    private Long desiredVersion;
    @Column(name = "desired_content", columnDefinition = "text")
    private String desiredContent;
    @Column(name = "applied_version")
    private Long appliedVersion;
    @Column(name = "applied")
    private Boolean applied;
    @Column(name = "reported_devices", columnDefinition = "text")
    private String reportedDevices;
    @Column(name = "error", columnDefinition = "text")
    private String error;
    @Column(name = "checked_at")
    private Instant checkedAt;
    @Column(name = "reported_bandwidth", columnDefinition = "text")
    private String reportedBandwidth;
    public String getReportedBandwidth() { return reportedBandwidth; }
    public void setReportedBandwidth(String value) { reportedBandwidth = value; }
    public Long getRouterId() { return routerId; }
    public void setRouterId(Long value) { routerId = value; }
    public Long getDesiredVersion() { return desiredVersion; }
    public void setDesiredVersion(Long value) { desiredVersion = value; }
    public String getDesiredContent() { return desiredContent; }
    public void setDesiredContent(String value) { desiredContent = value; }
    public Long getAppliedVersion() { return appliedVersion; }
    public void setAppliedVersion(Long value) { appliedVersion = value; }
    public Boolean getApplied() { return applied; }
    public void setApplied(Boolean value) { applied = value; }
    public String getReportedDevices() { return reportedDevices; }
    public void setReportedDevices(String value) { reportedDevices = value; }
    public String getError() { return error; }
    public void setError(String value) { error = value; }
    public Instant getCheckedAt() { return checkedAt; }
    public void setCheckedAt(Instant value) { checkedAt = value; }
}
