package at.htlleonding.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

// Per router: which settings version the backend wants and which one the router confirmed
@Entity
@Table(name = "router_control_state")
public class RouterControlState {

    @Id
    @Column(name = "router_id")
    private Long routerId;

    @Column(name = "desired_version")
    private Long desiredVersion;

    // Desired state as JSON without the version, to notice "nothing changed"
    @Column(name = "desired_content", columnDefinition = "text")
    private String desiredContent;

    @Column(name = "desired_adblock")
    private Boolean desiredAdblock;

    @Column(name = "applied_version")
    private Long appliedVersion;

    private Boolean applied;

    @Column(name = "adblock_installed")
    private Boolean adblockInstalled;

    @Column(name = "adblock_enabled")
    private Boolean adblockEnabled;

    @Column(columnDefinition = "text")
    private String error;

    // Time of the router's own answer, not of saving in the DB
    @Column(name = "checked_at")
    private Instant checkedAt;

    public Long getRouterId() { return routerId; }
    public void setRouterId(Long routerId) { this.routerId = routerId; }

    public Long getDesiredVersion() { return desiredVersion; }
    public void setDesiredVersion(Long desiredVersion) { this.desiredVersion = desiredVersion; }

    public String getDesiredContent() { return desiredContent; }
    public void setDesiredContent(String desiredContent) { this.desiredContent = desiredContent; }

    public Boolean getDesiredAdblock() { return desiredAdblock; }
    public void setDesiredAdblock(Boolean desiredAdblock) { this.desiredAdblock = desiredAdblock; }

    public Long getAppliedVersion() { return appliedVersion; }
    public void setAppliedVersion(Long appliedVersion) { this.appliedVersion = appliedVersion; }

    public Boolean getApplied() { return applied; }
    public void setApplied(Boolean applied) { this.applied = applied; }

    public Boolean getAdblockInstalled() { return adblockInstalled; }
    public void setAdblockInstalled(Boolean adblockInstalled) { this.adblockInstalled = adblockInstalled; }

    public Boolean getAdblockEnabled() { return adblockEnabled; }
    public void setAdblockEnabled(Boolean adblockEnabled) { this.adblockEnabled = adblockEnabled; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }

    public Instant getCheckedAt() { return checkedAt; }
    public void setCheckedAt(Instant checkedAt) { this.checkedAt = checkedAt; }

    // True only when the router confirmed exactly the version the backend wants right now
    public boolean versionConfirmed() {
        return desiredVersion != null && desiredVersion.equals(appliedVersion);
    }
}
