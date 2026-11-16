package at.htlleonding.services;

import at.htlleonding.model.Account;
import at.htlleonding.repository.AccountsRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.jwt.JsonWebToken;

// Resolves the local Account of the logged-in user, creating it on first use
@RequestScoped
public class AccountService {

    @Inject
    AccountsRepository accountsRepository;

    @Inject
    SecurityIdentity identity;

    private Account current;

    public Account current() {
        if (current != null) {
            return current;
        }
        // Key accounts by the immutable Keycloak user ID. getPrincipal().getName() would return
        // preferred_username, which a new user could take over after the old one is deleted.
        JsonWebToken token = identity.getPrincipal() instanceof JsonWebToken jwt ? jwt : null;
        String sub = token != null && token.getSubject() != null ? token.getSubject() : identity.getPrincipal().getName();
        String email = token != null ? token.getClaim("email") : identity.getAttribute("email");
        if (email == null || email.isBlank()) {
            email = sub + "@nethera.local";
        }
        String accountEmail = email;
        current = accountsRepository.findBySub(sub)
                .orElseGet(() -> accountsRepository.provision(sub, accountEmail));
        return current;
    }
}
