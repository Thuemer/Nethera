package at.htlleonding.control;

import at.htlleonding.model.BlockList;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.DeviceGroup;
import at.htlleonding.model.DeviceGroupMember;
import at.htlleonding.model.DevicePresetAssignment;
import at.htlleonding.model.SecurityPreset;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;

// What one router should do: adblock on/off, domains blocked for everyone, domains blocked per device (MAC).
// Sorted collections keep the JSON stable, so an unchanged state is recognised as unchanged.
public record DnsDesiredState(boolean adblock, List<String> network, Map<String, List<String>> devices) {

    // Same rules as the agent (router/agent/control_dns.go); it refuses the whole message otherwise
    private static final Pattern DOMAIN = Pattern.compile("([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}");
    private static final Pattern MAC = Pattern.compile("([0-9a-f]{2}:){5}[0-9a-f]{2}");

    public static DnsDesiredState build(long routerId,
                                        boolean adblock,
                                        List<BlockList> blocklists,
                                        List<DeviceGroup> groups,
                                        List<DeviceGroupMember> members,
                                        List<SecurityPreset> presets,
                                        List<DevicePresetAssignment> assignments,
                                        List<ConnectedDevice> devices) {
        Map<Long, List<String>> domainsByList = new HashMap<>();
        TreeSet<String> network = new TreeSet<>();
        for (BlockList list : blocklists) {
            if (!Objects.equals(list.getRouterId(), routerId)) {
                continue;
            }
            List<String> domains = domains(list.getUrlPattern());
            domainsByList.put(list.getBlocklistId(), domains);
            // Only lists made for the whole network. A group/device list that nobody uses any
            // more (the frontend creates a new one on every change) must not block everyone.
            if ("NETWORK".equals(list.getSourceType()) || (adblock && "DNS".equals(list.getSourceType()))) {
                network.addAll(domains);
            }
        }

        Map<Long, String> macByDevice = new HashMap<>();
        for (ConnectedDevice device : devices) {
            String mac = device.getMacAddress() == null ? "" : device.getMacAddress().trim().toLowerCase(Locale.ROOT);
            if (device.getRouter() != null && Objects.equals(device.getRouter().getId(), routerId) && MAC.matcher(mac).matches()) {
                macByDevice.put(device.getId(), mac);
            }
        }

        Map<String, TreeSet<String>> perDevice = new TreeMap<>();
        Map<Long, Long> listByGroup = new HashMap<>();
        groups.forEach(group -> listByGroup.put(group.getId(), group.getBlocklistId()));
        for (DeviceGroupMember member : members) {
            add(perDevice, macByDevice.get(member.getDeviceId()), domainsByList.get(listByGroup.get(member.getGroupId())));
        }

        Map<Long, Long> listByPreset = new HashMap<>();
        presets.forEach(preset -> listByPreset.put(preset.getId(), preset.getBlocklistId()));
        for (DevicePresetAssignment assignment : assignments) {
            if (!"paused".equalsIgnoreCase(assignment.getStatus())) {
                add(perDevice, macByDevice.get(assignment.getDeviceId()), domainsByList.get(listByPreset.get(assignment.getPresetId())));
            }
        }

        Map<String, List<String>> result = new TreeMap<>();
        perDevice.forEach((mac, domains) -> {
            // What is blocked for everyone needs no extra device rule
            domains.removeAll(network);
            if (!domains.isEmpty()) {
                result.put(mac, List.copyOf(domains));
            }
        });
        return new DnsDesiredState(adblock, List.copyOf(network), result);
    }

    private static void add(Map<String, TreeSet<String>> perDevice, String mac, List<String> domains) {
        if (mac != null && domains != null && !domains.isEmpty()) {
            perDevice.computeIfAbsent(mac, key -> new TreeSet<>()).addAll(domains);
        }
    }

    // Splits a stored list ("a.com|b.com") and keeps only real domains; category words like "adult" are dropped
    public static List<String> domains(String urlPattern) {
        TreeSet<String> result = new TreeSet<>();
        if (urlPattern != null) {
            for (String token : urlPattern.split("[|,;\\s]+")) {
                String domain = token.trim().toLowerCase(Locale.ROOT)
                        .replaceFirst("^[a-z]+://", "")
                        .replaceFirst("[/:?#].*$", "")
                        .replaceFirst("\\.$", "");
                if (domain.length() <= 253 && DOMAIN.matcher(domain).matches()) {
                    result.add(domain);
                }
            }
        }
        return List.copyOf(result);
    }
}
