package at.htlleonding.boundary;

import at.htlleonding.model.Config;
import at.htlleonding.repository.ConfigsRepository;
import at.htlleonding.services.CurrentRouter;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Authenticated
@Path("api/configs")
public class ConfigsResource {

    @Inject
    ConfigsRepository configsRepository;

    @Inject
    EntityManager entityManager;

    @Inject
    CurrentRouter currentRouter;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<Config> getAllConfigs() {
        // One config per router; the list shape is kept for the frontend
        return currentRouter.router()
                .map(router -> configsRepository.findByRouter(router.getId()))
                .orElse(List.of());
    }

    @PUT
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    @Path("{id}")
    @Transactional
    public Config save(@PathParam("id") Long id, Config input) {
        RequestValidation.requireBody(input);
        Config config = currentRouter.owned(Config.class, id, "Konfiguration nicht gefunden");

        config.setRouterName(input.getRouterName());
        config.setMode(input.getMode());
        config.setUpdates(input.getUpdates());
        config.setDnsBlocking(input.getDnsBlocking());
        config.setLanIp(input.getLanIp());
        config.setGatewayIp(input.getGatewayIp());
        config.setGuestNetwork(input.getGuestNetwork());
        config.setProfiling(input.getProfiling());
        return entityManager.merge(config);
    }
}
