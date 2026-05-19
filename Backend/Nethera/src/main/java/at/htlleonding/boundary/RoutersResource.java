package at.htlleonding.boundary;

import at.htlleonding.dto.*;
import at.htlleonding.model.Router;
import at.htlleonding.repository.RoutersRepository;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Authenticated
@Path("api/routers")
public class RoutersResource {

    @Inject
    RoutersRepository routersRepository;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("list")
    public List<RouterDto> getAllRouters() {
        List<Router> routers = this.routersRepository.getAllRouters();
        List<RouterDto> routerDtos = routers.stream()
                .map(router -> new RouterDto(router.getId(), router.getName(), router.getModel(), router.getFirmware(), router.getOnline(), router.getLastSeen(),
                        router.getConnectedDevices().stream()
                                .map(device -> new RouterConnectedDevicesDto(device.getId(), device.getMacAddress(), device.getIpAddress(), device.getHostname(), device.getConnectionType(), device.getLastSeen())).toList(),
                        router.getActivityLogs().stream()
                                .map(log -> new RouterActivityLogsDto(log.getId(), log.getEventType(), log.getDetails(), log.getTimestamp())).toList(),
                        router.getSpeedStats().stream()
                                .map(stat -> new RouterSpeedStatsDto(stat.getId(), stat.getTimestamp(), stat.getDownloadSpeed(), stat.getUploadSpeed())).toList(),
                        router.getDnsStats().stream()
                                .map(stat -> new RouterDnsStatsDto(stat.getId(), stat.getTimestamp(), stat.getTotalQueries(), stat.getBlockedQueries(), stat.getTrackersDetected())).toList()
                ))
                .toList();
        return routerDtos;
    }

    /*
    public List<TeamSummaryDto> getAllTeams() {
        List<Team> teams = this.teamsRepository.getAllTeams();
        List<TeamSummaryDto> teamSummaryDtoList = teams.stream()
                .map(team -> new TeamSummaryDto(team.getId(), team.getName())).toList();
        return teamSummaryDtoList;
    }
    */
}

/*
@Path("api/players")
public class PlayersResource {
    @Inject
    PlayersRepository playersRepository;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("{teamId}/{jerseyNumber}")
    public PlayerDetailDto getPlayerById(@PathParam("teamId") String teamId, @PathParam("jerseyNumber") int jerseyNumber) {
        Player player = this.playersRepository.getPlayerById(teamId, jerseyNumber);

        if (player == null) {
            throw new NotFoundException();
        }

        Team team = player.getTeam();
        TeamSummaryDto teamDto = (team == null) ? null : new TeamSummaryDto(team.getId(), team.getName());

        PlayerDetailDto playerDetailDto = new PlayerDetailDto(
                player.getPlayerId().getTeamId(),
                player.getPlayerId().getJerseyNumber(),
                player.getName(),
                teamDto
        );
        return playerDetailDto;
    }
}

 */
