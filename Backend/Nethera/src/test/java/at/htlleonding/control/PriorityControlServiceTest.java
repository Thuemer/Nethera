package at.htlleonding.control;

import at.htlleonding.model.PriorityControlState;
import at.htlleonding.mqtt.InvalidPayloadException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PriorityControlServiceTest {
    PriorityControlService service;
    PriorityControlState state;
    @BeforeEach void setup() {
        service = new PriorityControlService(); service.entityManager = mock(EntityManager.class);
        state = new PriorityControlState(); state.setRouterId(1L); state.setDesiredVersion(10L);
        when(service.entityManager.find(PriorityControlState.class, 1L)).thenReturn(state);
    }
    String ack(long version, long time, boolean applied) {
        return "{\"v\":1,\"version\":"+version+",\"ts\":"+time+",\"applied\":"+applied+",\"devices\":{\"02:00:00:00:00:01\":\"high\"}}";
    }
    @Test void onlyCurrentVersionIsStoredAndOutOfOrderAcksAreIgnored() {
        long now = Instant.now().getEpochSecond();
        service.ingest(1L, ack(9, now, true)); assertNull(state.getAppliedVersion());
        service.ingest(1L, ack(11, now, true)); assertNull(state.getAppliedVersion());
        service.ingest(1L, ack(10, now, true)); assertEquals(10L, state.getAppliedVersion()); assertTrue(state.getApplied());
        service.ingest(1L, ack(10, now-10, false)); assertTrue(state.getApplied());
        service.ingest(1L, ack(10, now+1, false)); assertFalse(state.getApplied());
    }
    @Test void validatesExplicitDirectionalCaps() {
        assertTrue(new PriorityControlService.Bandwidth(true,60000,10000).valid());
        assertFalse(new PriorityControlService.Bandwidth(true,0,10000).valid());
        assertFalse(new PriorityControlService.Bandwidth(true,60000,1000001).valid());
        assertTrue(new PriorityControlService.Bandwidth(false,0,0).valid());
        assertFalse(new PriorityControlService.Bandwidth(false,60000,10000).valid());
    }
    @Test void bandwidthConfirmationRequiresFreshMatchingRatesAndActiveShaper() {
        var rates=new at.htlleonding.model.PriorityBandwidthSettings();
        rates.routerId=1L;rates.enabled=true;rates.downloadKbit=60000;rates.uploadKbit=10000;
        when(service.entityManager.find(at.htlleonding.model.PriorityBandwidthSettings.class,1L)).thenReturn(rates);
        state.setAppliedVersion(10L);state.setApplied(true);state.setCheckedAt(Instant.now());
        state.setDesiredContent("{\"devices\":{},\"bandwidth\":{\"enabled\":true,\"downloadKbit\":60000,\"uploadKbit\":10000}}");
        state.setReportedBandwidth("{\"enabled\":true,\"downloadKbit\":60000,\"uploadKbit\":10000,\"active\":true}");
        assertEquals(true,service.bandwidthStatus(1L,"online").get("applied"));
        rates.downloadKbit=50000;
        assertEquals(false,service.bandwidthStatus(1L,"online").get("applied"));
        rates.downloadKbit=60000;state.setReportedBandwidth(null);
        assertEquals(false,service.bandwidthStatus(1L,"online").get("applied"));
        state.setReportedBandwidth("{\"enabled\":true,\"downloadKbit\":60000,\"uploadKbit\":10000,\"active\":false}");
        assertEquals(false,service.bandwidthStatus(1L,"online").get("applied"));
    }
    @Test void rejectsMalformedAndFutureAckBeforeWriting() {
        assertThrows(InvalidPayloadException.class, () -> service.ingest(1L,"{}"));
        assertThrows(InvalidPayloadException.class, () -> service.ingest(1L,ack(10,Instant.now().plusSeconds(60).getEpochSecond(),true)));
        assertThrows(InvalidPayloadException.class, () -> service.ingest(1L,ack(10,Instant.now().getEpochSecond(),true).replace("\"high\"","\"urgent\"")));
        assertNull(state.getAppliedVersion());
    }
}
