package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "blocklists")
public class BlockList {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long blocklistId;
    private Long routerId;
    private String name;
    private String sourceType;
    private String urlPattern;

}
