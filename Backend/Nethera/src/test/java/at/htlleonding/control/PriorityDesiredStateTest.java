package at.htlleonding.control;
import at.htlleonding.model.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class PriorityDesiredStateTest {
    @Test void scopesRouterHonorsPauseAndIndependentOverride() {
        Router router = new Router(); router.setId(1L);
        Router other = new Router(); other.setId(2L);
        ConnectedDevice a = device(1L, router, "02:00:00:00:00:01");
        ConnectedDevice b = device(2L, router, "02:00:00:00:00:02");
        ConnectedDevice foreign = device(3L, other, "02:00:00:00:00:03");
        SecurityPreset preset = new SecurityPreset(); preset.setId(8L); preset.setRouterId(1L); preset.setPriorityMode(true);
        DevicePresetAssignment active = assignment(1L, 8L, "active");
        DevicePresetAssignment paused = assignment(2L, 8L, "paused");
        var base = PriorityDesiredState.build(1L, List.of(preset), List.of(active, paused), List.of(a,b,foreign));
        assertEquals(Map.of(a.getMacAddress(), "high", b.getMacAddress(), "normal"), base.devices());
        DevicePriority override = new DevicePriority(); override.setDeviceId(2L); override.setMode("high");
        var changed = PriorityDesiredState.build(1L, List.of(preset), List.of(active, paused), List.of(a,b,foreign), List.of(override));
        assertEquals("high", changed.devices().get(b.getMacAddress()));
        assertEquals("paused", paused.getStatus());
        assertEquals(true, preset.getPriorityMode());
        assertFalse(changed.macByDevice().containsKey(3L));
    }
    @Test void rejectsMulticastAndMissingMacs() {
        Router router = new Router(); router.setId(1L);
        var result = PriorityDesiredState.build(1L, List.of(), List.of(), List.of(device(1L,router,"ff:ff:ff:ff:ff:ff"), device(2L,router,null)));
        assertTrue(result.devices().isEmpty());
    }
    @Test void rejectsOldAndFutureReadback() {
        Instant now = Instant.now();
        assertTrue(PriorityControlService.fresh(now.minusSeconds(30), now));
        assertFalse(PriorityControlService.fresh(now.minusSeconds(91), now));
        assertFalse(PriorityControlService.fresh(now.plusSeconds(31), now));
        assertFalse(PriorityControlService.fresh(null, now));
    }
    static ConnectedDevice device(long id, Router router, String mac) {
        var d = new ConnectedDevice(); d.setId(id); d.setRouter(router); d.setMacAddress(mac); return d;
    }
    static DevicePresetAssignment assignment(long device, long preset, String status) {
        var a = new DevicePresetAssignment(); a.setDeviceId(device); a.setPresetId(preset); a.setStatus(status); return a;
    }
}
