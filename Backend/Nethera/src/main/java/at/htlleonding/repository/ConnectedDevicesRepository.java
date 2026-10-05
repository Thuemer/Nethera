package at.htlleonding.repository;

import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.NoResultException;
import jakarta.transaction.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@ApplicationScoped
public class ConnectedDevicesRepository {
    @Inject
    EntityManager entityManager;

    public List<ConnectedDevice> getAllConnectedDevices() {
        return this.entityManager.createNamedQuery(ConnectedDevice.QUERY_FIND_ALL, ConnectedDevice.class).getResultList();
    }

    public ConnectedDevice findByMac(Router router, String mac) {
        try {
            return entityManager.createQuery(
                            "SELECT d FROM ConnectedDevice d WHERE d.macAddress = :mac AND d.router = :router", ConnectedDevice.class)
                    .setParameter("mac", mac)
                    .setParameter("router", router)
                    .getSingleResult();
        } catch (NoResultException e) {
            return null;
        }
    }

    @Transactional
    public ConnectedDevice syncDevice(Router router, String mac, String ip, String hostname, boolean isOnline, String connectionType) {
        ConnectedDevice device = findByMac(router, mac);
        if (device == null) {
            device = new ConnectedDevice();
            device.setMacAddress(mac);
            device.setRouter(router);
            entityManager.persist(device);
        }

        device.setIpAddress(ip);
        device.setHostname(hostname);
        device.setOnline(isOnline);
        device.setConnectionType(connectionType);

        if (isOnline) {
            device.setLastSeen(LocalDateTime.now());
        }

        return device;
    }
}
