package at.htlleonding.boundary;

import at.htlleonding.dto.RouterActivityLogsDto;
import at.htlleonding.dto.RouterConnectedDevicesDto;
import at.htlleonding.dto.RouterDnsStatsDto;
import at.htlleonding.dto.RouterDto;
import at.htlleonding.dto.RouterSpeedStatsDto;
import at.htlleonding.model.Router;
import at.htlleonding.repository.ActivityLogsRepository;
import at.htlleonding.repository.DnsStatsRepository;
import at.htlleonding.repository.RoutersRepository;
import at.htlleonding.repository.SpeedStatsRepository;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

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
    RoutersRepository routersRepository;

    @Inject
    SpeedStatsRepository speedStatsRepository;

    @Inject
    DnsStatsRepository dnsStatsRepository;

    @Inject
    ActivityLogsRepository activityLogsRepository;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<RouterDto> getAllRouters() {
        // "DNS Heute" card sums these, so only today's rows
        LocalDateTime dnsSince = LocalDate.now().atStartOfDay();

        return this.routersRepository.getAllRouters().stream()
                .map(router -> new RouterDto(router.getId(), router.getName(), router.getModel(), router.getFirmware(), router.getOnline(), router.getLastSeen(),
                        router.getConnectedDevices().stream()
                                .map(device -> new RouterConnectedDevicesDto(device.getId(), device.getMacAddress(), device.getIpAddress(), device.getHostname(), device.getConnectionType(), device.getLastSeen())).toList(),
                        activityLogsRepository.findLatest(router, ACTIVITY_LOG_LIMIT).stream()
                                .map(log -> new RouterActivityLogsDto(log.getId(), log.getEventType(), log.getDetails(), log.getTimestamp())).toList(),
                        speedStatsRepository.findLatest(router, SPEED_HISTORY_LIMIT).stream()
                                .map(stat -> new RouterSpeedStatsDto(stat.getId(), stat.getTimestamp(), stat.getDownloadSpeed(), stat.getUploadSpeed())).toList(),
                        dnsStatsRepository.findSince(router, dnsSince).stream()
                                .map(stat -> new RouterDnsStatsDto(stat.getId(), stat.getTimestamp(), stat.getTotalQueries(), stat.getBlockedQueries(), stat.getTrackersDetected())).toList()
                ))
                .toList();
    }
}
