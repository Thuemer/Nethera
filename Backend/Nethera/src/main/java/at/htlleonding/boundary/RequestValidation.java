package at.htlleonding.boundary;

import jakarta.ws.rs.BadRequestException;

import java.util.regex.Pattern;

// Turns bad client input into 400 instead of a NullPointerException (500) or garbage in the DB
final class RequestValidation {

    private static final Pattern TIME_OF_DAY = Pattern.compile("([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?");
    private static final int MINUTES_PER_DAY = 24 * 60;

    private RequestValidation() {
    }

    static <T> T requireBody(T body) {
        if (body == null) {
            throw new BadRequestException("Request-Body fehlt");
        }
        return body;
    }

    // Empty is allowed (no time window); otherwise HH:mm as sent by <input type="time">
    static String timeOfDay(String field, String value) {
        if (value != null && !value.isBlank() && !TIME_OF_DAY.matcher(value).matches()) {
            throw new BadRequestException(field + " muss im Format HH:mm sein");
        }
        return value;
    }

    static Integer minutesPerDay(String field, Integer value) {
        if (value != null && (value < 0 || value > MINUTES_PER_DAY)) {
            throw new BadRequestException(field + " muss zwischen 0 und " + MINUTES_PER_DAY + " liegen");
        }
        return value;
    }
}
