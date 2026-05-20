package at.htlleonding.boundary;

import at.htlleonding.model.Config;
import at.htlleonding.repository.ConfigsRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("api/configs")
public class ConfigsResource {

    @Inject
    ConfigsRepository configsRepository;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<Config> getAllConfigs() {
        return this.configsRepository.getAllConfigs();
    }
}
