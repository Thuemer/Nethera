package at.htlleonding.repository;

import at.htlleonding.model.Account;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class AccountsRepository {

    @Inject
    EntityManager entityManager;

    public List<Account> getAllAccounts() {
        return this.entityManager.createNamedQuery(Account.QUERY_FIND_ALL, Account.class).getResultList();
    }

    public Optional<Account> getFirstAccount() {
        return getAllAccounts().stream().findFirst();
    }
}
