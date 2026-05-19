package at.htlleonding.repository;

import at.htlleonding.model.Connection;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.util.List;

@ApplicationScoped
public class ConnectionsRepository {

    @Inject
    EntityManager entityManager;

    public List<Connection> getAllConnections() {
        return this.entityManager.createNamedQuery(Connection.QUERY_FIND_ALL, Connection.class).getResultList();
    }
}
