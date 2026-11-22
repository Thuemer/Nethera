package at.htlleonding.boundary;

import at.htlleonding.control.RouterControlChanged;
import at.htlleonding.model.*;
import at.htlleonding.services.CurrentRouter;
import io.quarkus.security.Authenticated;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;

@Authenticated
@Path("api/security")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class SecurityStateResource {

    @Inject
    EntityManager entityManager;

    // Delivered after the commit; the router then gets the new blocked websites
    @Inject
    Event<RouterControlChanged> routerControlChanged;

    @Inject
    CurrentRouter currentRouter;

    // Only rules of the caller's router: directly by router_id, or through the router's devices
    @GET
    @Path("state")
    public SecurityStateDto state() {
        Router router = currentRouter.router().orElse(null);
        if (router == null) {
            return new SecurityStateDto(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        }
        List<ConnectedDevice> devices = currentRouter.devices();
        List<Long> deviceIds = devices.stream().map(ConnectedDevice::getId).toList();
        return new SecurityStateDto(
                devices.stream().map(this::deviceDto).toList(),
                byRouter("SELECT g FROM DeviceGroup g WHERE g.routerId = :routerId ORDER BY g.name", DeviceGroup.class, router).stream().map(this::groupDto).toList(),
                byDevices("SELECT m FROM DeviceGroupMember m WHERE m.deviceId IN :ids ORDER BY m.groupId, m.deviceId", DeviceGroupMember.class, deviceIds).stream().map(this::memberDto).toList(),
                byRouter("SELECT b FROM BlockList b WHERE b.routerId = :routerId ORDER BY b.name", BlockList.class, router).stream().map(this::blocklistDto).toList(),
                byRouter("SELECT p FROM SecurityPreset p WHERE p.routerId = :routerId ORDER BY p.name", SecurityPreset.class, router).stream().map(this::presetDto).toList(),
                byDevices("SELECT a FROM DevicePresetAssignment a WHERE a.deviceId IN :ids ORDER BY a.deviceId", DevicePresetAssignment.class, deviceIds).stream().map(this::assignmentDto).toList(),
                byDevices("SELECT l FROM DeviceTimeLimit l WHERE l.device.id IN :ids", DeviceTimeLimit.class, deviceIds).stream().map(this::limitDto).toList()
        );
    }

    @POST
    @Path("groups")
    @Transactional
    public GroupDto saveGroup(GroupDto dto) {
        routerControlChanged.fire(new RouterControlChanged());
        RequestValidation.requireBody(dto);
        Router router = currentRouter.require();
        DeviceGroup group = dto.id() == null ? new DeviceGroup() : currentRouter.owned(DeviceGroup.class, dto.id(), "Gruppe nicht gefunden");
        group.setRouterId(router.getId());

        group.setName(blankToDefault(dto.name(), "Neue Gruppe"));
        group.setDescription(dto.description());
        group.setColor(blankToDefault(dto.color(), "#2fb09a"));
        group.setBlocklistId(ownBlocklistId(dto.blocklistId()));

        if (group.getId() == null) {
            entityManager.persist(group);
            return groupDto(group);
        }

        return groupDto(entityManager.merge(group));
    }

    @DELETE
    @Path("groups/{groupId}")
    @Transactional
    public Response deleteGroup(@PathParam("groupId") Long groupId) {
        routerControlChanged.fire(new RouterControlChanged());
        DeviceGroup group = currentRouter.owned(DeviceGroup.class, groupId, "Gruppe nicht gefunden");

        entityManager.createQuery("DELETE FROM DeviceGroupMember m WHERE m.groupId = :groupId")
                .setParameter("groupId", groupId)
                .executeUpdate();
        entityManager.remove(group);
        return Response.noContent().build();
    }

    @PUT
    @Path("groups/{groupId}/members/{deviceId}")
    @Transactional
    public MemberDto addMember(@PathParam("groupId") Long groupId, @PathParam("deviceId") Long deviceId) {
        routerControlChanged.fire(new RouterControlChanged());
        // Both must belong to the caller's router, which also keeps a group to one router
        currentRouter.owned(DeviceGroup.class, groupId, "Gruppe nicht gefunden");
        currentRouter.device(deviceId);

        DeviceGroupMember member = entityManager.createQuery(
                        "SELECT m FROM DeviceGroupMember m WHERE m.groupId = :groupId AND m.deviceId = :deviceId",
                        DeviceGroupMember.class)
                .setParameter("groupId", groupId)
                .setParameter("deviceId", deviceId)
                .getResultStream()
                .findFirst()
                .orElseGet(DeviceGroupMember::new);

        member.setGroupId(groupId);
        member.setDeviceId(deviceId);
        if (member.getId() == null) {
            entityManager.persist(member);
        }
        return memberDto(member);
    }

    @DELETE
    @Path("groups/{groupId}/members/{deviceId}")
    @Transactional
    public Response removeMember(@PathParam("groupId") Long groupId, @PathParam("deviceId") Long deviceId) {
        routerControlChanged.fire(new RouterControlChanged());
        currentRouter.owned(DeviceGroup.class, groupId, "Gruppe nicht gefunden");
        currentRouter.device(deviceId);
        entityManager.createQuery("DELETE FROM DeviceGroupMember m WHERE m.groupId = :groupId AND m.deviceId = :deviceId")
                .setParameter("groupId", groupId)
                .setParameter("deviceId", deviceId)
                .executeUpdate();
        return Response.noContent().build();
    }

    @POST
    @Path("blocklists")
    @Transactional
    public BlocklistDto saveBlocklist(BlocklistDto dto) {
        routerControlChanged.fire(new RouterControlChanged());
        RequestValidation.requireBody(dto);
        Router router = currentRouter.require();
        BlockList blocklist = dto.id() == null ? new BlockList() : currentRouter.owned(BlockList.class, dto.id(), "Blockliste nicht gefunden");

        // dto.routerId() is ignored: the router comes from the logged-in account
        blocklist.setRouterId(router.getId());
        blocklist.setName(blankToDefault(dto.name(), "Neue Blockliste"));
        blocklist.setSourceType(blankToDefault(dto.sourceType(), "CUSTOM"));
        blocklist.setUrlPattern(blankToDefault(dto.urlPattern(), ""));

        if (blocklist.getBlocklistId() == null) {
            entityManager.persist(blocklist);
            return blocklistDto(blocklist);
        }

        return blocklistDto(entityManager.merge(blocklist));
    }

    @POST
    @Path("presets")
    @Transactional
    public PresetDto savePreset(PresetDto dto) {
        routerControlChanged.fire(new RouterControlChanged());
        RequestValidation.requireBody(dto);
        Router router = currentRouter.require();
        SecurityPreset preset = dto.id() == null ? new SecurityPreset() : currentRouter.owned(SecurityPreset.class, dto.id(), "Preset nicht gefunden");
        preset.setRouterId(router.getId());

        preset.setName(blankToDefault(dto.name(), "Neues Preset"));
        preset.setDescription(dto.description());
        preset.setBlocklistId(ownBlocklistId(dto.blocklistId()));
        preset.setTimeLimitMinutes(RequestValidation.minutesPerDay("timeLimitMinutes", dto.timeLimitMinutes()));
        preset.setBlockedFrom(RequestValidation.timeOfDay("blockedFrom", dto.blockedFrom()));
        preset.setBlockedUntil(RequestValidation.timeOfDay("blockedUntil", dto.blockedUntil()));
        preset.setParentalMode(dto.parentalMode() == null ? Boolean.FALSE : dto.parentalMode());
        preset.setPriorityMode(dto.priorityMode() == null ? Boolean.FALSE : dto.priorityMode());

        if (preset.getId() == null) {
            entityManager.persist(preset);
            return presetDto(preset);
        }

        return presetDto(entityManager.merge(preset));
    }

    @PUT
    @Path("devices/{deviceId}/preset/{presetId}")
    @Transactional
    public AssignmentDto assignPreset(@PathParam("deviceId") Long deviceId, @PathParam("presetId") Long presetId) {
        routerControlChanged.fire(new RouterControlChanged());
        currentRouter.device(deviceId);
        currentRouter.owned(SecurityPreset.class, presetId, "Preset nicht gefunden");

        DevicePresetAssignment assignment = entityManager.createNamedQuery(DevicePresetAssignment.QUERY_FIND_BY_DEVICE, DevicePresetAssignment.class)
                .setParameter("deviceId", deviceId)
                .getResultStream()
                .findFirst()
                .orElseGet(DevicePresetAssignment::new);

        assignment.setDeviceId(deviceId);
        assignment.setPresetId(presetId);
        assignment.setStatus("active");
        if (assignment.getId() == null) {
            entityManager.persist(assignment);
            return assignmentDto(assignment);
        }

        return assignmentDto(entityManager.merge(assignment));
    }

    @DELETE
    @Path("devices/{deviceId}/preset")
    @Transactional
    public Response removePreset(@PathParam("deviceId") Long deviceId) {
        routerControlChanged.fire(new RouterControlChanged());
        currentRouter.device(deviceId);
        entityManager.createQuery("DELETE FROM DevicePresetAssignment a WHERE a.deviceId = :deviceId")
                .setParameter("deviceId", deviceId)
                .executeUpdate();
        return Response.noContent().build();
    }

    private Long ownBlocklistId(Long blocklistId) {
        return blocklistId == null ? null : currentRouter.owned(BlockList.class, blocklistId, "Blockliste nicht gefunden").getBlocklistId();
    }

    private <T> List<T> byRouter(String query, Class<T> type, Router router) {
        return entityManager.createQuery(query, type).setParameter("routerId", router.getId()).getResultList();
    }

    private <T> List<T> byDevices(String query, Class<T> type, List<Long> deviceIds) {
        return deviceIds.isEmpty() ? List.of() : entityManager.createQuery(query, type).setParameter("ids", deviceIds).getResultList();
    }

    private String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private DeviceDto deviceDto(ConnectedDevice device) {
        return new DeviceDto(device.getId(), device.getMacAddress(), device.getIpAddress(), device.getHostname(), device.getConnectionType(), String.valueOf(device.getLastSeen()));
    }

    private GroupDto groupDto(DeviceGroup group) {
        return new GroupDto(group.getId(), group.getName(), group.getDescription(), group.getBlocklistId(), group.getColor());
    }

    private MemberDto memberDto(DeviceGroupMember member) {
        return new MemberDto(member.getId(), member.getGroupId(), member.getDeviceId());
    }

    private BlocklistDto blocklistDto(BlockList blocklist) {
        return new BlocklistDto(blocklist.getBlocklistId(), blocklist.getRouterId(), blocklist.getName(), blocklist.getSourceType(), blocklist.getUrlPattern());
    }

    private PresetDto presetDto(SecurityPreset preset) {
        return new PresetDto(preset.getId(), preset.getName(), preset.getDescription(), preset.getBlocklistId(), preset.getTimeLimitMinutes(), preset.getBlockedFrom(), preset.getBlockedUntil(), preset.getParentalMode(), preset.getPriorityMode());
    }

    private AssignmentDto assignmentDto(DevicePresetAssignment assignment) {
        return new AssignmentDto(assignment.getId(), assignment.getDeviceId(), assignment.getPresetId(), assignment.getStatus());
    }

    private LimitDto limitDto(DeviceTimeLimit limit) {
        return new LimitDto(limit.getId(), limit.getDevice().getId(), limit.getDailyLimitMinutes(), null, limit.getBlockedFrom(), limit.getBlockedUntil(), limit.getStatus(), limit.getNote());
    }

    public record SecurityStateDto(
            List<DeviceDto> devices,
            List<GroupDto> groups,
            List<MemberDto> members,
            List<BlocklistDto> blocklists,
            List<PresetDto> presets,
            List<AssignmentDto> assignments,
            List<LimitDto> timeLimits
    ) {}

    public record DeviceDto(Long id, String macAddress, String ipAddress, String hostname, String connectionType, String lastSeen) {}

    public record GroupDto(Long id, String name, String description, Long blocklistId, String color) {}

    public record MemberDto(Long id, Long groupId, Long deviceId) {}

    public record BlocklistDto(Long id, Long routerId, String name, String sourceType, String urlPattern) {}

    public record PresetDto(Long id, String name, String description, Long blocklistId, Integer timeLimitMinutes, String blockedFrom, String blockedUntil, Boolean parentalMode, Boolean priorityMode) {}

    public record AssignmentDto(Long id, Long deviceId, Long presetId, String status) {}

    public record LimitDto(Long id, Long deviceId, Integer dailyLimitMinutes, Integer usedMinutesToday, String blockedFrom, String blockedUntil, String status, String note) {}
}
