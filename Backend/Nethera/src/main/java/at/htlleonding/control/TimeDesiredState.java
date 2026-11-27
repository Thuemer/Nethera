package at.htlleonding.control;

import at.htlleonding.model.DeviceTimeLimit;
import java.util.*;
import java.util.regex.Pattern;

// Compatibility adapter for the existing daily per-device editor. The wire
// contract is the same v1 contract as the reusable-schedule OpenSpec design.
public record TimeDesiredState(String timezone, String untilClockSync, Map<String, Rule> devices) {
    private static final Pattern MAC = Pattern.compile("([0-9a-f]{2}:){5}[0-9a-f]{2}");
    private static final Pattern TIME = Pattern.compile("([01][0-9]|2[0-3]):[0-5][0-9](:00)?");
    private static final List<String> DAYS = List.of("MO", "TU", "WE", "TH", "FR", "SA", "SU");
    public record Window(List<String> days, String from, String until) {}
    public record Rule(List<Window> windows, Map<String, Integer> budgets) {}

    public static TimeDesiredState build(long routerId, List<DeviceTimeLimit> limits) {
        Map<String, Rule> devices = new TreeMap<>();
        for (DeviceTimeLimit limit : limits) {
            var device = limit.getDevice();
            if (device == null || device.getRouter() == null || !Objects.equals(device.getRouter().getId(), routerId)
                    || !device.isRouterData() || !Boolean.TRUE.equals(limit.getRouterEnforcement())
                    || "paused".equals(limit.getStatus())) continue;
            if (!"active".equals(limit.getStatus())) throw new IllegalArgumentException("Ungültiger Regelstatus");
            String mac = device.getMacAddress() == null ? "" : device.getMacAddress().trim().toLowerCase(Locale.ROOT);
            if (!MAC.matcher(mac).matches()) throw new IllegalArgumentException("Gerät hat keine gültige MAC-Adresse");
            String from = time(limit.getBlockedFrom()), until = time(limit.getBlockedUntil());
            if ((from == null) != (until == null) || (from != null && from.equals(until))) {
                throw new IllegalArgumentException("Ungültiges Sperrzeitfenster");
            }
            int budget = limit.getDailyLimitMinutes() == null ? 0 : limit.getDailyLimitMinutes();
            if (budget < 0 || budget > 1440) throw new IllegalArgumentException("Ungültiges Tagesbudget");
            // Existing API: zero means unlimited, unlike zero on the agent wire.
            Map<String, Integer> budgets = new TreeMap<>();
            if (budget > 0) DAYS.forEach(day -> budgets.put(day, budget));
            List<Window> windows = from == null ? List.of() : List.of(new Window(DAYS, from, until));
            if (!windows.isEmpty() || !budgets.isEmpty()) {
                if (devices.putIfAbsent(mac, new Rule(windows, budgets)) != null) {
                    throw new IllegalArgumentException("Doppelte Geräte-MAC");
                }
            }
        }
        if (devices.size() > 100) throw new IllegalArgumentException("Höchstens 100 Geräte mit Zeitregel erlaubt");
        return new TimeDesiredState("Europe/Vienna", "OPEN", devices);
    }

    public static String time(String value) {
        if (value == null || value.isBlank()) return null;
        if (!TIME.matcher(value).matches()) throw new IllegalArgumentException("Uhrzeit muss HH:mm sein");
        return value.substring(0, 5);
    }
}
