const ROUTER_API_URL = 'http://localhost:8080/api/routers/list';

const state = {
    devices: [],
    filteredDevices: [],
    updatedAt: null
};

function toDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return '-';

    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function normalizeConnectionType(type) {
    const value = String(type || '').trim().toLowerCase();
    if (value === 'wifi') return 'wifi';
    if (value === 'lan') return 'lan';
    return 'other';
}

function toConnectionLabel(type) {
    if (type === 'wifi') return 'WiFi';
    if (type === 'lan') return 'LAN';
    return 'Sonstige';
}

function bySort(sortBy, a, b) {
    if (sortBy === 'hostname') {
        return (a.hostname || '').localeCompare(b.hostname || '', 'de', { sensitivity: 'base' });
    }

    if (sortBy === 'ip') {
        return (a.ipAddress || '').localeCompare(b.ipAddress || '', 'de', { numeric: true, sensitivity: 'base' });
    }

    const aTime = toDate(a.lastSeen)?.getTime() || 0;
    const bTime = toDate(b.lastSeen)?.getTime() || 0;
    return bTime - aTime;
}

function setMessage(message, isError = false) {
    const el = document.getElementById('statusMessage');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
}

function updateStats() {
    const total = state.devices.length;
    const wifi = state.devices.filter(d => d.connectionType === 'wifi').length;
    const lan = state.devices.filter(d => d.connectionType === 'lan').length;

    document.getElementById('statTotal').textContent = String(total);
    document.getElementById('statWifi').textContent = String(wifi);
    document.getElementById('statLan').textContent = String(lan);

    const latestSeen = state.devices
        .map(d => toDate(d.lastSeen))
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime())[0];

    document.getElementById('statUpdated').textContent = latestSeen ? formatDateTime(latestSeen) : '-';
}

function renderTable() {
    const body = document.getElementById('deviceTableBody');
    body.innerHTML = '';

    if (!state.filteredDevices.length) {
        const row = document.createElement('tr');
        row.className = 'empty-row';
        row.innerHTML = '<td colspan="5">Keine Clients für die aktuelle Filterung gefunden.</td>';
        body.appendChild(row);
        return;
    }

    state.filteredDevices.forEach(device => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.hostname || '-'}</td>
            <td>${device.ipAddress || '-'}</td>
            <td>${device.macAddress || '-'}</td>
            <td><span class="conn-badge ${device.connectionType}">${toConnectionLabel(device.connectionType)}</span></td>
            <td>${formatDateTime(device.lastSeen)}</td>
        `;
        body.appendChild(row);
    });
}

function applyFilters() {
    const searchTerm = String(document.getElementById('searchInput').value || '').trim().toLowerCase();
    const connection = document.getElementById('connectionFilter').value;
    const sortBy = document.getElementById('sortBy').value;

    const filtered = state.devices.filter(device => {
        const matchesConnection = connection === 'all' || device.connectionType === connection;

        if (!matchesConnection) {
            return false;
        }

        if (!searchTerm) {
            return true;
        }

        const haystack = [device.hostname, device.ipAddress, device.macAddress]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return haystack.includes(searchTerm);
    });

    state.filteredDevices = filtered.sort((a, b) => bySort(sortBy, a, b));
    renderTable();

    setMessage(`${state.filteredDevices.length} von ${state.devices.length} Clients angezeigt.`);
}

async function loadDevices() {
    setMessage('Lade aktuelle Client-Daten ...');

    try {
        const response = await fetch(ROUTER_API_URL, {
            headers: { Accept: 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`API-Fehler ${response.status}`);
        }

        const routers = await response.json();
        const router = Array.isArray(routers) ? routers[0] : null;
        const rawDevices = Array.isArray(router?.devices) ? router.devices : [];

        state.devices = rawDevices.map(device => ({
            id: device.id,
            hostname: device.hostname,
            ipAddress: device.ipAddress,
            macAddress: device.macAddress,
            connectionType: normalizeConnectionType(device.connectionType),
            lastSeen: device.lastSeen
        }));

        state.updatedAt = new Date();

        updateStats();
        applyFilters();

        const routerLabel = router?.name ? ` auf ${router.name}` : '';
        setMessage(`${state.devices.length} Clients${routerLabel} geladen.`);
    } catch (error) {
        state.devices = [];
        state.filteredDevices = [];
        updateStats();
        renderTable();

        setMessage(`Clientdaten konnten nicht geladen werden: ${error.message}`, true);
        console.error('loadDevices:', error);
    }
}

function setupEvents() {
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('connectionFilter').addEventListener('change', applyFilters);
    document.getElementById('sortBy').addEventListener('change', applyFilters);
    document.getElementById('refreshButton').addEventListener('click', loadDevices);
}

document.addEventListener('DOMContentLoaded', () => {
    setupEvents();
    loadDevices();
});
