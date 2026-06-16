package at.htlleonding.boundary;

import at.htlleonding.model.*;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;

@Path("api/security")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class SecurityStateResource {

    @Inject
    EntityManager entityManager;

    @GET
    @Path("state")
    public SecurityStateDto state() {
        return new SecurityStateDto(
                entityManager.createNamedQuery(ConnectedDevice.QUERY_FIND_ALL, ConnectedDevice.class).getResultList().stream().map(this::deviceDto).toList(),
                entityManager.createNamedQuery(DeviceGroup.QUERY_FIND_ALL, DeviceGroup.class).getResultList().stream().map(this::groupDto).toList(),
                entityManager.createNamedQuery(DeviceGroupMember.QUERY_FIND_ALL, DeviceGroupMember.class).getResultList().stream().map(this::memberDto).toList(),
                entityManager.createQuery("SELECT b FROM BlockList b ORDER BY b.name", BlockList.class).getResultList().stream().map(this::blocklistDto).toList(),
                entityManager.createNamedQuery(SecurityPreset.QUERY_FIND_ALL, SecurityPreset.class).getResultList().stream().map(this::presetDto).toList(),
                entityManager.createNamedQuery(DevicePresetAssignment.QUERY_FIND_ALL, DevicePresetAssignment.class).getResultList().stream().map(this::assignmentDto).toList(),
                entityManager.createNamedQuery(DeviceTimeLimit.QUERY_FIND_ALL, DeviceTimeLimit.class).getResultList().stream().map(this::limitDto).toList()
        );
    }

    @POST
    @Path("groups")
    @Transactional
    public GroupDto saveGroup(GroupDto dto) {
        DeviceGroup group = dto.id() == null ? new DeviceGroup() : entityManager.find(DeviceGroup.class, dto.id());
        if (group == null) {
            throw new NotFoundException("Gruppe nicht gefunden");
        }

        group.setName(blankToDefault(dto.name(), "Neue Gruppe"));
        group.setDescription(dto.description());
        group.setColor(blankToDefault(dto.color(), "#2fb09a"));
        group.setBlocklistId(dto.blocklistId());

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
        DeviceGroup group = entityManager.find(DeviceGroup.class, groupId);
        if (group == null) {
            throw new NotFoundException("Gruppe nicht gefunden");
        }

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
        require(DeviceGroup.class, groupId, "Gruppe nicht gefunden");
        require(ConnectedDevice.class, deviceId, "Geraet nicht gefunden");

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
        BlockList blocklist = dto.id() == null ? new BlockList() : entityManager.find(BlockList.class, dto.id());
        if (blocklist == null) {
            throw new NotFoundException("Blockliste nicht gefunden");
        }

        blocklist.setRouterId(dto.routerId() == null ? 1L : dto.routerId());
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
        SecurityPreset preset = dto.id() == null ? new SecurityPreset() : entityManager.find(SecurityPreset.class, dto.id());
        if (preset == null) {
            throw new NotFoundException("Preset nicht gefunden");
        }

        preset.setName(blankToDefault(dto.name(), "Neues Preset"));
        preset.setDescription(dto.description());
        preset.setBlocklistId(dto.blocklistId());
        preset.setTimeLimitMinutes(dto.timeLimitMinutes());
        preset.setBlockedFrom(dto.blockedFrom());
        preset.setBlockedUntil(dto.blockedUntil());
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
        require(ConnectedDevice.class, deviceId, "Geraet nicht gefunden");
        require(SecurityPreset.class, presetId, "Preset nicht gefunden");

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
        entityManager.createQuery("DELETE FROM DevicePresetAssignment a WHERE a.deviceId = :deviceId")
                .setParameter("deviceId", deviceId)
                .executeUpdate();
        return Response.noContent().build();
    }

    private <T> T require(Class<T> entityClass, Long id, String message) {
        T entity = entityManager.find(entityClass, id);
        if (entity == null) {
            throw new NotFoundException(message);
        }
        return entity;
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
        return new LimitDto(limit.getId(), limit.getDevice().getId(), limit.getDailyLimitMinutes(), limit.getUsedMinutesToday(), limit.getBlockedFrom(), limit.getBlockedUntil(), limit.getStatus(), limit.getNote());
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
