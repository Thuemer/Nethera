package at.htlleonding.control;

import at.htlleonding.model.*;
import at.htlleonding.model.TelemetryRecord.DataSource;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class TimeDesiredStateTest {
    private DeviceTimeLimit rule() {
        Router router = new Router(); router.setId(1L);
        ConnectedDevice device = new ConnectedDevice();
        device.setRouter(router); device.setMacAddress("AA:BB:CC:DD:EE:01"); device.setDataSource(DataSource.ROUTER);
        DeviceTimeLimit rule = new DeviceTimeLimit(); rule.setDevice(device);
        rule.setRouterEnforcement(true); rule.setStatus("active");
        rule.setBlockedFrom("21:00:00"); rule.setBlockedUntil("07:00"); rule.setDailyLimitMinutes(0);
        return rule;
    }

    @Test void unlimitedDoesNotBecomeZeroMinuteBudget() {
        var desired = TimeDesiredState.build(1, List.of(rule()));
        assertEquals("Europe/Vienna", desired.timezone()); assertEquals("OPEN", desired.untilClockSync());
        var wire = desired.devices().get("aa:bb:cc:dd:ee:01");
        assertTrue(wire.budgets().isEmpty());
        assertEquals(List.of("MO", "TU", "WE", "TH", "FR", "SA", "SU"), wire.windows().getFirst().days());
        assertEquals("21:00", wire.windows().getFirst().from());
    }

    @Test void budgetIsDailyAndBrowserUsageIsNotPublished() {
        var rule = rule(); rule.setDailyLimitMinutes(120); rule.setUsedMinutesToday(999);
        var wire = TimeDesiredState.build(1, List.of(rule)).devices().values().iterator().next();
        assertEquals(7, wire.budgets().size()); assertTrue(wire.budgets().values().stream().allMatch(value -> value == 120));
        assertFalse(TimeControlPublisher.content(TimeDesiredState.build(1, List.of(rule))).contains("999"));
    }

    @Test void onlyExplicitlyActivatedOwnLiveDevicesArePublished() {
        var rule = rule();
        assertTrue(TimeDesiredState.build(2, List.of(rule)).devices().isEmpty());
        rule.setRouterEnforcement(false); assertTrue(TimeDesiredState.build(1, List.of(rule)).devices().isEmpty());
        rule.setRouterEnforcement(true); rule.setStatus("paused"); assertTrue(TimeDesiredState.build(1, List.of(rule)).devices().isEmpty());
        rule.setStatus("active"); rule.getDevice().setDataSource(DataSource.UNKNOWN);
        assertTrue(TimeDesiredState.build(1, List.of(rule)).devices().isEmpty());
    }

    @Test void invalidRulesFailClosedBeforePublishing() {
        var rule = rule(); rule.setBlockedUntil("21:00");
        assertThrows(IllegalArgumentException.class, () -> TimeDesiredState.build(1, List.of(rule)));
        rule.setBlockedUntil(null); assertThrows(IllegalArgumentException.class, () -> TimeDesiredState.build(1, List.of(rule)));
        rule.setBlockedUntil("07:00"); rule.setDailyLimitMinutes(1441);
        assertThrows(IllegalArgumentException.class, () -> TimeDesiredState.build(1, List.of(rule)));
        assertThrows(IllegalArgumentException.class, () -> TimeDesiredState.time("23:59:01"));
        assertThrows(IllegalArgumentException.class, () -> TimeDesiredState.time("24:00"));
        assertThrows(IllegalArgumentException.class, () -> TimeDesiredState.build(1, List.of(rule(), rule())));
    }
}
