package at.htlleonding.control;

// Separate from DNS changes: saving a time rule must not republish DNS settings.
public record TimeControlChanged(long routerId) {}
