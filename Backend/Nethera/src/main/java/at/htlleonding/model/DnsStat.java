package at.htlleonding.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "dns_stat")
@NamedQuery(name = DnsStat.QUERY_FIND_ALL, query = "SELECT d FROM DnsStat d")
public class DnsStat {

    public final static String QUERY_FIND_ALL = "DnsStat.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "router_id")
    private Router router;

    @Column(name = "timestamp")
    private LocalDateTime timestamp;

    @Column(name = "total_queries")  // Geändert von @JoinColumn
    private Integer totalQueries;

    @Column(name = "blocked_queries")  // Geändert
    private Integer blockedQueries;

    @Column(name = "trackers_detected")  // Geändert
    private Integer trackersDetected;

    // Getter und Setter (füge getId/setId hinzu, falls nicht vorhanden)
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Router getRouter() {
        return router;
    }

    public void setRouter(Router router) {
        this.router = router;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public Integer getTotalQueries() {
        return totalQueries;
    }

    public void setTotalQueries(Integer totalQueries) {
        this.totalQueries = totalQueries;
    }

    public Integer getBlockedQueries() {
        return blockedQueries;
    }

    public void setBlockedQueries(Integer blockedQueries) {
        this.blockedQueries = blockedQueries;
    }

    public Integer getTrackersDetected() {
        return trackersDetected;
    }

    public void setTrackersDetected(Integer trackersDetected) {
        this.trackersDetected = trackersDetected;
    }
}
