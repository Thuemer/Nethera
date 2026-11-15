package at.htlleonding.boundary;

import at.htlleonding.control.DnsDesiredState;
import at.htlleonding.control.RouterControlPublisher;
import at.htlleonding.model.BlockList;
import at.htlleonding.model.Config;
import at.htlleonding.model.Router;
import at.htlleonding.model.RouterControlState;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.util.Map;
import java.util.TreeMap;

// Tells the frontend what the router really confirmed (Documentation/router-control-frontend-contract.md)
@Path("api/router-control")
@Produces(MediaType.APPLICATION_JSON)
public class RouterControlResource {

    @Inject
    EntityManager entityManager;

    @Inject
    RouterControlPublisher publisher;

    // There is no user-to-router mapping yet, so every user sees the one configured router
    @ConfigProperty(name = "nethera.router.id", defaultValue = "1")
    long routerId;

    @GET
    @Path("status")
    public StatusDto status() {
        Router router = entityManager.find(Router.class, routerId);
        RouterControlState state = entityManager.find(RouterControlState.class, routerId);

        String connection = router == null || router.getOnline() == null ? "unknown" : router.getOnline() ? "online" : "offline";
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
                connection,
                state == null ? null : state.getCheckedAt(),
                new CapabilitiesDto(publisher.enabled()),
                new AdblockDto(installed, enabled, adblockApplied),
                Map.of(),
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
        boolean found = QuarkusTransaction.requiringNew().call(() -> {
            Config config = entityManager.createQuery("SELECT c FROM Config c ORDER BY c.id", Config.class)
                    .setMaxResults(1).getResultStream().findFirst().orElse(null);
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
    public record StatusDto(String connection, Instant checkedAt, CapabilitiesDto capabilities, AdblockDto adblock,
                            Map<String, Object> priority, Map<String, BlocklistStatusDto> blocklists,
                            Map<String, Object> timeLimits, String error) {
    }

    public record CapabilitiesDto(boolean adblockInstall) {
    }

    public record AdblockDto(boolean installed, boolean enabled, boolean applied) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BlocklistStatusDto(boolean applied, String error) {
    }
}
