package at.htlleonding.repository;

import at.htlleonding.model.ActivityLog;
import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.List;

@ApplicationScoped
public class ActivityLogsRepository {
    @Inject
    EntityManager entityManager;

    public List<ActivityLog> findLatest(Router router, int limit) {
        return this.entityManager.createQuery(
                        "SELECT a FROM ActivityLog a WHERE a.router = :router ORDER BY a.timestamp DESC, a.id DESC", ActivityLog.class)
                .setParameter("router", router)
                .setMaxResults(limit)
                .getResultList();
    }
}
