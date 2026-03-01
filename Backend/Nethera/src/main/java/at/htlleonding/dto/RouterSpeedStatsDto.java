package at.htlleonding.dto;

import java.time.LocalDateTime;

public record RouterSpeedStatsDto(Long id, LocalDateTime timestamp, Double downloadSpeed, Double uploadSpeed) {
}
