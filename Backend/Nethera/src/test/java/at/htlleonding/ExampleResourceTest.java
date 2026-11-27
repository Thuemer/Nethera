package at.htlleonding;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.common.WithTestResource;
import at.htlleonding.boundary.PostgresTestResource;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;

@QuarkusTest
@WithTestResource(PostgresTestResource.class)
class ExampleResourceTest {
    @Test
    void testHelloEndpoint() {
        given()
                .when().get("/hello")
                .then()
                .statusCode(200)
                .body(is("Hello from Quarkus REST"));
    }

}
