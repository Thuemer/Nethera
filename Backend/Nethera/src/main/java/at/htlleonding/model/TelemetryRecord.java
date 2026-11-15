package at.htlleonding.model;

import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.MappedSuperclass;

@MappedSuperclass
public abstract class TelemetryRecord {
    public enum DataSource { UNKNOWN, ROUTER }

    // Old rows and SQL fixtures must never become live data merely because they exist.
    @Enumerated(EnumType.STRING)
    @Column(name = "data_source", length = 16)
    private DataSource dataSource = DataSource.UNKNOWN;

    public DataSource getDataSource() { return dataSource; }
    public void setDataSource(DataSource dataSource) { this.dataSource = dataSource; }
    public boolean isRouterData() { return dataSource == DataSource.ROUTER; }
}
