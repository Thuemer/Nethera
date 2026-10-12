package at.htlleonding.telemetry;

// Already computed rate in Mb/s (SSH path measures two samples 2 s apart)
public record SpeedSample(double downloadMbps, double uploadMbps) {
}
