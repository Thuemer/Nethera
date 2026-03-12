package at.htlleonding.model;

import java.time.Instant;

public class Schedule {

    private Long scheduleId;
    private Long routerId;
    private String type;
    private Instant startTime;
    private Instant endTime;
    private Long targetDeviceId;
}
