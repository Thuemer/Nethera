package at.htlleonding.boundary;

import at.htlleonding.dto.RouterActivityLogsDto;
import at.htlleonding.dto.RouterConnectedDevicesDto;
import at.htlleonding.dto.RouterDnsStatsDto;
import at.htlleonding.dto.RouterDto;
import at.htlleonding.dto.RouterSpeedStatsDto;
import at.htlleonding.model.Router;
import at.htlleonding.model.TelemetryRecord;
import at.htlleonding.telemetry.RouterDataPolicy;
import at.htlleonding.repository.ActivityLogsRepository;
import at.htlleonding.repository.DnsStatsRepository;
import at.htlleonding.repository.SpeedStatsRepository;
import at.htlleonding.model.Account;
import at.htlleonding.services.CurrentRouter;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Authenticated
@Path("api/routers")
public class RoutersResource {

    // The dashboard only shows recent data; returning the full history grew the response every sync
    static final int SPEED_HISTORY_LIMIT = 1440;
    static final int ACTIVITY_LOG_LIMIT = 50;

    @Inject
    SpeedStatsRepository speedStatsRepository;

    @Inject
    DnsStatsRepository dnsStatsRepository;

    @Inject
    ActivityLogsRepository activityLogsRepository;

    @Inject
    RouterDataPolicy dataPolicy;

    @Inject
    CurrentRouter currentRouter;

    @Inject
    EntityManager entityManager;

    // Only the caller's router; an empty list means "no router connected yet"
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<RouterDto> getAllRouters() {
        return currentRouter.router().map(router -> List.of(toDto(router))).orElse(List.of());
    }

    @POST
    @Path("claim")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    public RouterDto claim(ClaimDto dto) {
        String code = dto == null ? null : Router.normalizePairingCode(dto.pairingCode());
        if (code == null) {
            throw new BadRequestException("Kopplungscode fehlt");
        }
        Router router = entityManager.createNamedQuery(Router.QUERY_FIND_BY_PAIRING_CODE, Router.class)
                .setParameter("code", code)
                // Two accounts claiming the same router at once: the second waits and then sees the owner
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultStream()
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Kopplungscode unbekannt"));

        Account account = currentRouter.account();
        if (router.getOwner() != null && !router.getOwner().getId().equals(account.getId())) {
            throw new ClientErrorException("Router ist bereits mit einem anderen Konto verbunden", Response.Status.CONFLICT);
        }
        currentRouter.router().filter(own -> !own.getId().equals(router.getId())).ifPresent(own -> {
            throw new ClientErrorException("Mit diesem Konto ist bereits ein anderer Router verbunden", Response.Status.CONFLICT);
        });

        router.setOwner(account);
        return toDto(router);
    }

    @DELETE
    @Path("mine")
    @Transactional
    public Response release() {
        Router router = currentRouter.require();
        router.setOwner(null);
        entityManager.merge(router);
        return Response.noContent().build();
    }

    private RouterDto toDto(Router router) {
        // "DNS Heute" card sums these, so only today's rows
        LocalDateTime dnsSince = LocalDate.now().atStartOfDay();
        String connection = dataPolicy.connection(router);
        String mode = dataPolicy.mode(router);
        boolean live = "live".equals(mode);
        return new RouterDto(router.getId(), router.getName(), live && router.isRouterData() ? router.getModel() : null,
                live && router.isRouterData() ? router.getFirmware() : null,
                "unknown".equals(connection) ? null : "online".equals(connection), router.getLastSeen(),
                !live ? List.of() :
                router.getConnectedDevices().stream()
                        .filter(TelemetryRecord::isRouterData)
                        .map(device -> new RouterConnectedDevicesDto(device.getId(), device.getMacAddress(), device.getIpAddress(), device.getHostname(), device.getConnectionType(), device.getLastSeen())).toList(),
                !live ? List.of() : activityLogsRepository.findLatest(router, ACTIVITY_LOG_LIMIT).stream()
                        .map(log -> new RouterActivityLogsDto(log.getId(), log.getEventType(), log.getDetails(), log.getTimestamp())).toList(),
                !live ? List.of() : speedStatsRepository.findLatest(router, SPEED_HISTORY_LIMIT).stream()
                        .map(stat -> new RouterSpeedStatsDto(stat.getId(), stat.getTimestamp(), stat.getDownloadSpeed(), stat.getUploadSpeed())).toList(),
                !live ? List.of() : dnsStatsRepository.findSince(router, dnsSince).stream()
                        .map(stat -> new RouterDnsStatsDto(stat.getId(), stat.getTimestamp(), stat.getTotalQueries(), stat.getBlockedQueries(), stat.getTrackersDetected())).toList(),
                mode, connection, router.getConnectionCheckedAt()
        );
    }

    public record ClaimDto(String pairingCode) {}
}
