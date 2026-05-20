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
    public void syncDevice(Router router, String mac, String ip, String hostname, LocalDateTime lastSeen) {
        try {
            // Prüfen, ob das Gerät an diesem Router schon bekannt ist
            ConnectedDevice device = entityManager.createQuery(
                            "SELECT d FROM ConnectedDevice d WHERE d.macAddress = :mac AND d.router = :router", ConnectedDevice.class)
                    .setParameter("mac", mac)
                    .setParameter("router", router)
                    .getSingleResult();

            // Existiert bereits -> Update
            device.setIpAddress(ip);
            device.setHostname(hostname);
            device.setLastSeen(lastSeen);
            // JPA speichert die Änderungen automatisch am Ende der Transaktion (Dirty Checking)

        } catch (NoResultException e) {
            // Existiert noch nicht -> Insert
            ConnectedDevice newDevice = new ConnectedDevice();
            newDevice.setMacAddress(mac);
            newDevice.setIpAddress(ip);
            newDevice.setHostname(hostname);
            newDevice.setConnectionType("DHCP"); // Standardwert für unsere dnsmasq-Leases
            newDevice.setRouter(router);
            newDevice.setLastSeen(lastSeen);

            entityManager.persist(newDevice);
        }
    }
}