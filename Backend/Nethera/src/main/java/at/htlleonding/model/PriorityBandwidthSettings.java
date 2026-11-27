package at.htlleonding.model;
import jakarta.persistence.*;

@Entity
@Table(name = "priority_bandwidth")
public class PriorityBandwidthSettings {
    @Id @Column(name = "router_id") public Long routerId;
    @Column(nullable = false) public boolean enabled;
    @Column(name = "download_kbit", nullable = false) public int downloadKbit;
    @Column(name = "upload_kbit", nullable = false) public int uploadKbit;
}
