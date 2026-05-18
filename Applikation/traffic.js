// Datenverkehr Seite - JavaScript
const appConfig = window.NETHERA_CONFIG || {};
const API_ENABLED = appConfig.API_ENABLED === true;
const ROUTER_API_URL = `${appConfig.API_BASE_URL || 'http://localhost:8080'}${appConfig.ROUTERS_PATH || '/api/routers/list'}`;
const CONNECTION_API_URL = `${appConfig.API_BASE_URL || 'http://localhost:8080'}/api/connections/list`;

const DEMO_CONNECTIONS = [
    { client: 'Quarkus-Server-Node', ip: '10.0.0.1', protocol: 'OpenVPN', download: 1250.5, upload: 450.2 },
    { client: 'Admin-Workstation', ip: '10.0.0.5', protocol: 'WireGuard', download: 85.0, upload: 12.5 },
    { client: 'IoT-Gateway', ip: '10.0.0.40', protocol: 'TCP', download: 0.5, upload: 0.1 }
];

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson(url) {
    if (!API_ENABLED) throw new Error('Backend-API deaktiviert');
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`API-Fehler ${response.status}`);
    }

    return response.json();
}

async function loadTrafficData() {
    let router = null;
    let connections = DEMO_CONNECTIONS;

    try {
        const routers = await fetchJson(ROUTER_API_URL);
        router = Array.isArray(routers) ? routers[0] : null;
    } catch (error) {
        
    }

    try {
        const data = await fetchJson(CONNECTION_API_URL);
        if (Array.isArray(data) && data.length) {
            connections = data;
        }
    } catch (error) {
        
    }

    updateStatsDisplay(router, connections);
    updateTrafficTable(connections);
    updateTrafficChart(connections);
}

function formatMbit(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-- Mb/s';
    return `${number.toFixed(number >= 100 ? 0 : 1)} Mb/s`;
}

function updateStatsDisplay(router, connections = []) {
    const speedStats = Array.isArray(router?.speedStats) ? router.speedStats : [];
    const latestSpeed = speedStats.length > 0 ? speedStats[speedStats.length - 1] : null;

    const fallbackDownload = connections.reduce((sum, c) => sum + Number(c.download || 0), 0);
    const fallbackUpload = connections.reduce((sum, c) => sum + Number(c.upload || 0), 0);

    const download = latestSpeed?.downloadSpeed ?? fallbackDownload;
    const upload = latestSpeed?.uploadSpeed ?? fallbackUpload;

    document.getElementById('statDownload').textContent = formatMbit(download);
    document.getElementById('statUpload').textContent = formatMbit(upload);
    document.getElementById('statConnections').textContent = String(connections.length);
    document.getElementById('statVolume').textContent = `${((fallbackDownload + fallbackUpload) / 1024).toFixed(2)} GB`;
}

function normalizeConnection(connection) {
    return {
        client: connection.client ?? connection.hostname ?? '-',
        ip: connection.ip ?? connection.ipAddress ?? '-',
        protocol: connection.protocol ?? connection.connectionType ?? '-',
        download: Number(connection.download ?? connection.downloadSpeed ?? 0),
        upload: Number(connection.upload ?? connection.uploadSpeed ?? 0)
    };
}

function updateTrafficTable(connections = []) {
    const tableBody = document.getElementById('traffic-table-body');
    if (!tableBody) return;

    const rows = connections.map(normalizeConnection)
        .sort((a, b) => (b.download + b.upload) - (a.download + a.upload));

    if (rows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">Keine Verbindungen verfügbar</td></tr>';
        return;
    }

    tableBody.innerHTML = rows.map(connection => `
        <tr>
            <td><strong>${escapeHtml(connection.client)}</strong></td>
            <td>${escapeHtml(connection.ip)}</td>
            <td><span class="protocol-pill">${escapeHtml(connection.protocol)}</span></td>
            <td>${formatMbit(connection.download)}</td>
            <td>${formatMbit(connection.upload)}</td>
        </tr>
    `).join('');
}

function updateTrafficChart(connections = []) {
    const chart = document.getElementById('connectionBars');
    if (!chart) return;

    const rows = connections.map(normalizeConnection);
    const max = Math.max(1, ...rows.map(c => Math.max(c.download, c.upload)));

    chart.innerHTML = rows.map(connection => {
        const downloadWidth = Math.max(4, (connection.download / max) * 100);
        const uploadWidth = Math.max(4, (connection.upload / max) * 100);

        return `
            <div class="connection-bar-row">
                <div class="connection-bar-label">
                    <strong>${escapeHtml(connection.client)}</strong>
                    <span>${escapeHtml(connection.protocol)}</span>
                </div>
                <div class="connection-bars">
                    <div class="bar-line"><span class="bar download-bar" style="width:${downloadWidth}%"></span><em>${formatMbit(connection.download)}</em></div>
                    <div class="bar-line"><span class="bar upload-bar" style="width:${uploadWidth}%"></span><em>${formatMbit(connection.upload)}</em></div>
                </div>
            </div>
        `;
    }).join('');
}

function setupEvents() {
    const btn = document.getElementById('refreshButton');
    if (btn) {
        btn.addEventListener('click', loadTrafficData);
    }
}

setupEvents();
loadTrafficData();
