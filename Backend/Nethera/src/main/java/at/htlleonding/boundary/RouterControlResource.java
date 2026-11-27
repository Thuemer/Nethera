package at.htlleonding.boundary;

import at.htlleonding.control.DnsDesiredState;
import at.htlleonding.control.PriorityControlService;
import at.htlleonding.control.RouterControlChanged;
import at.htlleonding.model.DevicePriority;
import jakarta.enterprise.event.Event;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.BadRequestException;
import java.util.Set;
import at.htlleonding.control.RouterControlPublisher;
import at.htlleonding.model.BlockList;
import at.htlleonding.model.Config;
import at.htlleonding.model.Router;
import at.htlleonding.model.RouterControlState;
import at.htlleonding.services.CurrentRouter;
import at.htlleonding.telemetry.RouterDataPolicy;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.util.Map;
import java.util.TreeMap;

// Tells the frontend what the router really confirmed (Documentation/router-control-frontend-contract.md)
@Authenticated
@Path("api/router-control")
@Produces(MediaType.APPLICATION_JSON)
public class RouterControlResource {

    @Inject
    PriorityControlService priorityControl;

    @Inject
    EntityManager entityManager;

    @Inject
    RouterControlPublisher publisher;

    @Inject
    RouterDataPolicy dataPolicy;

    // The logged-in user's router (router-ownership); 404 when no router is connected
    @Inject
    CurrentRouter currentRouter;

    @Inject
    Event<RouterControlChanged> controlChanged;

    @PUT
    @Path("priority/devices/{deviceId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Transactional
    public Response savePriority(@PathParam("deviceId") Long deviceId, PriorityDto dto) {
        if (!publisher.enabled()) throw new WebApplicationException("MQTT-Routersteuerung nicht verfügbar", 501);
        currentRouter.device(deviceId);
        if (dto == null || !Set.of("high", "normal").contains(dto.mode() == null ? "" : dto.mode()))
            throw new BadRequestException("Priorität muss high oder normal sein");
        var preference = entityManager.find(DevicePriority.class, deviceId);
        if (preference == null) {
            preference = new DevicePriority(); preference.setDeviceId(deviceId);
            entityManager.persist(preference);
        }
        preference.setMode(dto.mode());
        controlChanged.fire(new RouterControlChanged());
        return Response.accepted(Map.of("accepted", true, "mode", dto.mode())).build();
    }

    public record PriorityDto(String mode) {}

    @GET
    @Path("status")
    public StatusDto status() {
        Router router = currentRouter.require();
        long routerId = router.getId();
        RouterControlState state = entityManager.find(RouterControlState.class, routerId);

        // Same rule as the router overview: a seeded or outdated "online" flag is no live connection
        String connection = dataPolicy.connection(router);
        boolean confirmed = state != null && state.versionConfirmed();
        boolean allApplied = confirmed && Boolean.TRUE.equals(state.getApplied());
        boolean installed = state != null && Boolean.TRUE.equals(state.getAdblockInstalled());
        boolean enabled = state != null && Boolean.TRUE.equals(state.getAdblockEnabled());
        // Adblock has its own readback from the router, so it does not depend on the website rules
        boolean adblockApplied = confirmed && state.getDesiredAdblock() != null && state.getDesiredAdblock() == enabled;

        Map<String, BlocklistStatusDto> blocklists = new TreeMap<>();
        for (BlockList list : entityManager.createQuery("SELECT b FROM BlockList b WHERE b.routerId = :routerId", BlockList.class)
                .setParameter("routerId", routerId).getResultList()) {
            boolean hasEntries = list.getUrlPattern() != null && !list.getUrlPattern().isBlank();
            if (hasEntries && DnsDesiredState.domains(list.getUrlPattern()).isEmpty()) {
                blocklists.put(String.valueOf(list.getBlocklistId()),
                        new BlocklistStatusDto(false, "Kategorien werden noch nicht unterstützt, nur Domains"));
            } else {
                blocklists.put(String.valueOf(list.getBlocklistId()), new BlocklistStatusDto(allApplied, null));
            }
        }

        return new StatusDto(
                routerId,
                connection,
                state == null ? null : state.getCheckedAt(),
                new CapabilitiesDto(publisher.enabled(), publisher.enabled()),
                new AdblockDto(installed, enabled, adblockApplied),
                priorityControl.status(routerId, connection),
                blocklists,
                Map.of(),
                confirmed ? state.getError() : null);
    }

    // The agent installs adblock-fast by itself as soon as adblock is wanted. So "install" switches
    // the wanted state on and sends it again; done is only what the next status readback shows.
    @POST
    @Path("adblock/install")
    public Response installAdblock() {
        if (!publisher.enabled()) {
            throw new WebApplicationException("Routersteuerung ist im SSH-Modus nicht verfügbar", 501);
        }
        long routerId = currentRouter.require().getId();
        boolean found = QuarkusTransaction.requiringNew().call(() -> {
            Config config = entityManager.createQuery("SELECT c FROM Config c WHERE c.routerId = :routerId", Config.class)
                    .setParameter("routerId", routerId).getResultStream().findFirst().orElse(null);
            if (config != null) {
                config.setDnsBlocking(true);
            }
            return config != null;
        });
        if (!found) {
            throw new WebApplicationException("Keine Router-Einstellung vorhanden", Response.Status.CONFLICT);
        }
        publisher.publishAll(true);
        return Response.accepted(Map.of("accepted", true)).build();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    // routerId lets the frontend check that a confirmation belongs to the router it shows
    public record StatusDto(long routerId, String connection, Instant checkedAt, CapabilitiesDto capabilities, AdblockDto adblock,
                            Map<String, Object> priority, Map<String, BlocklistStatusDto> blocklists,
                            Map<String, Object> timeLimits, String error) {
    }

    public record CapabilitiesDto(boolean adblockInstall, boolean devicePriority) {
    }

    public record AdblockDto(boolean installed, boolean enabled, boolean applied) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BlocklistStatusDto(boolean applied, String error) {
    }
}
