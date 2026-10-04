package at.htlleonding.boundary;

import at.htlleonding.model.UserSetting;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("api/settings")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class UserSettingsResource {

    @Inject
    EntityManager entityManager;

    // Readable in the account screen's guest mode; changing settings requires login
    @GET
    @PermitAll
    public List<SettingDto> getAll() {
        return entityManager.createNamedQuery(UserSetting.QUERY_FIND_ALL, UserSetting.class)
                .getResultList()
                .stream()
                .map(setting -> new SettingDto(setting.getSettingKey(), setting.getSettingValue()))
                .toList();
    }

    @PUT
    @Path("{key}")
    @Transactional
    public SettingDto save(@PathParam("key") String key, SettingDto dto) {
        UserSetting setting = entityManager.createNamedQuery(UserSetting.QUERY_FIND_BY_KEY, UserSetting.class)
                .setParameter("settingKey", key)
                .getResultStream()
                .findFirst()
                .orElseGet(UserSetting::new);

        setting.setSettingKey(key);
        setting.setSettingValue(dto.value() == null ? "" : dto.value());

        if (setting.getId() == null) {
            entityManager.persist(setting);
            return new SettingDto(setting.getSettingKey(), setting.getSettingValue());
        }

        UserSetting saved = entityManager.merge(setting);
        return new SettingDto(saved.getSettingKey(), saved.getSettingValue());
    }

    public record SettingDto(String key, String value) {}
}
