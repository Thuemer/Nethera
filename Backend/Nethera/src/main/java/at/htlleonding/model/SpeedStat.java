package at.htlleonding.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "speed_stat")
@NamedQuery(name = SpeedStat.QUERY_FIND_ALL, query = "SELECT s FROM SpeedStat s")
public class SpeedStat {

    public final static String QUERY_FIND_ALL = "SpeedStat.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)  // Hinzugefügt!
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "router_id")
    private Router router;

    @Column(name = "timestamp")
    private LocalDateTime timestamp;

    @Column(name = "download_speed")
    private Double downloadSpeed;  // Geändert von Integer zu Double

    @Column(name = "upload_speed")
    private Double uploadSpeed;  // Geändert von Integer zu Double

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

    public Double getDownloadSpeed() {
        return downloadSpeed;
    }

    public void setDownloadSpeed(Double downloadSpeed) {
        this.downloadSpeed = downloadSpeed;
    }

    public Double getUploadSpeed() {
        return uploadSpeed;
    }

    public void setUploadSpeed(Double uploadSpeed) {
        this.uploadSpeed = uploadSpeed;
    }
}
