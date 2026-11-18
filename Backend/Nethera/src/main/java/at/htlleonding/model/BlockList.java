package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "blocklists")
public class BlockList implements RouterScoped {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long blocklistId;
    private Long routerId;
    private String name;
    private String sourceType;
    // Real lists are far longer than the default varchar(255)
    @Column(columnDefinition = "text")
    private String urlPattern;

    public Long getBlocklistId() {
        return blocklistId;
    }

    public void setBlocklistId(Long blocklistId) {
        this.blocklistId = blocklistId;
    }

    public Long getRouterId() {
        return routerId;
    }

    public void setRouterId(Long routerId) {
        this.routerId = routerId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public String getUrlPattern() {
        return urlPattern;
    }

    public void setUrlPattern(String urlPattern) {
        this.urlPattern = urlPattern;
    }
}
