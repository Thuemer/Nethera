package at.htlleonding.boundary;

import at.htlleonding.dto.RouterConnectedDevicesDto;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import at.htlleonding.repository.ConnectedDevicesRepository;
import at.htlleonding.services.*;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.stream.Collectors;

@Path("/api/devices")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ConnectedDevicesResource {

    @Inject
    ConnectedDevicesRepository repository;

    @Inject
    RouterSyncService syncService;

    @Inject
    EntityManager entityManager;

    @GET
    public List<RouterConnectedDevicesDto> getAll() {
        // Mappen der DB-Entities auf dein DTO
        return repository.getAllConnectedDevices().stream()
                .map(d -> new RouterConnectedDevicesDto(
                        d.getId(),
                        d.getMacAddress(),
                        d.getIpAddress(),
                        d.getHostname(),
                        d.getConnectionType(),
                        d.getLastSeen()
                ))
                .collect(Collectors.toList());
    }

    @POST
    @Path("/sync/{routerId}")
    @Transactional
    public Response triggerSync(@PathParam("routerId") Long routerId) {
        // Router aus der Datenbank laden (wirft Exception, falls nicht gefunden)
        Router router = entityManager.getReference(Router.class, routerId);

        // SSH-Befehl ausführen und DB aktualisieren
        syncService.syncDhcpLeases(router);

        return Response.ok().entity("Sync erfolgreich abgeschlossen").build();
    }
}