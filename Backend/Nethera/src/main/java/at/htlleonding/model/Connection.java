package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "connection")
@NamedQuery(name = Connection.QUERY_FIND_ALL, query = "SELECT c FROM Connection c")
public class Connection {

    public static final String QUERY_FIND_ALL = "Connection.findAll";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "client")
    private String client;

    @Column(name = "ip")
    private String ip;

    @Column(name = "protocol")
    private String protocol;

    @Column(name = "download")
    private Double download;

    @Column(name = "upload")
    private Double upload;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getClient() {
        return client;
    }

    public void setClient(String client) {
        this.client = client;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    public String getProtocol() {
        return protocol;
    }

    public void setProtocol(String protocol) {
        this.protocol = protocol;
    }

    public Double getDownload() {
        return download;
    }

    public void setDownload(Double download) {
        this.download = download;
    }

    public Double getUpload() {
        return upload;
    }

    public void setUpload(Double upload) {
        this.upload = upload;
    }
}
