package at.htlleonding.dto;

import java.time.LocalDateTime;

public record RouterDnsStatsDto(Long id, LocalDateTime timestamp, Integer totalQueries, Integer blockedQueries, Integer trackersDetected) {
}
