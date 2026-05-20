package at.htlleonding.repository;

import at.htlleonding.model.ConnectedDevice;
import at.htlleonding.model.DeviceTimeLimit;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class DeviceTimeLimitsRepository {

    @Inject
    EntityManager entityManager;

    public List<DeviceTimeLimit> getAll() {
        return entityManager.createNamedQuery(DeviceTimeLimit.QUERY_FIND_ALL, DeviceTimeLimit.class).getResultList();
    }

    public Optional<DeviceTimeLimit> findByDeviceId(Long deviceId) {
        return entityManager.createNamedQuery(DeviceTimeLimit.QUERY_FIND_BY_DEVICE, DeviceTimeLimit.class)
                .setParameter("deviceId", deviceId)
                .getResultStream()
                .findFirst();
    }

    @Transactional
    public DeviceTimeLimit save(Long deviceId, DeviceTimeLimit input) {
        ConnectedDevice device = entityManager.find(ConnectedDevice.class, deviceId);
        if (device == null) {
            return null;
        }

        DeviceTimeLimit limit = findByDeviceId(deviceId).orElseGet(DeviceTimeLimit::new);
        limit.setDevice(device);
        limit.setDailyLimitMinutes(input.getDailyLimitMinutes());
        limit.setUsedMinutesToday(input.getUsedMinutesToday() == null ? 0 : input.getUsedMinutesToday());
        limit.setBlockedFrom(input.getBlockedFrom());
        limit.setBlockedUntil(input.getBlockedUntil());
        limit.setStatus(input.getStatus());
        limit.setNote(input.getNote());

        if (limit.getId() == null) {
            entityManager.persist(limit);
            return limit;
        }

        return entityManager.merge(limit);
    }

    @Transactional
    public boolean deleteByDeviceId(Long deviceId) {
        Optional<DeviceTimeLimit> limit = findByDeviceId(deviceId);
        limit.ifPresent(entityManager::remove);
        return limit.isPresent();
    }
}
