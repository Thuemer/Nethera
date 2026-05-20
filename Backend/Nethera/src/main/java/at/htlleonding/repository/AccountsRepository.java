package at.htlleonding.repository;

import at.htlleonding.model.Account;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.util.Optional;

@ApplicationScoped
public class AccountsRepository {

    @Inject
    EntityManager entityManager;

    public Optional<Account> findBySub(String sub) {
        return entityManager.createNamedQuery(Account.QUERY_FIND_BY_SUB, Account.class)
                .setParameter("sub", sub)
                .getResultStream()
                .findFirst();
    }

    @Transactional
    public Account provision(String sub, String email) {
        Account account = new Account();
        account.setKeycloakSub(sub);
        account.setEmail(email);
        entityManager.persist(account);
        return account;
    }
}
