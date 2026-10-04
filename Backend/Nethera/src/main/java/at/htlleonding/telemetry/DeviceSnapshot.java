package at.htlleonding.telemetry;

import java.util.List;
import java.util.Set;

public record DeviceSnapshot(List<Lease> leases, Set<String> reachableMacs, Set<String> wifiMacs) {

    public record Lease(String mac, String ip, String hostname) {
    }
}
