package at.htlleonding.filter;

import jakarta.ws.rs.container.*;
import jakarta.ws.rs.ext.Provider;

import java.util.Set;

@Provider
public class CORSFilter implements ContainerResponseFilter {

    private static final Set<String> ALLOWED_ORIGINS = Set.of(
            "null",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080"
    );

    @Override
    public void filter(ContainerRequestContext request,
                       ContainerResponseContext response) {
        String origin = request.getHeaderString("Origin");
        String allowOrigin = (origin != null && ALLOWED_ORIGINS.contains(origin)) ? origin : "http://localhost:5500";

        response.getHeaders().putSingle("Access-Control-Allow-Origin", allowOrigin);
        response.getHeaders().putSingle("Vary", "Origin");
        response.getHeaders().putSingle("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        response.getHeaders().putSingle("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization");
    }
}