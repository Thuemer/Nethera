// Basis Card-Komponente
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
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'status');
        
        const devices = this.getAttribute('devices') || '11';
        const status = this.getAttribute('status') || 'Online';
        
        this.innerHTML = `
            <div class="card-header">
                <h2>Router</h2>
            </div>
            <div class="router-box">
                <div>
                    <div>Status</div>
                    <div class="under">Verbundene Clients</div>
                </div>
                <div class="router-right">
                    <div class="online">
                        <span class="dot"></span> ${status}
                    </div>
                    <div class="count">${devices}</div>
                </div>
            </div>
        `;
    }
}

// Features Komponente
class FeaturesCard extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'features');
        
        this.innerHTML = `
            <div class="card-header">
                <h2>Features</h2>
                <span class="icon">🛠</span>
            </div>
            <ul class="feature-list">
                <li class="ok">Werbung Blockieren</li>
                <li class="bad">Blockiere Liste: Streaming Dienste</li>
                <li class="bad">Blockiere Liste: Gast</li>
                <li class="ok">Priorisiere: Figma</li>
            </ul>
        `;
    }
}

// Speed Chart Komponente
class SpeedCard extends HTMLElement {
    constructor() {
        super();
        this.upload = [30, 220, 300, 250];
        this.download = [220, 250, 190, 300];
        this.labels = ["12:00", "12:05", "12:10", "12:15"];
        this.padding = {
            left: 50,
            right: 20,
            top: 20,
            bottom: 40
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
            <canvas class="speedChart" width="400" height="200"></canvas>
            <div class="legend">
                <span class="upload">● Upload</span>
                <span class="download">● Download</span>
            </div>
        `;
        
        // Warte, bis DOM vollständig gerendert ist
        this.addEventListener('DOMContentLoaded', () => this.drawChart(), { once: true });
        requestAnimationFrame(() => this.drawChart());
    }

    drawChart() {
        const canvas = this.querySelector('.speedChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const maxY = Math.max(...this.upload, ...this.download) * 1.1;

        this.drawAxes(ctx, canvas, maxY);
        this.drawLine(ctx, canvas, this.upload, '#3b82f6', maxY);
        this.drawLine(ctx, canvas, this.download, '#6ee7c8', maxY);
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
        ctx.font = "12px system-ui";
        const steps = 4;

        for (let i = 0; i <= steps; i++) {
            const val = Math.round((maxY / steps) * i);
            const y =
                canvas.height -
                this.padding.bottom -
                (i / steps) *
                    (canvas.height - this.padding.top - this.padding.bottom);

            ctx.fillText(`${val} MB/s`, 5, y + 4);

            ctx.strokeStyle = "#333";
            ctx.beginPath();
            ctx.moveTo(this.padding.left, y);
            ctx.lineTo(canvas.width - this.padding.right, y);
            ctx.stroke();
        }

        // X Labels
        this.labels.forEach((label, i) => {
            const x =
                this.padding.left +
                (i / (this.labels.length - 1)) *
                    (canvas.width - this.padding.left - this.padding.right);

            ctx.fillText(label, x - 12, canvas.height - 10);
        });
    }

    drawLine(ctx, canvas, data, color, maxY) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;

        data.forEach((val, i) => {
            const x =
                this.padding.left +
                (i / (data.length - 1)) *
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
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'activity');
        
        this.innerHTML = `
            <div class="card-header">
                <h2>Aktivität</h2>
                <span class="icon">📶</span>
            </div>
            <div class="allAcitivities">
                <div class="activity ok">📶 iPhone von Helmut verbunden</div>
                <div class="activity ok">📶 Jakob verbunden</div>
                <div class="activity">❌ Lex 4587 verlassen</div>
            </div>
        `;
    }
}

// DNS Komponente
class DnsCard extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.classList.add('card');
        this.setAttribute('data-section', 'dns');
        
        const blocked = this.getAttribute('blocked') || '238';
        const prevented = this.getAttribute('prevented') || '27';
        const failed = this.getAttribute('failed') || '2';
        
        this.innerHTML = `
            <div class="card-header">
                <h2>DNS Heute</h2>
                <span class="icon">🛡</span>
            </div>
            <div class="dns_all">
                <div class="dns">
                    <div><span class="dnstext">Werbungen Blockiert:</span><strong>${blocked}</strong></div>
                    <div><span class="dnstext">Tracker Verhindert:</span><strong>${prevented}</strong></div>
                    <div><span class="dnstext">Fehlgeschlagene Anfragen:</span><strong>${failed}</strong></div>
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
        this.remove();
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
        this.remove();
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
        
        if (!this.editMode) {
            this.saveLayout();
        }
    }

    fitCardsPool() {
        if (this.editMode) return;

        const dashboard = this.querySelector('.dashboard') || this;
        const visibleCards = this.cards.filter(c => !c.classList.contains('hidden'));
        const gap = 20;

        const vw = dashboard.clientWidth;
        const vh = dashboard.clientHeight;

        const count = visibleCards.length;
        if (!count) return;

        let cols;

        if (count === 3) cols = 2;
        else if (count === 5) cols = 3;
        else cols = Math.ceil(Math.sqrt(count));

        const rows = Math.ceil(count / cols);

        const cardWidth = Math.min((vw - gap * (cols - 1)) / cols, 420);
        const cardHeight = Math.min((vh - gap * (rows - 1)) / rows, 260);

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

            // Drag
            card.addEventListener('mousedown', e => {
                if (!this.editMode) return;
                dragging = true;
                offsetX = e.clientX - card.offsetLeft;
                offsetY = e.clientY - card.offsetTop;
                card.style.zIndex = 1000;
            });

            document.addEventListener('mousemove', e => {
                if (!dragging) return;
                card.style.left = `${e.clientX - offsetX}px`;
                card.style.top = `${e.clientY - offsetY}px`;
            });

            document.addEventListener('mouseup', () => {
                dragging = false;
                card.style.zIndex = '';
            });

            // Resize
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            card.appendChild(handle);

            let resizing = false;

            handle.addEventListener('mousedown', e => {
                if (!this.editMode) return;
                e.stopPropagation();
                resizing = true;
            });

            document.addEventListener('mousemove', e => {
                if (!resizing) return;
                card.style.width = `${e.clientX - card.offsetLeft}px`;
                card.style.height = `${e.clientY - card.offsetTop}px`;
            });

            document.addEventListener('mouseup', () => {
                resizing = false;
            });
        });
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
