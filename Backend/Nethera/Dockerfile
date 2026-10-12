FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /workspace

COPY pom.xml ./
COPY src src

RUN mvn -DskipTests package

FROM eclipse-temurin:21-jre

WORKDIR /app

ENV QUARKUS_HTTP_HOST=0.0.0.0

COPY --from=build /workspace/target/quarkus-app/ ./

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/quarkus-run.jar"]
