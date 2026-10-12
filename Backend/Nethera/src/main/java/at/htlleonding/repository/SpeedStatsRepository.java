package at.htlleonding.repository;

import at.htlleonding.model.Router;
import at.htlleonding.model.SpeedStat;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@ApplicationScoped
public class SpeedStatsRepository {
    @Inject
    EntityManager entityManager;

    // Newest entries, returned oldest first for charting
    public List<SpeedStat> findLatest(Router router, int limit) {
        List<SpeedStat> newestFirst = this.entityManager.createQuery(
                        "SELECT s FROM SpeedStat s WHERE s.router = :router ORDER BY s.timestamp DESC, s.id DESC", SpeedStat.class)
                .setParameter("router", router)
                .setMaxResults(limit)
                .getResultList();
        List<SpeedStat> oldestFirst = new ArrayList<>(newestFirst);
        Collections.reverse(oldestFirst);
        return oldestFirst;
    }
}
