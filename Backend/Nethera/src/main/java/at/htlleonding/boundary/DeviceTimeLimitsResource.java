package at.htlleonding.boundary;

import at.htlleonding.dto.DeviceTimeLimitDto;
import at.htlleonding.model.DeviceTimeLimit;
import at.htlleonding.repository.DeviceTimeLimitsRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;

@Path("api/device-time-limits")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DeviceTimeLimitsResource {

    @Inject
    DeviceTimeLimitsRepository repository;

    @GET
    public List<DeviceTimeLimitDto> getAll() {
        return repository.getAll().stream().map(this::toDto).toList();
    }

    @PUT
    @Path("{deviceId}")
    public Response save(@PathParam("deviceId") Long deviceId, DeviceTimeLimitDto dto) {
        DeviceTimeLimit input = new DeviceTimeLimit();
        input.setDailyLimitMinutes(dto.dailyLimitMinutes());
        input.setUsedMinutesToday(dto.usedMinutesToday());
        input.setBlockedFrom(dto.blockedFrom());
        input.setBlockedUntil(dto.blockedUntil());
        input.setStatus(dto.status() == null ? "active" : dto.status());
        input.setNote(dto.note());

        DeviceTimeLimit saved = repository.save(deviceId, input);
        if (saved == null) {
            throw new NotFoundException("Geraet nicht gefunden");
        }

        return Response.ok(toDto(saved)).build();
    }

    @DELETE
    @Path("{deviceId}")
    public Response delete(@PathParam("deviceId") Long deviceId) {
        if (!repository.deleteByDeviceId(deviceId)) {
            throw new NotFoundException("Zeitlimit nicht gefunden");
        }

        return Response.noContent().build();
    }

    private DeviceTimeLimitDto toDto(DeviceTimeLimit limit) {
        return new DeviceTimeLimitDto(
                limit.getId(),
                limit.getDevice().getId(),
                limit.getDailyLimitMinutes(),
                limit.getUsedMinutesToday(),
                limit.getBlockedFrom(),
                limit.getBlockedUntil(),
                limit.getStatus(),
                limit.getNote()
        );
    }
}
