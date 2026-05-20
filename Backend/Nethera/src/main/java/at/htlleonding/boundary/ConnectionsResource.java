package at.htlleonding.boundary;

import at.htlleonding.model.Connection;
import at.htlleonding.repository.ConnectionsRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("api/connections")
public class ConnectionsResource {

    @Inject
    ConnectionsRepository connectionsRepository;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<Connection> getAllConnections() {
        return this.connectionsRepository.getAllConnections();
    }
}
