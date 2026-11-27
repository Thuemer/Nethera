package at.htlleonding.control;

import at.htlleonding.model.*;
import at.htlleonding.mqtt.InvalidPayloadException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@ApplicationScoped
public class PriorityControlService {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    @Inject EntityManager entityManager;

    public record Bandwidth(@com.fasterxml.jackson.annotation.JsonProperty(required=true) boolean enabled, @com.fasterxml.jackson.annotation.JsonProperty(required=true) int downloadKbit, @com.fasterxml.jackson.annotation.JsonProperty(required=true) int uploadKbit) {
        public boolean valid() {
            return enabled ? downloadKbit >= 128 && downloadKbit <= 1000000 && uploadKbit >= 128 && uploadKbit <= 1000000
                    : downloadKbit == 0 && uploadKbit == 0;
        }
    }

    public Bandwidth bandwidth(long routerId) {
        PriorityBandwidthSettings row=entityManager.find(PriorityBandwidthSettings.class,routerId);
        return row==null?null:new Bandwidth(row.enabled,row.downloadKbit,row.uploadKbit);
    }

    List<RouterControlPublisher.Prepared> prepare(boolean force, List<Router> routers, List<SecurityPreset> presets,
            List<DevicePresetAssignment> assignments, List<ConnectedDevice> devices) throws Exception {
        List<RouterControlPublisher.Prepared> messages = new ArrayList<>();
        for (Router router : routers) {
            PriorityDesiredState desired = PriorityDesiredState.build(router.getId(), presets, assignments, devices, preferences());
            ObjectNode wanted = MAPPER.createObjectNode();
            wanted.set("devices", MAPPER.valueToTree(desired.devices()));
            Bandwidth bandwidth=bandwidth(router.getId());
            if(bandwidth!=null)wanted.set("bandwidth",MAPPER.valueToTree(bandwidth));
            String content = MAPPER.writeValueAsString(wanted);
            PriorityControlState state = entityManager.find(PriorityControlState.class, router.getId());
            if (state == null) {
                state = new PriorityControlState(); state.setRouterId(router.getId()); entityManager.persist(state);
            }
            boolean changed = !content.equals(state.getDesiredContent());
            if (!changed && !force) continue;
            if (changed || state.getDesiredVersion() == null) {
                state.setDesiredVersion(Math.max(state.getDesiredVersion() == null ? 1 : state.getDesiredVersion() + 1, System.currentTimeMillis()));
                state.setDesiredContent(content);
            }
            ObjectNode json = MAPPER.createObjectNode();
            json.put("v", 1); json.put("version", state.getDesiredVersion()); json.setAll(wanted);
            messages.add(new RouterControlPublisher.Prepared("nethera/" + router.getId() + "/config/priority",
                    MAPPER.writeValueAsString(json).getBytes(StandardCharsets.UTF_8)));
        }
        return messages;
    }

    public void ingest(long routerId, String payload) {
        try {
            JsonNode root = MAPPER.readTree(payload);
            if (root == null || !root.isObject() || !root.path("v").isIntegralNumber() || !root.path("v").canConvertToInt() || root.path("v").asInt() != 1
                    || !root.path("version").isIntegralNumber() || !root.path("version").canConvertToLong() || root.path("version").asLong() <= 0
                    || !root.path("ts").isIntegralNumber() || !root.path("ts").canConvertToLong() || !root.path("applied").isBoolean()
                    || !root.path("devices").isObject() || root.path("devices").size() > 100
                    || (root.has("error") && !root.path("error").isTextual())) throw new IllegalArgumentException();
            Iterator<Map.Entry<String, JsonNode>> fields = root.path("devices").fields();
            while (fields.hasNext()) {
                var field = fields.next();
                if (!field.getKey().matches("([0-9a-f]{2}:){5}[0-9a-f]{2}") || !field.getValue().isTextual()
                        || !Set.of("high", "normal").contains(field.getValue().asText())) throw new IllegalArgumentException();
            }
            JsonNode report = root.get("bandwidth");
            if(report!=null) {
                if(!report.isObject() || !report.path("enabled").isBoolean() || !report.path("active").isBoolean()
                    || !report.path("downloadKbit").isInt() || !report.path("uploadKbit").isInt()
                    || !new Bandwidth(report.path("enabled").asBoolean(),report.path("downloadKbit").asInt(),report.path("uploadKbit").asInt()).valid()) throw new IllegalArgumentException();
            }
            Instant checked = Instant.ofEpochSecond(root.path("ts").asLong());
            if (checked.isAfter(Instant.now().plusSeconds(30)) || checked.isBefore(Instant.EPOCH)) throw new IllegalArgumentException();
            PriorityControlState state = entityManager.find(PriorityControlState.class, routerId);
            if (state == null || state.getDesiredVersion() == null || root.path("version").asLong() != state.getDesiredVersion()) return;
            if (state.getCheckedAt() != null && checked.isBefore(state.getCheckedAt())) return;
            state.setAppliedVersion(root.path("version").asLong()); state.setApplied(root.path("applied").asBoolean());
            state.setReportedDevices(MAPPER.writeValueAsString(root.path("devices")));
            state.setReportedBandwidth(report==null?null:MAPPER.writeValueAsString(report));
            state.setCheckedAt(checked); state.setError(root.path("error").asText(null));
        } catch (Exception e) { throw new InvalidPayloadException("invalid priority acknowledgment"); }
    }

