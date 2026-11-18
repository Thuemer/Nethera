package at.htlleonding.boundary;

import at.htlleonding.model.Account;
import at.htlleonding.model.Router;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.persistence.EntityManager;

// Test helper: make the @TestSecurity user (sub = user name without @JwtSecurity) own a router
public final class TestRouters {

    private TestRouters() {
    }

    public static void own(EntityManager em, String sub, Long routerId) {
        QuarkusTransaction.requiringNew().run(() -> {
            Account account = account(em, sub);
            // One router per account and one owner per router: clear both sides first
            em.createQuery("UPDATE Router r SET r.owner = null WHERE r.owner = :account OR r.id = :id")
                    .setParameter("account", account)
                    .setParameter("id", routerId)
                    .executeUpdate();
            em.find(Router.class, routerId).setOwner(account);
        });
    }

    public static Account account(EntityManager em, String sub) {
        return em.createNamedQuery(Account.QUERY_FIND_BY_SUB, Account.class)
                .setParameter("sub", sub)
                .getResultStream()
                .findFirst()
                .orElseGet(() -> {
                    Account account = new Account();
                    account.setKeycloakSub(sub);
                    account.setEmail(sub + "@nethera.local");
                    em.persist(account);
                    return account;
                });
    }
}
