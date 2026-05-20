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
        String email = identity.getAttribute("email");
        return accountsRepository.findBySub(sub)
                .orElseGet(() -> accountsRepository.provision(sub, email));
    }
}
