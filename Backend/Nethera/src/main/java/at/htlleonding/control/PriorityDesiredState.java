package at.htlleonding.control;

import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.DevicePriority;
import at.htlleonding.model.DevicePresetAssignment;
import at.htlleonding.model.SecurityPreset;
import java.util.*;
import java.util.regex.Pattern;

public record PriorityDesiredState(Map<String, String> devices, Map<Long, String> macByDevice) {
    private static final Pattern MAC = Pattern.compile("([0-9a-f]{2}:){5}[0-9a-f]{2}");
    public static PriorityDesiredState build(long routerId, List<SecurityPreset> presets,
            List<DevicePresetAssignment> assignments, List<ConnectedDevice> devices) {
        return build(routerId, presets, assignments, devices, List.of());
    }
    public static PriorityDesiredState build(long routerId, List<SecurityPreset> presets,
            List<DevicePresetAssignment> assignments, List<ConnectedDevice> devices, List<DevicePriority> preferences) {
        Map<Long, String> overrides = new HashMap<>();
        preferences.forEach(p -> overrides.put(p.getDeviceId(), p.getMode()));
        Map<Long, Boolean> high = new HashMap<>();
        for (SecurityPreset preset : presets) {
            if (Objects.equals(preset.getRouterId(), routerId)) high.put(preset.getId(), Boolean.TRUE.equals(preset.getPriorityMode()));
        }
        Map<Long, Boolean> wanted = new HashMap<>();
        for (DevicePresetAssignment assignment : assignments) {
            wanted.put(assignment.getDeviceId(), !"paused".equalsIgnoreCase(assignment.getStatus())
                    && Boolean.TRUE.equals(high.get(assignment.getPresetId())));
        }
        Map<String, String> modes = new TreeMap<>();
        Map<Long, String> macs = new TreeMap<>();
        for (ConnectedDevice device : devices) {
            if (device.getRouter() == null || !Objects.equals(device.getRouter().getId(), routerId)) continue;
            String mac = device.getMacAddress() == null ? "" : device.getMacAddress().trim().toLowerCase(Locale.ROOT);
            if (!MAC.matcher(mac).matches() || mac.equals("00:00:00:00:00:00") || (Integer.parseInt(mac.substring(0, 2), 16) & 1) != 0) continue;
            macs.put(device.getId(), mac);
            String mode = overrides.getOrDefault(device.getId(), Boolean.TRUE.equals(wanted.get(device.getId())) ? "high" : "normal");
            // If duplicate historic rows share a MAC, an active preference wins deterministically.
            modes.merge(mac, mode, (a, b) -> a.equals("high") || b.equals("high") ? "high" : "normal");
        }
        return new PriorityDesiredState(modes, macs);
    }
}
