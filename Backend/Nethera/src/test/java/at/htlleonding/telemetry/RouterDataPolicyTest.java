package at.htlleonding.telemetry;

import at.htlleonding.model.Router;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import static org.junit.jupiter.api.Assertions.*;

class RouterDataPolicyTest {
    final RouterDataPolicy policy = new RouterDataPolicy();
    final LocalDateTime now = LocalDateTime.of(2026, 11, 15, 18, 0);

    RouterDataPolicyTest() {
        policy.clock = Clock.fixed(Instant.parse("2026-11-15T18:00:00Z"), ZoneOffset.UTC);
    }

    Router router(boolean online, LocalDateTime checkedAt) {
        Router router = new Router();
        router.setOnline(online);
        router.setConnectionCheckedAt(checkedAt);
        return router;
    }

    @Test void storedOnlineFlagAloneDoesNotProveLiveConnection() {
        assertEquals("unavailable", policy.mode(router(true, null)));
        assertEquals("unavailable", policy.mode(router(false, null)));
    }
    @Test void recentContactEnablesLiveMode() {
        assertEquals("live", policy.mode(router(true, now.minusSeconds(20))));
    }
    @Test void confirmedDisconnectAllowsDemoImmediately() {
        assertEquals("demo", policy.mode(router(false, now)));
    }
    @Test void staleContactAllowsDemoWithoutChangingStoredData() {
        Router router = router(true, now.minusSeconds(181));
        assertEquals("demo", policy.mode(router));
        assertTrue(router.getOnline());
    }
    @Test void futureTimestampIsUnknownNotDemo() {
        assertEquals("unavailable", policy.mode(router(true, now.plusHours(1))));
    }
}
