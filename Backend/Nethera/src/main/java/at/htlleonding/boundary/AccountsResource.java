package at.htlleonding.boundary;

import at.htlleonding.model.Account;
import at.htlleonding.services.AccountService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Authenticated
@Path("api/accounts")
public class AccountsResource {

    @Inject
    AccountService accountService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("me")
    public Account getCurrentAccount() {
        return accountService.current();
    }
}
