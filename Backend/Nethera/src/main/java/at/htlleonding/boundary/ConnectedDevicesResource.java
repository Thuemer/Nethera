package at.htlleonding.boundary;

import at.htlleonding.dto.RouterConnectedDevicesDto;
import at.htlleonding.services.CurrentRouter;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Authenticated
@Path("/api/devices")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ConnectedDevicesResource {

    @Inject
    CurrentRouter currentRouter;

    // Reads only: syncing is the scheduler's job. Running SSH here made every GET wait for the router.
    @GET
    public List<RouterConnectedDevicesDto> getAll() {
        return currentRouter.devices().stream()
                .map(d -> new RouterConnectedDevicesDto(
                        d.getId(),
                        d.getMacAddress(),
                        d.getIpAddress(),
                        d.getHostname(),
                        d.getConnectionType(),
                        d.getLastSeen()
                ))
                .toList();
    }
}
