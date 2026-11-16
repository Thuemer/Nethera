package at.htlleonding.services;

import at.htlleonding.model.Account;
import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import at.htlleonding.model.RouterScoped;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.ws.rs.NotFoundException;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

// The router the logged-in user owns. The browser never chooses a router ID; every user-facing
// endpoint resolves it here. Rows of other routers are reported as "not found", never "forbidden".
@RequestScoped
public class CurrentRouter {

    public static final String NO_ROUTER = "Noch kein Router verbunden";

    @Inject
    AccountService accountService;

    @Inject
    EntityManager entityManager;

    public Account account() {
        return accountService.current();
    }

    public Optional<Router> router() {
        return entityManager.createNamedQuery(Router.QUERY_FIND_BY_OWNER, Router.class)
                .setParameter("owner", account())
                .getResultStream()
                .findFirst();
    }

    public Router require() {
        return router().orElseThrow(() -> new NotFoundException(NO_ROUTER));
    }

    public List<ConnectedDevice> devices() {
        return router()
                .map(router -> entityManager.createQuery(
                                "SELECT d FROM ConnectedDevice d WHERE d.router = :router ORDER BY d.id", ConnectedDevice.class)
                        .setParameter("router", router)
                        .getResultList())
                .orElse(List.of());
    }

    public List<Long> deviceIds() {
        return devices().stream().map(ConnectedDevice::getId).toList();
    }

    public ConnectedDevice device(Long deviceId) {
        Router router = require();
        ConnectedDevice device = deviceId == null ? null : entityManager.find(ConnectedDevice.class, deviceId);
        if (device == null || device.getRouter() == null || !Objects.equals(device.getRouter().getId(), router.getId())) {
            throw new NotFoundException("Geraet nicht gefunden");
        }
        return device;
    }

    public <T extends RouterScoped> T owned(Class<T> type, Long id, String notFoundMessage) {
        Router router = require();
        T entity = id == null ? null : entityManager.find(type, id);
        if (entity == null || !Objects.equals(entity.getRouterId(), router.getId())) {
            throw new NotFoundException(notFoundMessage);
        }
        return entity;
    }
}
