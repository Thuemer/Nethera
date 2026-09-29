package at.htlleonding.boundary;

import at.htlleonding.model.Account;
import at.htlleonding.repository.AccountsRepository;
import io.quarkus.security.Authenticated;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.jwt.JsonWebToken;

@Authenticated
@Path("api/accounts")
public class AccountsResource {

    @Inject
    AccountsRepository accountsRepository;

    @Inject
    SecurityIdentity identity;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("me")
    public Account getCurrentAccount() {
        String sub = identity.getPrincipal().getName();
        String email = identity.getPrincipal() instanceof JsonWebToken token
                ? token.getClaim("email")
                : identity.getAttribute("email");
        if (email == null || email.isBlank()) {
            email = sub + "@nethera.local";
        }
        String accountEmail = email;
        return accountsRepository.findBySub(sub)
                .orElseGet(() -> accountsRepository.provision(sub, accountEmail));
    }
}