    public Map<String, Object> status(long routerId, String connection) {
        PriorityDesiredState desired = PriorityDesiredState.build(routerId,
                entityManager.createNamedQuery(SecurityPreset.QUERY_FIND_ALL, SecurityPreset.class).getResultList(),
                entityManager.createNamedQuery(DevicePresetAssignment.QUERY_FIND_ALL, DevicePresetAssignment.class).getResultList(),
                entityManager.createNamedQuery(ConnectedDevice.QUERY_FIND_ALL, ConnectedDevice.class).getResultList(), preferences());
        PriorityControlState state = entityManager.find(PriorityControlState.class, routerId);
        boolean confirmed = false;
        try {
            confirmed = state != null && "online".equals(connection) && Boolean.TRUE.equals(state.getApplied())
                    && Objects.equals(state.getDesiredVersion(), state.getAppliedVersion()) && state.getDesiredVersion() != null
                    && fresh(state.getCheckedAt(), Instant.now())
                    && desiredDevices(state).equals(MAPPER.valueToTree(desired.devices()))
                    && shapingConfirmed(routerId, state, desired.devices().containsValue("high"))
                    && MAPPER.readTree(state.getReportedDevices()).equals(MAPPER.valueToTree(desired.devices()));
        } catch (Exception ignored) { /* Missing or malformed readback never confirms a device. */ }
        Map<String, Object> result = new TreeMap<>();
        for (var entry : desired.macByDevice().entrySet()) {
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("mode", desired.devices().get(entry.getValue())); status.put("applied", confirmed);
            status.put("scope", "controlled-bandwidth");
            if (state != null && state.getError() != null) status.put("error", state.getError());
            result.put(entry.getKey().toString(), status);
        }
        return result;
    }

    private JsonNode desiredDevices(PriorityControlState state) throws Exception {
        JsonNode content=MAPPER.readTree(state.getDesiredContent());
        return content.has("devices")?content.path("devices"):content;
    }

    private boolean shapingConfirmed(long routerId,PriorityControlState state,boolean hasHigh) throws Exception {
        Bandwidth desired=bandwidth(routerId);
        JsonNode want=MAPPER.readTree(state.getDesiredContent()).get("bandwidth");
        if(desired!=null && (want==null || !want.equals(MAPPER.valueToTree(desired))))return false;
        if(!hasHigh)return true;
        if(state.getReportedBandwidth()==null)return false;
        JsonNode report=MAPPER.readTree(state.getReportedBandwidth());
        if(!report.path("active").asBoolean() || !report.path("enabled").asBoolean())return false;
        return desired==null || (desired.enabled() && report.path("downloadKbit").asInt()==desired.downloadKbit()
                && report.path("uploadKbit").asInt()==desired.uploadKbit());
    }

    public Map<String,Object> bandwidthStatus(long routerId,String connection) {
        Map<String,Object> result=new LinkedHashMap<>();
        Bandwidth desired=bandwidth(routerId);
        result.put("configured",desired!=null);
        if(desired!=null)result.put("desired",desired);
        PriorityControlState state=entityManager.find(PriorityControlState.class,routerId);
        boolean confirmed=false;
        try {
            if(state!=null && state.getReportedBandwidth()!=null)result.put("reported",MAPPER.readTree(state.getReportedBandwidth()));
            confirmed=state!=null && state.getDesiredVersion()!=null && state.getDesiredVersion().equals(state.getAppliedVersion())
                    && Boolean.TRUE.equals(state.getApplied()) && "online".equals(connection) && fresh(state.getCheckedAt(),Instant.now())
                    && shapingConfirmed(routerId,state,true);
        } catch(Exception ignored) { /* Incomplete readback remains unconfirmed. */ }
        result.put("applied",confirmed);
        return result;
    }

    private List<DevicePriority> preferences() {
        return entityManager.createQuery("SELECT p FROM DevicePriority p", DevicePriority.class).getResultList();
    }

    public static boolean fresh(Instant checkedAt, Instant now) {
        return checkedAt != null && !checkedAt.isAfter(now.plusSeconds(30)) && checkedAt.isAfter(now.minusSeconds(90));
    }
}
