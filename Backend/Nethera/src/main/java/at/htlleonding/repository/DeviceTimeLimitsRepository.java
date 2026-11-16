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

    public List<DeviceTimeLimit> findByDeviceIds(List<Long> deviceIds) {
        if (deviceIds.isEmpty()) {
            return List.of();
        }
        return entityManager.createQuery("SELECT l FROM DeviceTimeLimit l WHERE l.device.id IN :ids", DeviceTimeLimit.class)
                .setParameter("ids", deviceIds)
                .getResultList();
    }

    public Optional<DeviceTimeLimit> findByDeviceId(Long deviceId) {
        return entityManager.createNamedQuery(DeviceTimeLimit.QUERY_FIND_BY_DEVICE, DeviceTimeLimit.class)
                .setParameter("deviceId", deviceId)
                .getResultStream()
                .findFirst();
    }

    @Transactional
    public DeviceTimeLimit save(ConnectedDevice device, DeviceTimeLimit input) {
        DeviceTimeLimit limit = findByDeviceId(device.getId()).orElseGet(DeviceTimeLimit::new);
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
