package at.htlleonding.boundary;

import at.htlleonding.model.Account;
import at.htlleonding.repository.AccountsRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("api/accounts")
public class AccountsResource {

    @Inject
    AccountsRepository accountsRepository;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<Account> getAllAccounts() {
        return this.accountsRepository.getAllAccounts();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("me")
    public Account getCurrentAccount() {
        return this.accountsRepository.getFirstAccount().orElseThrow(NotFoundException::new);
    }
}
