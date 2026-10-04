package at.htlleonding.mqtt;

import at.htlleonding.telemetry.CounterSample;
import at.htlleonding.telemetry.DeviceSnapshot;
import at.htlleonding.telemetry.DnsSample;
import at.htlleonding.telemetry.MetadataSample;
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
        return new MetadataSample(requiredText(root, "model"), requiredText(root, "firmware"));
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

    private static long requiredLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong() || !value.isIntegralNumber()) {
            throw new InvalidPayloadException("missing or non-integer field '" + field + "'");
        }
        return value.asLong();
    }

    private static JsonNode requiredArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isArray()) {
            throw new InvalidPayloadException("missing or non-array field '" + field + "'");
        }
        return value;
    }
}
