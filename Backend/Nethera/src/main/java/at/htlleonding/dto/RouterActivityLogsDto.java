package at.htlleonding.dto;

import java.time.LocalDateTime;

public record RouterActivityLogsDto(Long id, String eventType, String details, LocalDateTime timestamp) {
}
