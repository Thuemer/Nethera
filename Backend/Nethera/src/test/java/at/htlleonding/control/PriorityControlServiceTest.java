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
    @Test void rejectsMalformedAndFutureAckBeforeWriting() {
        assertThrows(InvalidPayloadException.class, () -> service.ingest(1L,"{}"));
        assertThrows(InvalidPayloadException.class, () -> service.ingest(1L,ack(10,Instant.now().plusSeconds(60).getEpochSecond(),true)));
        assertThrows(InvalidPayloadException.class, () -> service.ingest(1L,ack(10,Instant.now().getEpochSecond(),true).replace("\"high\"","\"urgent\"")));
        assertNull(state.getAppliedVersion());
    }
}
