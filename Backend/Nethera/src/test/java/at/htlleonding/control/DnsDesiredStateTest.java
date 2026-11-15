package at.htlleonding.control;

import at.htlleonding.model.BlockList;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.DeviceGroup;
import at.htlleonding.model.DeviceGroupMember;
import at.htlleonding.model.DevicePresetAssignment;
import at.htlleonding.model.Router;
import at.htlleonding.model.SecurityPreset;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DnsDesiredStateTest {

    private static final String KID_PHONE = "aa:bb:cc:00:00:01";
    private static final String LAPTOP = "aa:bb:cc:00:00:02";

    private final List<ConnectedDevice> devices = List.of(
            device(1, 1, "AA:BB:CC:00:00:01"),
            device(2, 1, LAPTOP),
            device(3, 2, "aa:bb:cc:00:00:03"));

    @Test
    void networkListBlocksForEveryone() {
        DnsDesiredState state = build(false, List.of(list(1, 1, "NETWORK", "TikTok.com|instagram.com")),
                List.of(), List.of(), List.of(), List.of());

        assertEquals(List.of("instagram.com", "tiktok.com"), state.network());
        assertTrue(state.devices().isEmpty());
    }

    @Test
    void groupListBlocksOnlyForItsMembers() {
        DnsDesiredState state = build(false, List.of(list(1, 1, "GROUP", "youtube.com")),
                List.of(group(10, 1L)), List.of(member(10, 1)), List.of(), List.of());

        assertTrue(state.network().isEmpty());
        assertEquals(Map.of(KID_PHONE, List.of("youtube.com")), state.devices());
    }

    @Test
    void presetListBlocksForAssignedDeviceUnlessPaused() {
        List<BlockList> lists = List.of(list(1, 1, "DEVICE", "twitch.tv"));
        List<SecurityPreset> presets = List.of(preset(20, 1L));

        DnsDesiredState active = build(false, lists, List.of(), List.of(), presets,
                List.of(assignment(1, 20, "active"), assignment(2, 20, "paused")));

        assertEquals(Map.of(KID_PHONE, List.of("twitch.tv")), active.devices());
    }

    @Test
    void groupAndPresetDomainsOfOneDeviceAreMerged() {
        DnsDesiredState state = build(false,
                List.of(list(1, 1, "GROUP", "youtube.com|twitch.tv"), list(2, 1, "DEVICE", "twitch.tv|discord.com")),
                List.of(group(10, 1L)), List.of(member(10, 1)),
                List.of(preset(20, 2L)), List.of(assignment(1, 20, "active")));

        assertEquals(Map.of(KID_PHONE, List.of("discord.com", "twitch.tv", "youtube.com")), state.devices());
    }

    @Test
    void unusedGroupOrDeviceListBlocksNobody() {
        // The frontend leaves the old list behind when a group or device list changes
        DnsDesiredState state = build(false,
                List.of(list(1, 1, "GROUP", "youtube.com"), list(2, 1, "DEVICE", "twitch.tv")),
                List.of(), List.of(), List.of(), List.of());

        assertTrue(state.network().isEmpty());
        assertTrue(state.devices().isEmpty());
    }

    @Test
    void ownAdListCountsOnlyWhileAdblockIsOn() {
        List<BlockList> lists = List.of(list(1, 1, "DNS", "ads.example.net"));

        assertTrue(build(false, lists, List.of(), List.of(), List.of(), List.of()).network().isEmpty());
        DnsDesiredState on = build(true, lists, List.of(), List.of(), List.of(), List.of());
        assertTrue(on.adblock());
        assertEquals(List.of("ads.example.net"), on.network());
    }

    @Test
    void categoryWordsAndGarbageAreDropped() {
        assertEquals(List.of("example.com", "sub.example.org"),
                DnsDesiredState.domains("adult|gambling| https://Example.com/path?x=1 |sub.example.org.|bad_domain.com|;rm -rf /|-x.com"));
        assertTrue(DnsDesiredState.domains(null).isEmpty());
    }

    @Test
    void otherRoutersListsAndDevicesAreIgnored() {
        DnsDesiredState state = build(false,
                List.of(list(1, 2, "NETWORK", "tiktok.com"), list(2, 1, "GROUP", "youtube.com")),
                List.of(group(10, 2L)), List.of(member(10, 3)), List.of(), List.of());

        assertTrue(state.network().isEmpty());
        assertTrue(state.devices().isEmpty());
    }

    @Test
    void domainBlockedForEveryoneNeedsNoDeviceRule() {
        DnsDesiredState state = build(false,
                List.of(list(1, 1, "NETWORK", "tiktok.com"), list(2, 1, "GROUP", "tiktok.com")),
                List.of(group(10, 2L)), List.of(member(10, 2)), List.of(), List.of());

        assertEquals(List.of("tiktok.com"), state.network());
        assertTrue(state.devices().isEmpty());
    }

    private DnsDesiredState build(boolean adblock, List<BlockList> lists, List<DeviceGroup> groups, List<DeviceGroupMember> members,
                                  List<SecurityPreset> presets, List<DevicePresetAssignment> assignments) {
        return DnsDesiredState.build(1, adblock, lists, groups, members, presets, assignments, devices);
    }

    private static BlockList list(long id, long routerId, String sourceType, String pattern) {
        BlockList list = new BlockList();
        list.setBlocklistId(id);
        list.setRouterId(routerId);
        list.setSourceType(sourceType);
        list.setUrlPattern(pattern);
        return list;
    }

    private static ConnectedDevice device(long id, long routerId, String mac) {
        Router router = new Router();
        router.setId(routerId);
        ConnectedDevice device = new ConnectedDevice();
        device.setId(id);
        device.setMacAddress(mac);
        device.setRouter(router);
        return device;
    }

    private static DeviceGroup group(long id, Long blocklistId) {
        DeviceGroup group = new DeviceGroup();
        group.setId(id);
        group.setBlocklistId(blocklistId);
        return group;
    }

    private static DeviceGroupMember member(long groupId, long deviceId) {
        DeviceGroupMember member = new DeviceGroupMember();
        member.setGroupId(groupId);
        member.setDeviceId(deviceId);
        return member;
    }

    private static SecurityPreset preset(long id, Long blocklistId) {
        SecurityPreset preset = new SecurityPreset();
        preset.setId(id);
        preset.setBlocklistId(blocklistId);
        return preset;
    }

    private static DevicePresetAssignment assignment(long deviceId, long presetId, String status) {
        DevicePresetAssignment assignment = new DevicePresetAssignment();
        assignment.setDeviceId(deviceId);
        assignment.setPresetId(presetId);
        assignment.setStatus(status);
        return assignment;
    }
}
