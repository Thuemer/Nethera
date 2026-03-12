package at.htlleonding.repository;

import at.htlleonding.model.DnsStat;
import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.List;

@ApplicationScoped
public class DnsStatsRepository {

    @Inject
    EntityManager entityManager;

    public List<DnsStat> getAllDnsStats() {
        return this.entityManager.createNamedQuery(DnsStat.QUERY_FIND_ALL, DnsStat.class).getResultList();
    }
}
