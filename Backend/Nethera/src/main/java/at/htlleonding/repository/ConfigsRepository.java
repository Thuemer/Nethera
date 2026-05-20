package at.htlleonding.repository;

import at.htlleonding.model.Config;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.List;

@ApplicationScoped
public class ConfigsRepository {

    @Inject
    EntityManager entityManager;

    public List<Config> getAllConfigs() {
        return this.entityManager.createNamedQuery(Config.QUERY_FIND_ALL, Config.class).getResultList();
    }
}
