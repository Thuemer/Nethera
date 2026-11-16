package at.htlleonding.model;

// Entities that belong to exactly one router and must not be visible to other routers' owners
public interface RouterScoped {
    Long getRouterId();
}
