package at.htlleonding.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "time_control_state")
public class TimeControlState {
    @Id @Column(name = "router_id")
    public Long routerId;
    @Column(name = "desired_version")
    public Long desiredVersion;
    @Column(name = "desired_content", columnDefinition = "text")
    public String desiredContent;
    @Column(name = "applied_version")
    public Long appliedVersion;
    public Boolean applied;
    @Column(name = "clock_synced")
    public Boolean clockSynced;
    @Column(name = "checked_at")
    public Instant checkedAt;
    @Column(columnDefinition = "text")
    public String error;
    @Column(columnDefinition = "text")
    public String report;

    public boolean versionConfirmed() {
        return desiredVersion != null && desiredVersion.equals(appliedVersion)
                && Boolean.TRUE.equals(applied) && error == null;
    }
}
