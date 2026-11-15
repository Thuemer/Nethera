package at.htlleonding.dto;

import java.time.LocalDateTime;
import java.util.List;

public record RouterDto(Long id, String name, String model, String firmware, Boolean isOnline, LocalDateTime lastSeen, List<RouterConnectedDevicesDto> devices, List<RouterActivityLogsDto> activityLogs, List<RouterSpeedStatsDto> speedStats, List<RouterDnsStatsDto> dnsStats, String dataMode, String connection, LocalDateTime checkedAt) {
}
