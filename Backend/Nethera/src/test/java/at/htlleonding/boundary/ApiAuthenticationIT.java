package at.htlleonding.boundary;

import io.quarkus.test.common.WithTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;

// Every API endpoint requires login unless it is explicitly public (@PermitAll)
@QuarkusTest
@WithTestResource(PostgresTestResource.class)
class ApiAuthenticationIT {

    @ParameterizedTest(name = "{0} {1}")
    @CsvSource({
            "GET,    /api/accounts/me",
            "GET,    /api/configs/list",
            "PUT,    /api/configs/1",
            "GET,    /api/devices",
            "GET,    /api/connections/list",
            "GET,    /api/device-time-limits",
            "PUT,    /api/device-time-limits/1",
            "DELETE, /api/device-time-limits/1",
            "GET,    /api/routers/list",
            "GET,    /api/security/state",
            "POST,   /api/security/groups",
            "DELETE, /api/security/groups/1",
            "PUT,    /api/security/groups/1/members/1",
            "DELETE, /api/security/groups/1/members/1",
            "POST,   /api/security/blocklists",
            "POST,   /api/security/presets",
            "PUT,    /api/security/devices/1/preset/1",
            "DELETE, /api/security/devices/1/preset",
            "PUT,    /api/settings/account.theme",
    })
    void anonymousRequestIsRejected(String method, String path) {
        given().contentType(ContentType.JSON).body("{}")
                .when().request(method, path)
                .then().statusCode(401);
    }

    @ParameterizedTest(name = "{0} {1}")
    @CsvSource({
            "GET, /api/configs/list",
            "GET, /api/connections/list",
            "GET, /api/device-time-limits",
            "GET, /api/security/state",
            "GET, /api/routers/list",
    })
    @TestSecurity(user = "demo")
    void loggedInUserIsAccepted(String method, String path) {
        given().when().request(method, path)
                .then().statusCode(200);
    }

    @Test
    @TestSecurity(user = "demo")
    void loggedInUserCanSaveSetting() {
        given().contentType(ContentType.JSON).body("{\"key\":\"account.theme\",\"value\":\"dark\"}")
                .when().put("/api/settings/account.theme")
                .then().statusCode(200);
    }

    @Test
    void settingsAreReadableInGuestMode() {
        given().when().get("/api/settings").then().statusCode(200);
    }

    @Test
    void helloIsPublic() {
        given().when().get("/hello").then().statusCode(200);
    }

    @Test
    void rejectedRequestStillCarriesCorsHeaders() {
        // Otherwise the browser reports a CORS error instead of the 401
        given().header("Origin", "http://localhost:5500")
                .when().get("/api/security/state")
                .then().statusCode(401)
                .header("Access-Control-Allow-Origin", equalTo("http://localhost:5500"));
    }

    @Test
    void corsPreflightIsNotRejected() {
        given().header("Origin", "http://localhost:5500")
                .header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "authorization,content-type")
                .when().options("/api/security/groups/1/members/1")
                .then().statusCode(not(equalTo(401)));
    }
}
