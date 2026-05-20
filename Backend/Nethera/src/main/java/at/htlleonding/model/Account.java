package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "account")
@NamedQuery(name = Account.QUERY_FIND_BY_SUB, query = "SELECT a FROM Account a WHERE a.keycloakSub = :sub")
public class Account {

    public static final String QUERY_FIND_BY_SUB = "Account.findBySub";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "keycloak_sub", unique = true, nullable = false)
    private String keycloakSub;

    @Column(name = "email", nullable = false)
    private String email;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getKeycloakSub() {
        return keycloakSub;
    }

    public void setKeycloakSub(String keycloakSub) {
        this.keycloakSub = keycloakSub;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }
}
