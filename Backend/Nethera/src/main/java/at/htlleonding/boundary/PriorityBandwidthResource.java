package at.htlleonding.boundary;

import at.htlleonding.control.PriorityControlService;
import at.htlleonding.control.RouterControlChanged;
import at.htlleonding.control.RouterControlPublisher;
import at.htlleonding.model.PriorityBandwidthSettings;
import at.htlleonding.model.Router;
import at.htlleonding.services.CurrentRouter;
import at.htlleonding.telemetry.RouterDataPolicy;
import io.quarkus.security.Authenticated;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;

@Authenticated
@Path("api/router-control/priority/bandwidth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PriorityBandwidthResource {
    @Inject EntityManager em;
    @Inject CurrentRouter currentRouter;
    @Inject PriorityControlService priority;
    @Inject RouterControlPublisher publisher;
    @Inject RouterDataPolicy policy;
    @Inject Event<RouterControlChanged> changed;

    private Router router() { return currentRouter.require(); }

    @GET
    public Map<String,Object> get() {
        Router router = router();
        return priority.bandwidthStatus(router.getId(), policy.connection(router));
    }

    @PUT @Transactional
    public Response save(PriorityControlService.Bandwidth dto) {
        if (!publisher.enabled()) throw new WebApplicationException("MQTT-Routersteuerung nicht verfügbar",501);
        Router router=router();
        if (dto==null || !dto.valid()) throw new BadRequestException("Beide Bandbreiten müssen zwischen 0,128 und 1000 Mbit/s liegen; ausgeschaltet sind beide Werte 0");
        PriorityBandwidthSettings row=em.find(PriorityBandwidthSettings.class,router.getId());
        if(row==null){row=new PriorityBandwidthSettings();row.routerId=router.getId();row.enabled=dto.enabled();row.downloadKbit=dto.downloadKbit();row.uploadKbit=dto.uploadKbit();em.persist(row);}
        else{row.enabled=dto.enabled();row.downloadKbit=dto.downloadKbit();row.uploadKbit=dto.uploadKbit();}
        changed.fire(new RouterControlChanged());
        return Response.accepted(Map.of("accepted",true)).build();
    }
}
