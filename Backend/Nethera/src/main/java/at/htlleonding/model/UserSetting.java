package at.htlleonding.model;

import jakarta.persistence.*;

@Entity
@Table(name = "user_setting")
@NamedQuery(name = UserSetting.QUERY_FIND_ALL, query = "SELECT s FROM UserSetting s ORDER BY s.settingKey")
@NamedQuery(name = UserSetting.QUERY_FIND_BY_KEY, query = "SELECT s FROM UserSetting s WHERE s.settingKey = :settingKey")
public class UserSetting {

    public static final String QUERY_FIND_ALL = "UserSetting.findAll";
    public static final String QUERY_FIND_BY_KEY = "UserSetting.findByKey";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "setting_key", unique = true)
    private String settingKey;

    @Column(name = "setting_value")
    private String settingValue;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSettingKey() {
        return settingKey;
    }

    public void setSettingKey(String settingKey) {
        this.settingKey = settingKey;
    }

    public String getSettingValue() {
        return settingValue;
    }

    public void setSettingValue(String settingValue) {
        this.settingValue = settingValue;
    }
}
