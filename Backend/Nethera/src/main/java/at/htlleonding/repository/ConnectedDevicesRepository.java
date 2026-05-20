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

    @Transactional
    public void syncDevice(Router router, String mac, String ip, String hostname, boolean isOnline) {
        try {
            ConnectedDevice device = entityManager.createQuery(
                            "SELECT d FROM ConnectedDevice d WHERE d.macAddress = :mac AND d.router = :router", ConnectedDevice.class)
                    .setParameter("mac", mac)
                    .setParameter("router", router)
                    .getSingleResult();

            device.setIpAddress(ip);
            device.setHostname(hostname);

            // lastSeen wird nur überschrieben, wenn das Gerät GERADE JETZT im Netz ist
            if (isOnline) {
                device.setLastSeen(LocalDateTime.now());
            }

        } catch (NoResultException e) {
            ConnectedDevice newDevice = new ConnectedDevice();
            newDevice.setMacAddress(mac);
            newDevice.setIpAddress(ip);
            newDevice.setHostname(hostname);
            newDevice.setConnectionType("DHCP");
            newDevice.setRouter(router);

            if (isOnline) {
                newDevice.setLastSeen(LocalDateTime.now());
            }

            entityManager.persist(newDevice);
        }
    }
}