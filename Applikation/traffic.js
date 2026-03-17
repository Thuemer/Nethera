// Datenverkehr Seite - JavaScript
const ROUTER_API_URL = 'http://localhost:8080/api/routers/list';

async function loadTrafficData() {
    try {
        const response = await fetch(ROUTER_API_URL, {
            headers: { 
                Accept: 'application/json'
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`API-Fehler ${response.status}`);
        }

        const routers = await response.json();
        const router = Array.isArray(routers) ? routers[0] : null;

        if (!router) {
            throw new Error('Keine Routerdaten gefunden');
        }

        updateStatsDisplay(router);
        updateTrafficTable(router);
        console.log('Datenverkehr aktualisiert');
    } catch (error) {
        console.error('Fehler beim Laden der Datenverkehrsdaten:', error);
        updateStatsDisplay(null);
        updateTrafficTable(null);
    }
}

function updateStatsDisplay(router) {
    if (!router) {
        document.getElementById('statDownload').textContent = '-- Mb/s';
        document.getElementById('statUpload').textContent = '-- Mb/s';
        document.getElementById('statConnections').textContent = '0';
        document.getElementById('statVolume').textContent = '-- GB';
        return;
    }

    // Aktuelle Speed-Werte aus den letzten Daten
    const speedStats = Array.isArray(router.speedStats) ? router.speedStats : [];
    const latestSpeed = speedStats.length > 0 ? speedStats[speedStats.length - 1] : null;

    const download = latestSpeed?.downloadSpeed != null ? latestSpeed.downloadSpeed.toFixed(1) : '--';
    const upload = latestSpeed?.uploadSpeed != null ? latestSpeed.uploadSpeed.toFixed(1) : '--';
    const connections = Array.isArray(router.devices) ? router.devices.length : 0;

    document.getElementById('statDownload').textContent = download + ' Mb/s';
    document.getElementById('statUpload').textContent = upload + ' Mb/s';
    document.getElementById('statConnections').textContent = String(connections);
    document.getElementById('statVolume').textContent = '-- GB'; // Wird von der API nicht bereitgestellt
}

function updateTrafficTable(router) {
    const tableBody = document.getElementById('traffic-table-body');
    if (!tableBody) return;

    const devices = Array.isArray(router?.devices) ? router.devices.slice(0, 5) : [];

    if (devices.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">Keine Verbindungen verfügbar</td></tr>';
        return;
    }

    tableBody.innerHTML = devices.map(device => `
        <tr>
            <td>${device.hostname || '-'}</td>
            <td>${device.ipAddress || '-'}</td>
            <td>${device.connectionType === 'wifi' ? 'WiFi' : device.connectionType === 'lan' ? 'LAN' : 'Sonstige'}</td>
            <td>-- Mb/s</td>
            <td>-- Mb/s</td>
        </tr>
    `).join('');
}

function setupEvents() {
    console.log('setupEvents: Suche nach refreshButton');
    const btn = document.getElementById('refreshButton');
    console.log('refreshButton gefunden:', btn);
    if (btn) {
        btn.addEventListener('click', () => {
            console.log('Button geklickt, starte loadTrafficData');
            loadTrafficData();
        });
    } else {
        console.error('refreshButton nicht gefunden!');
    }
}

// Sofort ausführen da das Script am Ende der HTML geladen wird
console.log('traffic.js geladen');
setupEvents();
loadTrafficData();
