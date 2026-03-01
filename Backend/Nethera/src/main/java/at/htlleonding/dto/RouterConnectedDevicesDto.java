package at.htlleonding.dto;

import java.time.LocalDateTime;

public record RouterConnectedDevicesDto(Long id, String macAddress, String ipAddress, String hostname, String connectionType, LocalDateTime lastSeen) {
}
