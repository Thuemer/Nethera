package at.htlleonding.dto;

public record DeviceTimeLimitDto(
        Long id,
        Long deviceId,
        Integer dailyLimitMinutes,
        Integer usedMinutesToday,
        String blockedFrom,
        String blockedUntil,
        String status,
        String note
) {
}
