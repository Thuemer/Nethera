package at.htlleonding.repository;

import at.htlleonding.model.Router;
import at.htlleonding.model.SpeedStat;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.List;

@ApplicationScoped
public class SpeedStatsRepository {

    @Inject
    EntityManager entityManager;

    public List<SpeedStat> getAllSpeedStats() {
        return this.entityManager.createNamedQuery(SpeedStat.QUERY_FIND_ALL, SpeedStat.class).getResultList();
    }
}
