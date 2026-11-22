package at.htlleonding.boundary;

import at.htlleonding.dto.DeviceTimeLimitDto;
import at.htlleonding.model.DeviceTimeLimit;
import at.htlleonding.repository.DeviceTimeLimitsRepository;
import at.htlleonding.services.CurrentRouter;
import at.htlleonding.control.TimeControlChanged;
import at.htlleonding.control.TimeControlPublisher;
import at.htlleonding.control.TimeDesiredState;
import jakarta.enterprise.event.Event;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;

@Authenticated
@Path("api/device-time-limits")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DeviceTimeLimitsResource {

    @Inject
    DeviceTimeLimitsRepository repository;

    @Inject
    CurrentRouter currentRouter;

    @Inject TimeControlPublisher publisher;
    @Inject Event<TimeControlChanged> changed;
    @Inject EntityManager em;

    @GET
    public List<DeviceTimeLimitDto> getAll() {
        return repository.findByDeviceIds(currentRouter.deviceIds()).stream().map(this::toDto).toList();
    }

    // One transaction so the ownership-checked device is managed by the same session that saves the limit
    @PUT
    @Path("{deviceId}")
    @Transactional
    public Response save(@PathParam("deviceId") Long deviceId, DeviceTimeLimitDto dto) {
        RequestValidation.requireBody(dto);
        var device = currentRouter.device(deviceId);
        long routerId = device.getRouter().getId();
        em.lock(device.getRouter(), LockModeType.PESSIMISTIC_WRITE);
        DeviceTimeLimit input = new DeviceTimeLimit();
        input.setDailyLimitMinutes(RequestValidation.minutesPerDay("dailyLimitMinutes", dto.dailyLimitMinutes()));
        try {
            input.setBlockedFrom(TimeDesiredState.time(dto.blockedFrom()));
            input.setBlockedUntil(TimeDesiredState.time(dto.blockedUntil()));
        } catch (IllegalArgumentException e) { throw new BadRequestException(e.getMessage()); }
        if ((input.getBlockedFrom() == null) != (input.getBlockedUntil() == null)
                || (input.getBlockedFrom() != null && input.getBlockedFrom().equals(input.getBlockedUntil()))) {
            throw new BadRequestException("Bitte zwei unterschiedliche Uhrzeiten angeben");
        }
        if (input.getBlockedFrom() == null && (dto.dailyLimitMinutes() == null || dto.dailyLimitMinutes() == 0)) {
            throw new BadRequestException("Sperrzeit oder Tagesbudget fehlt");
        }
        input.setStatus(dto.status() == null ? "active" : dto.status());
        if (!List.of("active", "paused").contains(input.getStatus())) throw new BadRequestException("Ungültiger Regelstatus");
        if (dto.note() != null && dto.note().length() > 160) throw new BadRequestException("Notiz ist zu lang");
        input.setNote(dto.note());

        DeviceTimeLimit saved = repository.save(device, input);
        try { publisher.prepare(routerId); }
        catch (IllegalArgumentException e) { throw new BadRequestException(e.getMessage()); }
        changed.fire(new TimeControlChanged(routerId));

        return Response.ok(toDto(saved)).build();
    }

    @DELETE
    @Path("{deviceId}")
    @Transactional
    public Response delete(@PathParam("deviceId") Long deviceId) {
        var device = currentRouter.device(deviceId);
        long routerId = device.getRouter().getId();
        em.lock(device.getRouter(), LockModeType.PESSIMISTIC_WRITE);
        if (!repository.deleteByDeviceId(deviceId)) {
            throw new NotFoundException("Zeitlimit nicht gefunden");
        }

        publisher.prepare(routerId);
        changed.fire(new TimeControlChanged(routerId));
        return Response.noContent().build();
    }

    private DeviceTimeLimitDto toDto(DeviceTimeLimit limit) {
        return new DeviceTimeLimitDto(
                limit.getId(),
                limit.getDevice().getId(),
                limit.getDailyLimitMinutes(),
                null,
                limit.getBlockedFrom(),
                limit.getBlockedUntil(),
                limit.getStatus(),
                limit.getNote(),
                limit.getRouterEnforcement()
        );
    }
}
