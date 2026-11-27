package at.htlleonding.mqtt;

import at.htlleonding.boundary.TestRouters;
import at.htlleonding.control.RouterControlPublisher;
import at.htlleonding.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.concurrent.Callable;
import static at.htlleonding.mqtt.MqttTelemetryTestResource.publish;
import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.*;

// Isolated PostgreSQL + broker only; never sends commands to the physical Cudy/cloud.
@QuarkusTest
@WithTestResource(value = MqttTelemetryTestResource.class, scope = io.quarkus.test.common.TestResourceScope.RESTRICTED_TO_CLASS)
class PriorityTimeControlIT {
    static final ObjectMapper JSON = new ObjectMapper();
    static final String MAC = "02:27:00:00:00:24";
    @Inject EntityManager em;
    @Inject RouterControlPublisher dnsPublisher;

    @Test @TestSecurity(user = "combined-owner")
    void priorityPreservesLiveNetworkDeviceDnsAdblockAndTimeSchedules() throws Exception {
        TestRouters.own(em, "combined-owner", 1L);
        long deviceId = QuarkusTransaction.requiringNew().call(() -> {
            var device = new ConnectedDevice(); device.setRouter(em.find(Router.class, 1L));
            device.setMacAddress(MAC); device.setHostname("Combined control test");
            device.setDataSource(TelemetryRecord.DataSource.ROUTER); em.persist(device); em.flush();
            em.createQuery("SELECT c FROM Config c", Config.class).getResultList().forEach(c -> c.setDnsBlocking(true));
            return device.getId();
        });
        // Exercise both real security API writes (network and per-device), not draft data.
        given().contentType(ContentType.JSON).body("{\"name\":\"Combined network block\",\"sourceType\":\"NETWORK\",\"urlPattern\":\"network-block.example\"}")
                .post("/api/security/blocklists").then().statusCode(200);
        Number listId = given().contentType(ContentType.JSON)
                .body("{\"name\":\"Combined device block\",\"sourceType\":\"CUSTOM\",\"urlPattern\":\"device-block.example\"}")
                .post("/api/security/blocklists").then().statusCode(200).extract().path("id");
        Number presetId = given().contentType(ContentType.JSON)
                .body("{\"name\":\"Preserve device filter\",\"blocklistId\":"+listId+",\"priorityMode\":false}")
                .post("/api/security/presets").then().statusCode(200).extract().path("id");
        given().put("/api/security/devices/"+deviceId+"/preset/"+presetId).then().statusCode(200);
        dnsPublisher.publishAll(true);
        JsonNode dns = await(() -> {
            var value=retained("dns");
            return value != null && value.path("network").toString().contains("network-block.example")
                    && value.path("devices").path(MAC).toString().contains("device-block.example") ? value : null;
        });
        assertTrue(dns.path("adblock").asBoolean());
        publish("nethera/1/status", "online");
        String timeEndpoint="/api/device-time-limits/"+deviceId;
        given().contentType(ContentType.JSON)
                .body("{\"dailyLimitMinutes\":90,\"blockedFrom\":\"21:00\",\"blockedUntil\":\"07:00\",\"status\":\"active\"}")
                .put(timeEndpoint).then().statusCode(200);
        JsonNode time=await(() -> {var value=retained("time");return value!=null&&value.path("devices").has(MAC)?value:null;});
        ObjectNode timeAck=JSON.createObjectNode().put("v",1).put("ts",Instant.now().getEpochSecond())
                .put("version",time.path("version").asLong()).put("applied",true).put("clockSynced",true);
        timeAck.putObject("devices").putObject(MAC).put("usedMinutes",3).put("budgetMinutes",90).put("blocked",false);
        publish("nethera/1/telemetry/time",timeAck.toString());
        ObjectNode dnsAck=JSON.createObjectNode().put("v",1).put("ts",Instant.now().getEpochSecond())
                .put("version",dns.path("version").asLong()).put("applied",true);
        dnsAck.putObject("adblock").put("installed",true).put("enabled",true);
        publish("nethera/1/telemetry/control",dnsAck.toString());
        await(() -> status().path("timeApplied").asBoolean()?true:null);
        assertTrue(status().path("capabilities").path("timeControl").asBoolean());
        assertTrue(status().path("capabilities").path("devicePriority").asBoolean());

        String priorityEndpoint="/api/router-control/priority/devices/"+deviceId;
        given().contentType(ContentType.JSON).body("{\"mode\":\"high\"}").put(priorityEndpoint).then().statusCode(202);
        JsonNode desired=await(() -> {var value=retained("priority");return value!=null&&value.path("devices").path(MAC).asText().equals("high")?value:null;});
        assertFalse(status().path("priority").path(Long.toString(deviceId)).path("applied").asBoolean());
        priorityAck(desired,desired.path("version").asLong()-1);
        assertFalse(status().path("priority").path(Long.toString(deviceId)).path("applied").asBoolean());
        priorityAck(desired,desired.path("version").asLong());
        await(() -> status().path("priority").path(Long.toString(deviceId)).path("applied").asBoolean()?true:null);
        assertTrue(status().path("timeApplied").asBoolean());
        assertTrue(status().path("adblock").path("applied").asBoolean());
        assertEquals(dns,retained("dns"),"Priority must not change network/device blocks or adblock");
        assertEquals(time,retained("time"),"Priority must not change schedules or their versions");
        QuarkusTransaction.requiringNew().run(() -> {
            var assignment=em.createNamedQuery(DevicePresetAssignment.QUERY_FIND_BY_DEVICE,DevicePresetAssignment.class)
                    .setParameter("deviceId",deviceId).getSingleResult();
            assertEquals(presetId.longValue(),assignment.getPresetId());
            assertFalse(em.find(SecurityPreset.class,presetId.longValue()).getPriorityMode());
        });
        given().contentType(ContentType.JSON).body("{\"mode\":\"urgent\"}").put(priorityEndpoint).then().statusCode(400);
        given().contentType(ContentType.JSON).body("{\"mode\":\"high\"}")
                .put("/api/router-control/priority/devices/9223372036854775807").then().statusCode(404);
        assertEquals(desired,retained("priority"));
        given().contentType(ContentType.JSON).body("{\"mode\":\"normal\"}").put(priorityEndpoint).then().statusCode(202);
        JsonNode normal=await(() -> {var value=retained("priority");return value.path("devices").path(MAC).asText().equals("normal")?value:null;});
        priorityAck(normal,normal.path("version").asLong());
        await(() -> status().path("priority").path(Long.toString(deviceId)).path("applied").asBoolean()?true:null);
        assertEquals(dns,retained("dns"));assertEquals(time,retained("time"));
        publish("nethera/1/status","offline");
        await(() -> status().path("connection").asText().equals("offline")?true:null);
        assertFalse(status().path("priority").path(Long.toString(deviceId)).path("applied").asBoolean());
        assertFalse(status().path("timeApplied").asBoolean());
    }
    @Test
    void priorityWriteRequiresLogin() {
        given().contentType(ContentType.JSON).body("{\"mode\":\"high\"}")
                .put("/api/router-control/priority/devices/1").then().statusCode(401);
    }

    static void priorityAck(JsonNode desired,long version)throws Exception{
        ObjectNode ack=JSON.createObjectNode().put("v",1).put("ts",Instant.now().getEpochSecond()).put("version",version).put("applied",true);
        ack.set("devices",desired.path("devices"));publish("nethera/1/telemetry/priority",ack.toString());
    }
    static JsonNode status()throws Exception{return JSON.readTree(given().get("/api/router-control/status").then().statusCode(200).extract().asString());}
    static JsonNode retained(String topic)throws Exception{
        var result=MqttTelemetryTestResource.mosquitto.execInContainer("mosquitto_sub","-h","localhost","-t","nethera/1/config/"+topic,"-C","1","-W","2");
        return result.getStdout().isBlank()?null:JSON.readTree(result.getStdout());
    }
    static <T>T await(Callable<T> probe)throws Exception{
        Instant deadline=Instant.now().plusSeconds(20);
        while(Instant.now().isBefore(deadline)){T value=probe.call();if(value!=null)return value;Thread.sleep(100);}
        throw new AssertionError("No expected combined state within 20 seconds");
    }
}
