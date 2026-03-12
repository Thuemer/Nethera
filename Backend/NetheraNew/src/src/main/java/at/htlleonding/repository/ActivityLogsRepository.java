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

    public List<ActivityLog> getAllActivityLogs() {
        return this.entityManager.createNamedQuery(ActivityLog.QUERY_FIND_ALL, ActivityLog.class).getResultList();
    }
}
