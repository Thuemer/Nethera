package at.htlleonding.repository;

import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.List;

@ApplicationScoped
public class RoutersRepository {

    @Inject
    EntityManager entityManager;

    public List<Router> getAllRouters() {
        return this.entityManager.createNamedQuery(Router.QUERY_FIND_ALL, Router.class).getResultList();
    }
}
