package at.htlleonding.services;

import at.htlleonding.model.Router;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class StartupSyncService {

    @Inject
    EntityManager entityManager;

    @Inject
    RouterSyncService syncService;

    // Diese Methode wird beim Hochfahren von Quarkus automatisch aufgerufen
    public void onStart(@Observes StartupEvent ev) {
        System.out.println("🚀 Quarkus gestartet. Prüfe Router-Datenbank...");

        // 1. Router holen oder anlegen
        Router defaultRouter = createOrGetDefaultRouter();

        // 2. Den initialen Sync ausführen
        System.out.println("📡 Starte initialen SSH-Sync mit dem Router...");
        try {
            syncService.syncDhcpLeases(defaultRouter);
            System.out.println("✅ Initiale Synchronisation erfolgreich abgeschlossen!");
        } catch (Exception e) {
            System.err.println("❌ Fehler beim initialen Sync: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Transactional
    Router createOrGetDefaultRouter() {
        // Wir versuchen, den Router mit der ID 1 zu laden
        Router router = entityManager.find(Router.class, 1L);

        if (router == null) {
            System.out.println("⚠️ Kein Router gefunden. Lege Test-Router an...");
            router = new Router();

            /* HINWEIS: Falls dein Router-Modell Pflichtfelder hat (z.B. Name oder IP),
               musst du diese hier setzen, bevor er gespeichert wird. Zum Beispiel:
               router.setIpAddress("192.168.1.1");
               router.setHostname("Nethera-Test-Router");
            */

            entityManager.persist(router);
        }
        return router;
    }
}