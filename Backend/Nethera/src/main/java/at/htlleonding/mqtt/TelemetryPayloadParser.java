package at.htlleonding.mqtt;

import at.htlleonding.telemetry.ControlSample;
import at.htlleonding.telemetry.CounterSample;
import at.htlleonding.telemetry.DeviceSnapshot;
import at.htlleonding.telemetry.DnsSample;
import at.htlleonding.telemetry.MetadataSample;
import at.htlleonding.telemetry.TimeSample;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// Parses and validates the JSON payloads of the MQTT telemetry contract (schema version 1)
public final class TelemetryPayloadParser {

    static final int SUPPORTED_VERSION = 1;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TelemetryPayloadParser() {
    }

    public static MetadataSample metadata(String payload) {
        JsonNode root = read(payload);
        // Missing or empty fields keep the stored value (see MetadataIngestor)
        return new MetadataSample(optionalText(root, "model"), optionalText(root, "firmware"));
    }

    public static CounterSample speed(String payload) {
        JsonNode root = read(payload);
        requiredText(root, "iface");
        return new CounterSample(requiredLong(root, "rxBytes"), requiredLong(root, "txBytes"), requiredLong(root, "ts"));
    }

    public static DnsSample dns(String payload) {
        JsonNode root = read(payload);
        return new DnsSample(requiredLong(root, "forwarded"), requiredLong(root, "answeredLocally"));
    }

    public static DeviceSnapshot devices(String payload) {
        JsonNode root = read(payload);
        List<DeviceSnapshot.Lease> leases = new ArrayList<>();
        for (JsonNode lease : requiredArray(root, "leases")) {
            leases.add(new DeviceSnapshot.Lease(
                    requiredText(lease, "mac").toLowerCase(),
                    requiredText(lease, "ip"),
                    lease.path("hostname").asText(null)));
        }
        return new DeviceSnapshot(leases, macs(root, "reachable"), macs(root, "wifi"));
    }

    public static ControlSample control(String payload) {
        JsonNode root = read(payload);
        JsonNode adblock = root.get("adblock");
        if (adblock == null || !adblock.isObject()) {
            throw new InvalidPayloadException("missing or non-object field 'adblock'");
        }
        String error = optionalText(root, "error");
        return new ControlSample(
                requiredLong(root, "ts"),
                requiredLong(root, "version"),
                requiredBoolean(root, "applied"),
                requiredBoolean(adblock, "installed"),
                requiredBoolean(adblock, "enabled"),
                error == null || error.isBlank() ? null : error);
    }

    public static TimeSample time(String payload) {
        if (payload.length() > 65536) throw new InvalidPayloadException("time report too large");
        JsonNode root = read(payload);
        long ts = requiredLong(root, "ts"), version = requiredLong(root, "version");
        if (ts < 0 || ts > 253402300799L || version < 0 || requiredLong(root, "v") != 1) {
            throw new InvalidPayloadException("invalid time report timestamp/version");
        }
        boolean applied = requiredBoolean(root, "applied"), synced = requiredBoolean(root, "clockSynced");
        String error = optionalText(root, "error");
        if (error != null && error.isBlank()) error = null;
        if (error != null && error.length() > 4096) throw new InvalidPayloadException("time error too long");
        if (applied && (version == 0 || error != null)) throw new InvalidPayloadException("contradictory time confirmation");
        JsonNode devices = root.path("devices");
        if (!devices.isObject() || devices.size() > 100) throw new InvalidPayloadException("invalid time devices");
        var result = new java.util.TreeMap<String, TimeSample.Device>();
        var fields = devices.fields();
        while (fields.hasNext()) {
            var item = fields.next();
            String mac = item.getKey().toLowerCase(java.util.Locale.ROOT);
            if (!mac.matches("([0-9a-f]{2}:){5}[0-9a-f]{2}") || result.containsKey(mac)) throw new InvalidPayloadException("invalid/duplicate time MAC");
            JsonNode d = item.getValue();
            int used = timeMinutes(d, "usedMinutes");
            Integer budget = d.path("budgetMinutes").isNull() ? null : timeMinutes(d, "budgetMinutes");
            boolean blocked = requiredBoolean(d, "blocked");
            String reason = optionalText(d, "reason");
            if (reason != null && !Set.of("manual", "window", "budget", "clock").contains(reason)) throw new InvalidPayloadException("unknown time reason");
            if (blocked != (reason != null)) throw new InvalidPayloadException("inconsistent time reason");
            result.put(mac, new TimeSample.Device(used, budget, blocked, reason));
        }
        return new TimeSample(ts, version, applied, synced, error, result);
    }

    private static int timeMinutes(JsonNode node, String field) {
        long value = requiredLong(node, field);
        if (value < 0 || value > 1440) throw new InvalidPayloadException("invalid time minutes");
        return (int) value;
    }

    private static JsonNode read(String payload) {
        JsonNode root;
        try {
            root = MAPPER.readTree(payload);
        } catch (JsonProcessingException e) {
            throw new InvalidPayloadException("not valid JSON");
        }
        if (root == null || !root.isObject()) {
            throw new InvalidPayloadException("payload is not a JSON object");
        }
        int version = (int) requiredLong(root, "v");
        if (version != SUPPORTED_VERSION) {
            throw new InvalidPayloadException("unsupported schema version v=" + version);
        }
        requiredLong(root, "ts");
        return root;
    }

    private static Set<String> macs(JsonNode root, String field) {
        Set<String> macs = new HashSet<>();
        for (JsonNode mac : requiredArray(root, field)) {
            if (!mac.isTextual()) {
                throw new InvalidPayloadException("'" + field + "' must contain MAC strings");
            }
            macs.add(mac.asText().toLowerCase());
        }
        return macs;
    }

    private static String requiredText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual()) {
            throw new InvalidPayloadException("missing or non-string field '" + field + "'");
        }
        return value.asText();
    }

    private static String optionalText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual()) {
            throw new InvalidPayloadException("non-string field '" + field + "'");
        }
        return value.asText();
    }

    private static long requiredLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong() || !value.isIntegralNumber()) {
            throw new InvalidPayloadException("missing or non-integer field '" + field + "'");
        }
        return value.asLong();
    }

    private static boolean requiredBoolean(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isBoolean()) {
            throw new InvalidPayloadException("missing or non-boolean field '" + field + "'");
        }
        return value.asBoolean();
    }

    private static JsonNode requiredArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isArray()) {
            throw new InvalidPayloadException("missing or non-array field '" + field + "'");
        }
        return value;
    }
}
