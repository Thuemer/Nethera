package at.htlleonding.repository;

import at.htlleonding.model.DnsStat;
import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.time.LocalDateTime;
import java.util.List;

@ApplicationScoped
public class DnsStatsRepository {
    @Inject
    EntityManager entityManager;

    public List<DnsStat> findSince(Router router, LocalDateTime since) {
        return this.entityManager.createQuery(
                        "SELECT d FROM DnsStat d WHERE d.router = :router AND d.timestamp >= :since ORDER BY d.timestamp", DnsStat.class)
                .setParameter("router", router)
                .setParameter("since", since)
                .getResultList();
    }
}
