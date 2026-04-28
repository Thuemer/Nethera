// Basis Card-Komponente
const ROUTER_API_URL = 'http://localhost:8080/api/routers/list';
let primaryRouterPromise = null;

function formatDateTime(value) {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(value) {
    if (!value) return '--:--';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function sortByTimestamp(items) {
    return [...(items || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function getPrimaryRouter() {
    if (!primaryRouterPromise) {
        primaryRouterPromise = fetch(ROUTER_API_URL, {
            headers: {
                Accept: 'application/json'
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API Fehler: ${response.status}`);
                }

                return response.json();
            })
            .then(routers => {
                if (!Array.isArray(routers) || routers.length === 0) {
                    throw new Error('Keine Routerdaten gefunden');
                }

                return routers[0];
            });
    }

    return primaryRouterPromise;
}

class DashboardCard extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', this.getAttribute('section') || '');
        
        const title = this.getAttribute('title') || 'Card';
        const icon = this.getAttribute('icon') || '';
        
        let headerHTML = `
            <div class="card-header">
                <h2>${title}</h2>
                ${icon ? `<span class="icon">${icon}</span>` : ''}
            </div>
        `;
        
        let bodyHTML = this.innerHTML;
        this.innerHTML = headerHTML + bodyHTML;
    }
}

// Router Status Komponente
class RouterCard extends HTMLElement {
    constructor() {
        super();
        this.router = null;
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'status');

        this.render();
        this.loadRouterData();
    }

    async loadRouterData() {
        try {
            this.router = await getPrimaryRouter();
        } catch (error) {
            this.router = null;
            console.error('RouterCard:', error);
        }

        this.render();
    }

    render() {
        const devices = this.router?.devices?.length ?? 0;
        const status = this.router?.isOnline ? 'Online' : 'Offline';
        const lastSeen = formatDateTime(this.router?.lastSeen);
        const firmware = this.router?.firmware || '—';

        const isOnline = this.router?.isOnline;

        this.innerHTML = `
            <div class="card-header">
                <h2>Router</h2>
            </div>

            <div class="card-content-stack">
                <div class="card-kpi-row">
                    <div class="card-kpi">
                        <span class="card-kpi-label">Status</span>
                        <span class="card-kpi-value"><span class="status-pill ${isOnline ? '' : 'offline'}"><span class="dot"></span>${status}</span></span>
                    </div>
                    <div class="card-kpi align-right">
                        <span class="card-kpi-label">Clients</span>
                        <span class="card-kpi-value">${devices}</span>
                    </div>
                </div>
                <div class="card-detail-row"><span class="card-detail-label">Zuletzt gesehen</span><span class="card-detail-value">${lastSeen}</span></div>
                <div class="card-detail-row"><span class="card-detail-label">Firmware</span><span class="card-detail-value">${firmware}</span></div>
            </div>
        `;
    }
}

// Features Komponente
class FeaturesCard extends HTMLElement {
    constructor() {
        super();
        this.router = null;
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'features');

        this.render();
        this.loadRouterData();
    }

    async loadRouterData() {
        try {
            this.router = await getPrimaryRouter();
        } catch (error) {
            this.router = null;
            console.error('FeaturesCard:', error);
        }

        this.render();
    }

    render() {
        const latestDns = sortByTimestamp(this.router?.dnsStats).at(-1);
        const latestSpeed = sortByTimestamp(this.router?.speedStats).at(-1);
        const routerName = this.router?.name || '—';
        const model = this.router?.model || '—';
        const blocked = latestDns?.blockedQueries ?? '—';
        const download = latestSpeed?.downloadSpeed != null ? `${latestSpeed.downloadSpeed.toFixed(1)} Mbit/s` : '—';

        this.innerHTML = `
            <div class="card-header">
                <h2>Allgemein</h2>
            </div>
            <ul class="feature-list content-list">
                <li><span class="feature-line"><span class="feature-name">Router</span><span class="feature-value">${routerName}</span></span></li>
                <li><span class="feature-line"><span class="feature-name">Modell</span><span class="feature-value">${model}</span></span></li>
                <li><span class="feature-line"><span class="feature-name">IP-Adresse</span><span class="feature-value">122.168.1.1</span></span></li>
            </ul>
        `;
    }
}

// Speed Chart Komponente
class SpeedCard extends HTMLElement {
    constructor() {
        super();
        this.upload = [];
        this.download = [];
        this.labels = [];
        this.padding = {
            // Mehr Platz links, damit die Y-Achsen-Werte sauber links von der Achse stehen.
            left: 108,
            right: 32,
            top: 46,
            bottom: 44
        };
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'speed');
        
        this.innerHTML = `
            <div class="card-header">
                <h2>Speed</h2>
                <span class="icon">⏱</span>
            </div>
            <div class="speed-summary">
                <div class="card-kpi"><span class="card-kpi-label">Upload</span><span class="card-kpi-value" id="uploadValue">—</span></div>
                <div class="card-kpi align-right"><span class="card-kpi-label">Download</span><span class="card-kpi-value" id="downloadValue">—</span></div>
            </div>
            <div class="speed-card-body">
                <canvas class="speedChart" width="620" height="260"></canvas>
                <div class="chart-tooltip" id="speedTooltip"></div>
                <div class="legend">
                    <span class="upload">● Upload</span>
                    <span class="download">● Download</span>
                </div>
            </div>
        `;

        this.loadSpeedData();
        this.setupChartHover();
    }

    async loadSpeedData() {
        try {
            const router = await getPrimaryRouter();
            const sortedSpeedStats = sortByTimestamp(router?.speedStats);

            this.upload = sortedSpeedStats.map(entry => Number(entry.uploadSpeed) || 0);
            this.download = sortedSpeedStats.map(entry => Number(entry.downloadSpeed) || 0);
            this.labels = sortedSpeedStats.map(entry => formatTime(entry.timestamp));

            const latestSpeed = sortedSpeedStats.at(-1);
            const uploadValue = this.querySelector('#uploadValue');
            const downloadValue = this.querySelector('#downloadValue');
            if (uploadValue) uploadValue.textContent = latestSpeed?.uploadSpeed != null ? `${Number(latestSpeed.uploadSpeed).toFixed(1)} Mbit/s` : '—';
            if (downloadValue) downloadValue.textContent = latestSpeed?.downloadSpeed != null ? `${Number(latestSpeed.downloadSpeed).toFixed(1)} Mbit/s` : '—';
        } catch (error) {
            this.upload = [];
            this.download = [];
            this.labels = [];
            console.error('SpeedCard:', error);
        }

        requestAnimationFrame(() => this.drawChart());
    }


    setupChartHover() {
        const canvas = this.querySelector('.speedChart');
        const tooltip = this.querySelector('#speedTooltip');
        if (!canvas || !tooltip) return;

        const updateTooltip = (event) => {
            if (!this.labels.length) return;
            const rect = canvas.getBoundingClientRect();
            const width = this._chartSize?.width || rect.width;
            const plotWidth = width - this.padding.left - this.padding.right;
            const relX = Math.min(Math.max(event.clientX - rect.left, this.padding.left), width - this.padding.right);
            const index = this.labels.length === 1 ? 0 : Math.round(((relX - this.padding.left) / plotWidth) * (this.labels.length - 1));
            const safeIndex = Math.min(Math.max(index, 0), this.labels.length - 1);
            tooltip.innerHTML = `${this.labels[safeIndex]} · ↓ ${Number(this.download[safeIndex] || 0).toFixed(1)} Mbit/s · ↑ ${Number(this.upload[safeIndex] || 0).toFixed(1)} Mbit/s`;
            tooltip.style.left = `${event.clientX - rect.left}px`;
            tooltip.style.top = `${event.clientY - rect.top}px`;
            tooltip.classList.add('visible');
        };

        canvas.addEventListener('mousemove', updateTooltip);
        canvas.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    }

    drawChart() {
        const canvas = this.querySelector('.speedChart');
        if (!canvas) return;

        if (this.upload.length === 0 || this.download.length === 0 || this.labels.length === 0) {
            this.upload = [0];
            this.download = [0];
            this.labels = ['--:--'];
        }
        
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(320, Math.round(rect.width || 620));
        const height = Math.max(180, Math.round(rect.height || 240));
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        this._chartSize = { width, height };
        this.padding.left = width < 430 ? 82 : 108;
        this.padding.right = width < 430 ? 18 : 32;
        this.padding.top = width < 430 ? 38 : 46;
        this.padding.bottom = 42;
        const maxY = Math.max(1, Math.max(...this.upload, ...this.download) * 1.1);

        this.drawAxes(ctx, this._chartSize, maxY);
        this.drawLine(ctx, this._chartSize, this.upload, '#3b82f6', maxY);
        this.drawLine(ctx, this._chartSize, this.download, '#6ee7c8', maxY);
    }

    drawAxes(ctx, canvas, maxY) {
        ctx.strokeStyle = "#aaa";
        ctx.lineWidth = 1;

        // Y-Achse
        ctx.beginPath();
        ctx.moveTo(this.padding.left, this.padding.top);
        ctx.lineTo(this.padding.left, canvas.height - this.padding.bottom);
        ctx.stroke();

        // X-Achse
        ctx.beginPath();
        ctx.moveTo(this.padding.left, canvas.height - this.padding.bottom);
        ctx.lineTo(canvas.width - this.padding.right, canvas.height - this.padding.bottom);
        ctx.stroke();

        // Y Labels
        ctx.fillStyle = "#aaa";
        ctx.font = "13px Avenir Next, Segoe UI, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const steps = 4;

        for (let i = 0; i <= steps; i++) {
            const val = Math.round((maxY / steps) * i);
            const y =
                canvas.height -
                this.padding.bottom -
                (i / steps) *
                    (canvas.height - this.padding.top - this.padding.bottom);

            ctx.fillText(`${val} Mbit/s`, this.padding.left - 14, y);

            ctx.strokeStyle = "#333";
            ctx.beginPath();
            ctx.moveTo(this.padding.left, y);
            ctx.lineTo(canvas.width - this.padding.right, y);
            ctx.stroke();
        }

        // X Labels - keep sparse so labels never collide with the chart.
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        const labelStep = Math.max(1, Math.ceil(this.labels.length / 4));
        this.labels.forEach((label, i) => {
            if (i % labelStep !== 0 && i !== this.labels.length - 1) return;
            const x =
                this.padding.left +
                ((this.labels.length === 1 ? 0 : i / (this.labels.length - 1))) *
                    (canvas.width - this.padding.left - this.padding.right);

            ctx.fillText(label, x, canvas.height - 10);
        });
    }

    drawLine(ctx, canvas, data, color, maxY) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;

        data.forEach((val, i) => {
            const x =
                this.padding.left +
                ((data.length === 1 ? 0 : i / (data.length - 1))) *
                    (canvas.width - this.padding.left - this.padding.right);

            const y =
                canvas.height -
                this.padding.bottom -
                (val / maxY) *
                    (canvas.height - this.padding.top - this.padding.bottom);

            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });

        ctx.stroke();
    }
}

// Activity Komponente
class ActivityCard extends HTMLElement {
    constructor() {
        super();
        this.logs = [];
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'activity');

        this.render();
        this.loadActivityData();
    }

    async loadActivityData() {
        try {
            const router = await getPrimaryRouter();
            this.logs = sortByTimestamp(router?.activityLogs).reverse();
        } catch (error) {
            this.logs = [];
            console.error('ActivityCard:', error);
        }

        this.render();
    }

    getTypeClass(eventType) {
        if (eventType === 'CONNECTED') return 'ok';
        if (eventType === 'DISCONNECTED') return 'offline';
        if (eventType === 'BLOCKED_URL') return 'warn';
        return '';
    }

    getTypeIcon(eventType) {
        if (eventType === 'CONNECTED') return '📶';
        if (eventType === 'DISCONNECTED') return '❌';
        if (eventType === 'BLOCKED_URL') return '⚠️';
        return '•';
    }

    getTypeLabel(eventType) {
        if (eventType === 'CONNECTED') return 'Verbunden';
        if (eventType === 'DISCONNECTED') return 'Getrennt';
        if (eventType === 'BLOCKED_URL') return 'Blockiert';
        return 'Ereignis';
    }

    render() {
        const visibleLogs = this.logs.slice(0, 2);

        const logHtml = visibleLogs.length
            ? visibleLogs
                .map(log => `
                    <div class="activity ${this.getTypeClass(log.eventType)}">
                        <div class="activity-top">
                            <span class="activity-badge">${this.getTypeLabel(log.eventType)}</span>
                            <span class="activity-time">${formatDateTime(log.timestamp)}</span>
                        </div>
                        <div class="activity-text">
                            <span class="activity-event-icon">${this.getTypeIcon(log.eventType)}</span>
                            <span class="activity-message">${log.details || 'Keine Details vorhanden'}</span>
                        </div>
                    </div>
                `)
                .join('')
            : '<div class="activity activity-empty">Keine Aktivitäten vorhanden</div>';

        this.innerHTML = `
            <div class="card-header">
                <h2>Aktivität</h2>
            </div>
            <div class="allAcitivities">
                ${logHtml}
            </div>
        `;
    }
}

// DNS Komponente
class DnsCard extends HTMLElement {
    constructor() {
        super();
        this.dnsStats = [];
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'dns');

        this.render();
        this.loadDnsData();
    }

    async loadDnsData() {
        try {
            const router = await getPrimaryRouter();
            this.dnsStats = sortByTimestamp(router?.dnsStats || []);
        } catch (error) {
            this.dnsStats = [];
            console.error('DnsCard:', error);
        }

        this.render();
    }

    render() {
        const totals = this.dnsStats.reduce(
            (acc, entry) => ({
                blocked: acc.blocked + (Number(entry.blockedQueries) || 0),
                trackers: acc.trackers + (Number(entry.trackersDetected) || 0),
                total: acc.total + (Number(entry.totalQueries) || 0)
            }),
            { blocked: 0, trackers: 0, total: 0 }
        );

        const latestEntry = this.dnsStats.at(-1) || null;
        const blocked = this.dnsStats.length ? totals.blocked : '—';
        const trackers = this.dnsStats.length ? totals.trackers : '—';
        const total = this.dnsStats.length ? totals.total : '—';
        const timestamp = formatDateTime(latestEntry?.timestamp);

        this.innerHTML = `
            <div class="card-header">
                <h2>DNS Heute</h2>
            </div>
            <div class="dns_all">
                <div class="dns dns-list">
                    <div class="dns-row"><span class="dns-label">Werbung blockiert</span><strong class="dns-value">${blocked}</strong></div>
                    <div class="dns-row"><span class="dns-label">Tracker verhindert</span><strong class="dns-value">${trackers}</strong></div>
                    <div class="dns-row"><span class="dns-label">Anfragen gesamt</span><strong class="dns-value">${total}</strong></div>
                    <div class="dns-row"><span class="dns-label">Letztes Update</span><strong class="dns-value">${timestamp}</strong></div>
                </div>
            </div>
        `;
    }
}

// Bottom Navigation Komponente
class DashboardNav extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.classList.add('bottom-nav');
        
        this.innerHTML = `
            <button data-filter="activity">📶<span>Aktivität</span></button>
            <button data-filter="dns">🛡<span>DNS</span></button>
            <button data-filter="speed">⏱<span>Speed</span></button>
            <button data-filter="status">🔔<span>STATUS</span></button>
            <button data-filter="features">🛠<span>CONFIG</span></button>
        `;
        
        this.setupListeners();
    }

    setupListeners() {
        const buttons = this.querySelectorAll('button');
        const dashboard = document.querySelector('dashboard-container');
        
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.dataset.filter;
                dashboard?.toggleSection(filter, button);
            });
        });
    }

    toggleButton(filter) {
        const button = this.querySelector(`[data-filter="${filter}"]`);
        if (button) {
            button.classList.toggle('active');
        }
    }
}

// Layout Controls Komponente
class LayoutControls extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.classList.add('layout-controls');
        
        this.innerHTML = `
            <button id="editToggle" class="control-btn edit">
                ✏️ <span>Layout bearbeiten</span>
            </button>
            <button id="resetLayout" class="control-btn reset">
                ♻️ <span>Zurücksetzen</span>
            </button>
        `;
        
        this.setupListeners();
    }

    setupListeners() {
        const editBtn = this.querySelector('#editToggle');
        const resetBtn = this.querySelector('#resetLayout');
        const dashboard = document.querySelector('dashboard-container');
        
        editBtn?.addEventListener('click', () => {
            dashboard?.toggleEditMode();
        });
        
        resetBtn?.addEventListener('click', () => {
            dashboard?.resetLayout();
        });
    }

    updateEditMode(isActive) {
        const btn = this.querySelector('#editToggle');
        if (btn) {
            btn.classList.toggle('active', isActive);
        }
    }
}

// Hauptcontainer für das Dashboard
class DashboardContainer extends HTMLElement {
    constructor() {
        super();
        this.cards = [];
        this.buttons = [];
        this.editMode = false;
    }

    connectedCallback() {
        this.classList.add('dashboard-wrapper');
        
        // Warte, bis alle Custom Elements geladen sind
        requestAnimationFrame(() => {
            this.initializeDashboard();
        });
        
        window.addEventListener('resize', () => this.fitCardsPool());
        window.addEventListener('load', () => this.fitCardsPool());
    }

    initializeDashboard() {
        const dashboard = this.querySelector('.dashboard') || this;
        this.cards = Array.from(dashboard.querySelectorAll('.card'));
        this.buttons = Array.from(document.querySelectorAll('dashboard-nav button'));
        
        this.setupCardDragAndDrop();
        this.fitCardsPool();
        this.loadLayout();
    }

    toggleSection(filter, button) {
        this.cards.forEach(card => {
            if (card.dataset.section === filter) {
                card.classList.toggle('hidden');
            }
        });
        
        button?.classList.toggle('active');
        setTimeout(() => this.fitCardsPool(), 50);
    }

    toggleEditMode() {
        this.editMode = !this.editMode;
        document.body.classList.toggle('edit-mode', this.editMode);
        
        const controls = document.querySelector('layout-controls');
        controls?.updateEditMode(this.editMode);
        this.showLayoutFeedback(this.editMode ? 'Bearbeiten aktiv: Boxen verschieben oder unten rechts skalieren.' : 'Layout gespeichert.');
        
        if (!this.editMode) {
            this.snapAllCards();
            this.saveLayout();
        }
    }

    fitCardsPool() {
        if (this.editMode) return;

        const dashboard = this.querySelector('.dashboard') || this;
        const visibleCards = this.cards.filter(c => !c.classList.contains('hidden'));
        const gap = 18;

        const vw = dashboard.clientWidth;
        const vh = dashboard.clientHeight;

        const count = visibleCards.length;
        if (!count) return;

        let cols;

        if (vw < 560) cols = 1;
        else if (vw < 900) cols = Math.min(2, count);
        else if (count === 3) cols = 2;
        else if (count === 5) cols = 3;
        else cols = Math.ceil(Math.sqrt(count));

        const rows = Math.ceil(count / cols);

        const cardWidth = Math.min((vw - gap * (cols - 1)) / cols, 430);
        const cardHeight = Math.max(190, Math.min((vh - gap * (rows - 1)) / rows, 270));

        const totalGridWidth = cols * cardWidth + gap * (cols - 1);
        const startX = (vw - totalGridWidth) / 2;

        visibleCards.forEach((card, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;

            const isLastRow = row === rows - 1;
            const itemsInLastRow = count % cols === 0 ? cols : count % cols;

            let x = startX + col * (cardWidth + gap);

            if (isLastRow && itemsInLastRow < cols) {
                const rowWidth = itemsInLastRow * cardWidth + (itemsInLastRow - 1) * gap;
                const offset = (totalGridWidth - rowWidth) / 2;
                x = startX + offset + col * (cardWidth + gap);
            }

            card.style.position = 'absolute';
            card.style.width = `${cardWidth}px`;
            card.style.height = `${cardHeight}px`;
            card.style.left = `${x}px`;
            card.style.top = `${row * (cardHeight + gap)}px`;
        });
    }

    setupCardDragAndDrop() {
        this.cards.forEach(card => {
            let offsetX, offsetY, dragging = false;
            let resizing = false;

            const MIN_WIDTH = 220;
            const MIN_HEIGHT = 140;

            // Drag
            card.addEventListener('mousedown', e => {
                if (!this.editMode) return;
                if (resizing) return;
                dragging = true;
                offsetX = e.clientX - card.offsetLeft;
                offsetY = e.clientY - card.offsetTop;
                card.style.zIndex = 1000;
                card.classList.add('is-moving');
                this.showLayoutFeedback('Box verschieben – Raster rastet automatisch ein.');
            });

            document.addEventListener('mousemove', e => {
                if (!dragging) return;
                const dashboard = this.querySelector('.dashboard') || this;
                const maxLeft = Math.max(0, dashboard.clientWidth - card.offsetWidth);
                const maxTop = Math.max(0, dashboard.clientHeight - card.offsetHeight);
                const nextLeft = Math.min(Math.max(0, e.clientX - offsetX), maxLeft);
                const nextTop = Math.min(Math.max(0, e.clientY - offsetY), maxTop);
                requestAnimationFrame(() => {
                    card.style.left = `${nextLeft}px`;
                    card.style.top = `${nextTop}px`;
                });
            });

            document.addEventListener('mouseup', () => {
                if (dragging) {
                    this.snapCard(card);
                    this.showLayoutFeedback('Position eingerastet.');
                }
                dragging = false;
                card.classList.remove('is-moving');
                card.style.zIndex = '';
            });

            // Resize
            const attachResizeHandle = () => {
                let handle = card.querySelector(':scope > .resize-handle');
                if (handle) return;

                handle = document.createElement('div');
                handle.className = 'resize-handle';
                card.appendChild(handle);

                handle.addEventListener('mousedown', e => {
                    if (!this.editMode) return;
                    e.preventDefault();
                    e.stopPropagation();
                    dragging = false;
                    resizing = true;
                    card.style.zIndex = 1000;
                    card.classList.add('is-moving');
                    this.showLayoutFeedback('Größe anpassen – Raster rastet automatisch ein.');
                });
            };

            attachResizeHandle();

            // Some cards re-render with innerHTML after API updates and drop the handle.
            // Watch for child changes and re-attach it so every card stays resizable.
            const observer = new MutationObserver(() => {
                attachResizeHandle();
            });
            observer.observe(card, { childList: true });

            document.addEventListener('mousemove', e => {
                if (!resizing) return;
                const dashboard = this.querySelector('.dashboard') || this;
                const maxWidth = Math.max(MIN_WIDTH, dashboard.clientWidth - card.offsetLeft);
                const maxHeight = Math.max(MIN_HEIGHT, dashboard.clientHeight - card.offsetTop);
                const nextWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, e.clientX - card.offsetLeft));
                const nextHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, e.clientY - card.offsetTop));
                requestAnimationFrame(() => {
                    card.style.width = `${nextWidth}px`;
                    card.style.height = `${nextHeight}px`;
                });
            });

            document.addEventListener('mouseup', () => {
                if (resizing) {
                    this.snapCard(card);
                    this.showLayoutFeedback('Größe eingerastet.');
                }
                resizing = false;
                card.classList.remove('is-moving');
                card.style.zIndex = '';
            });
        });
    }

    snap(value) {
        const grid = 16;
        return Math.round(value / grid) * grid;
    }

    snapCard(card) {
        card.style.left = `${this.snap(card.offsetLeft)}px`;
        card.style.top = `${this.snap(card.offsetTop)}px`;
        card.style.width = `${Math.max(220, this.snap(card.offsetWidth))}px`;
        card.style.height = `${Math.max(140, this.snap(card.offsetHeight))}px`;
    }

    snapAllCards() {
        this.cards.forEach(card => this.snapCard(card));
    }

    showLayoutFeedback(message) {
        const hint = document.querySelector('#layoutHint');
        if (hint) hint.textContent = message;
        let toast = document.querySelector('.layout-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'layout-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
    }

    saveLayout() {
        const layout = {};
        this.cards.forEach(card => {
            layout[card.dataset.section] = {
                left: card.style.left,
                top: card.style.top,
                width: card.style.width,
                height: card.style.height
            };
        });
        localStorage.setItem('dashboardLayout', JSON.stringify(layout));
    }

    loadLayout() {
        const saved = localStorage.getItem('dashboardLayout');
        if (!saved) return;

        const layout = JSON.parse(saved);
        this.cards.forEach(card => {
            const l = layout[card.dataset.section];
            if (!l) return;

            Object.assign(card.style, l);
            card.style.position = 'absolute';
        });
    }

    resetLayout() {
        localStorage.removeItem('dashboardLayout');

        this.editMode = false;
        document.body.classList.remove('edit-mode');

        const controls = document.querySelector('layout-controls');
        controls?.updateEditMode(false);

        this.cards.forEach(card => {
            card.style.left = '';
            card.style.top = '';
            card.style.width = '';
            card.style.height = '';
            card.style.position = '';
            card.style.zIndex = '';
        });

        setTimeout(() => this.fitCardsPool(), 50);
    }
}

// Custom Elements registrieren
customElements.define('dashboard-card', DashboardCard);
customElements.define('router-card', RouterCard);
customElements.define('features-card', FeaturesCard);
customElements.define('speed-card', SpeedCard);
customElements.define('activity-card', ActivityCard);
customElements.define('dns-card', DnsCard);
customElements.define('dashboard-nav', DashboardNav);
customElements.define('layout-controls', LayoutControls);
customElements.define('dashboard-container', DashboardContainer);
