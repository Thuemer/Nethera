package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "config")
@NamedQuery(name = Config.QUERY_FIND_ALL, query = "SELECT c FROM Config c")
public class Config {

    public static final String QUERY_FIND_ALL = "Config.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "router_name")
    private String routerName;

    @Column(name = "mode")
    private String mode;

    @Column(name = "updates")
    private Boolean updates;

    @Column(name = "dns_blocking")
    private Boolean dnsBlocking;

    @Column(name = "lan_ip")
    private String lanIp;

    @Column(name = "gateway_ip")
    private String gatewayIp;

    @Column(name = "guest_network")
    private Boolean guestNetwork;

    @Column(name = "profiling")
    private Boolean profiling;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getRouterName() {
        return routerName;
    }

    public void setRouterName(String routerName) {
        this.routerName = routerName;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public Boolean getUpdates() {
        return updates;
    }

    public void setUpdates(Boolean updates) {
        this.updates = updates;
    }

    public Boolean getDnsBlocking() {
        return dnsBlocking;
    }

    public void setDnsBlocking(Boolean dnsBlocking) {
        this.dnsBlocking = dnsBlocking;
    }

    public String getLanIp() {
        return lanIp;
    }

    public void setLanIp(String lanIp) {
        this.lanIp = lanIp;
    }

    public String getGatewayIp() {
        return gatewayIp;
    }

    public void setGatewayIp(String gatewayIp) {
        this.gatewayIp = gatewayIp;
    }

    public Boolean getGuestNetwork() {
        return guestNetwork;
    }

    public void setGuestNetwork(Boolean guestNetwork) {
        this.guestNetwork = guestNetwork;
    }

    public Boolean getProfiling() {
        return profiling;
    }

    public void setProfiling(Boolean profiling) {
        this.profiling = profiling;
    }
}
