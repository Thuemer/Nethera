package at.htlleonding.dto;

import at.htlleonding.model.ActivityLog;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.DnsStat;
import at.htlleonding.model.SpeedStat;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

public record RouterDto(Long id, String name, String model, String firmware, Boolean isOnline, LocalDateTime lastSeen, List<RouterConnectedDevicesDto> devices, List<RouterActivityLogsDto> activityLogs, List<RouterSpeedStatsDto> speedStats, List<RouterDnsStatsDto> dnsStats) {
}
