package at.htlleonding.boundary;

import at.htlleonding.control.RouterControlChanged;
import at.htlleonding.model.Config;
import at.htlleonding.repository.ConfigsRepository;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("api/configs")
public class ConfigsResource {

    @Inject
    ConfigsRepository configsRepository;

    @Inject
    EntityManager entityManager;

    @Inject
    Event<RouterControlChanged> routerControlChanged;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<Config> getAllConfigs() {
        return this.configsRepository.getAllConfigs();
    }

    @PUT
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    @Path("{id}")
    @Transactional
    public Config save(@PathParam("id") Long id, Config input) {
        RequestValidation.requireBody(input);
        Config config = entityManager.find(Config.class, id);
        if (config == null) {
            throw new NotFoundException("Konfiguration nicht gefunden");
        }

        config.setRouterName(input.getRouterName());
        config.setMode(input.getMode());
        config.setUpdates(input.getUpdates());
        config.setDnsBlocking(input.getDnsBlocking());
        config.setLanIp(input.getLanIp());
        config.setGatewayIp(input.getGatewayIp());
        config.setGuestNetwork(input.getGuestNetwork());
        config.setProfiling(input.getProfiling());
        // dnsBlocking is the adblock switch the router has to apply
        routerControlChanged.fire(new RouterControlChanged());
        return entityManager.merge(config);
    }
}
