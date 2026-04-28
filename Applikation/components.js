// Kleine Custom Elements. Absichtlich einfach gehalten, damit man es gut verstehen kann.

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function latest(items, field = 'timestamp') {
  const list = Array.isArray(items) ? items : [];
  return [...list].sort((a, b) => new Date(a[field]) - new Date(b[field])).at(-1) || null;
}

function sortByTime(items, field = 'timestamp') {
  return [...(items || [])].sort((a, b) => new Date(a[field]) - new Date(b[field]));
}

function normalizeConnection(type) {
  const value = String(type || '').toLowerCase();
  if (value === 'wifi') return 'wifi';
  if (value === 'lan') return 'lan';
  return 'other';
}

class AppHero extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute('title') || 'Nethera';
    const text = this.getAttribute('text') || '';
    const button = this.getAttribute('button') || '';
    this.innerHTML = `
      <section class="hero card">
        <div>
          <p class="eyebrow">Nethera Dashboard</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="subline">${escapeHtml(text)}</p>
        </div>
        ${button ? `<button class="refresh-btn" type="button" data-action="hero-button">${escapeHtml(button)}</button>` : ''}
      </section>`;
    this.querySelector('[data-action="hero-button"]')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('hero-click', { bubbles: true }));
    });
  }
}

class StatCard extends HTMLElement {
  static get observedAttributes() { return ['label', 'value', 'detail', 'tone']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    this.innerHTML = `
      <article class="card stat ${escapeHtml(this.getAttribute('tone') || '')}">
        <p>${escapeHtml(this.getAttribute('label') || '')}</p>
        <strong>${escapeHtml(this.getAttribute('value') || '—')}</strong>
        <span class="stat-detail">${escapeHtml(this.getAttribute('detail') || '')}</span>
      </article>`;
  }
}

class DataStatus extends HTMLElement {
  static get observedAttributes() { return ['state', 'text']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    const state = this.getAttribute('state') || 'info';
    const text = this.getAttribute('text') || '';
    this.innerHTML = `<div class="status-message ${escapeHtml(state)}">${escapeHtml(text)}</div>`;
  }
}

class StatusBadge extends HTMLElement {
  static get observedAttributes() { return ['text', 'tone']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    this.innerHTML = `<span class="badge ${escapeHtml(this.getAttribute('tone') || '')}">${escapeHtml(this.getAttribute('text') || '')}</span>`;
  }
}

class ActionButton extends HTMLElement {
  connectedCallback() {
    const text = this.getAttribute('text') || this.textContent || 'Aktion';
    const tone = this.getAttribute('tone') || '';
    this.innerHTML = `<button class="small-btn ${escapeHtml(tone)}" type="button">${escapeHtml(text)}</button>`;
    this.querySelector('button').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('action-click', { bubbles: true }));
    });
  }
}

class AppCard extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = 'true';
    const title = this.getAttribute('title') || '';
    const icon = this.getAttribute('icon') || '';
    const body = this.innerHTML;
    this.innerHTML = `
      <section class="card app-card">
        ${title ? `<div class="card-header"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(icon)}</span></div>` : ''}
        <div class="card-body">${body}</div>
      </section>`;
  }
}

class TextField extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const placeholder = this.getAttribute('placeholder') || '';
    const value = this.getAttribute('value') || '';
    this.innerHTML = `<label class="field"><span>${escapeHtml(label)}</span><input type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}"></label>`;
    this.querySelector('input').addEventListener('input', (event) => {
      this.dispatchEvent(new CustomEvent('field-input', { detail: event.target.value, bubbles: true }));
    });
  }
  get value() { return this.querySelector('input')?.value || ''; }
  set value(v) { const input = this.querySelector('input'); if (input) input.value = v; }
}

class SelectField extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const options = (this.getAttribute('options') || '').split(',').map(x => x.trim()).filter(Boolean);
    this.innerHTML = `<label class="field"><span>${escapeHtml(label)}</span><select>${options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select></label>`;
    this.querySelector('select').addEventListener('change', (event) => {
      this.dispatchEvent(new CustomEvent('field-change', { detail: event.target.value, bubbles: true }));
    });
  }
  get value() { return this.querySelector('select')?.value || ''; }
  set value(v) { const select = this.querySelector('select'); if (select) select.value = v; }
}

class EmptyState extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute('title') || 'Keine Daten';
    const text = this.getAttribute('text') || 'Es wurden keine passenden Daten gefunden.';
    this.innerHTML = `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
  }
}

class LoadingSpinner extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="loading"><span></span> Daten werden geladen ...</div>`;
  }
}

class LineChart extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<canvas class="line-chart" width="720" height="260"></canvas>`;
    this.draw([], []);
  }

  draw(seriesA = [], seriesB = [], labels = [], labelA = 'Download', labelB = 'Upload') {
    const canvas = this.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pad = { left: 52, right: 22, top: 26, bottom: 42 };
    const values = [...seriesA, ...seriesB].map(Number).filter(v => !Number.isNaN(v));
    const max = Math.max(10, ...values) * 1.15;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px system-ui';
    for (let i = 0; i <= 4; i++) {
      const y = h - pad.bottom - (i / 4) * (h - pad.top - pad.bottom);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(`${Math.round((max / 4) * i)}`, 10, y + 4);
    }

    const drawLine = (data, color) => {
      if (!data.length) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      data.forEach((value, index) => {
        const x = pad.left + (index / Math.max(1, data.length - 1)) * (w - pad.left - pad.right);
        const y = h - pad.bottom - (Number(value) / max) * (h - pad.top - pad.bottom);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine(seriesA, '#6ee7c8');
    drawLine(seriesB, '#60a5fa');

    ctx.fillStyle = '#6ee7c8';
    ctx.fillText(`● ${labelA}`, pad.left, 18);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`● ${labelB}`, pad.left + 130, 18);

    if (labels.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.48)';
      ctx.fillText(labels[0], pad.left, h - 16);
      ctx.fillText(labels.at(-1), w - pad.right - 44, h - 16);
    }
  }
}

class DeviceCard extends HTMLElement {
  set device(value) {
    this._device = value;
    this.render();
  }
  get device() { return this._device; }
  connectedCallback() { this.render(); }
  render() {
    const d = this._device || {};
    const type = normalizeConnection(d.connectionType);
    const blocked = localStorage.getItem(`blocked-${d.macAddress}`) === 'true';
    const trusted = localStorage.getItem(`trusted-${d.macAddress}`) === 'true';
    this.innerHTML = `
      <article class="device-card ${blocked ? 'blocked' : ''}">
        <div>
          <h3>${escapeHtml(d.hostname || 'Unbekanntes Client')}</h3>
          <p>${escapeHtml(d.ipAddress || '—')} · ${escapeHtml(d.macAddress || '—')}</p>
          <p class="muted">Zuletzt gesehen: ${formatDateTime(d.lastSeen)}</p>
        </div>
        <div class="device-side">
          <status-badge text="${type === 'wifi' ? 'WiFi' : type === 'lan' ? 'LAN' : 'Sonstige'}" tone="${type}"></status-badge>
          ${blocked ? '<status-badge text="Blockiert" tone="danger"></status-badge>' : ''}
          ${trusted ? '<status-badge text="Vertraut" tone="ok"></status-badge>' : ''}
          <div class="device-actions">
            <action-button text="Details" data-device-action="details"></action-button>
            <action-button text="${blocked ? 'Entblocken' : 'Blockieren'}" tone="danger" data-device-action="block"></action-button>
            <action-button text="${trusted ? 'Normal' : 'Vertrauen'}" tone="ghost" data-device-action="trust"></action-button>
          </div>
        </div>
      </article>`;
  }
}

class DeviceDetailModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="modal-backdrop" hidden><div class="modal card"><button class="modal-close">×</button><div class="modal-content"></div></div></div>`;
    this.querySelector('.modal-close').addEventListener('click', () => this.close());
    this.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) this.close(); });
  }
  open(device) {
    this.querySelector('.modal-content').innerHTML = `
      <h2>${escapeHtml(device.hostname || 'Client')}</h2>
      <div class="detail-grid">
        <span>IP-Adresse</span><strong>${escapeHtml(device.ipAddress || '—')}</strong>
        <span>MAC-Adresse</span><strong>${escapeHtml(device.macAddress || '—')}</strong>
        <span>Verbindung</span><strong>${escapeHtml(device.connectionType || '—')}</strong>
        <span>Zuletzt gesehen</span><strong>${formatDateTime(device.lastSeen)}</strong>
      </div>
      <p class="muted">Hinweis: Blockieren/Vertrauen ist im Frontend gespeichert. Für echtes Router-Blocking braucht dein Backend später eigene Endpunkte.</p>`;
    this.querySelector('.modal-backdrop').hidden = false;
  }
  close() { this.querySelector('.modal-backdrop').hidden = true; }
}

class ToggleView extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="toggle-view"><button class="active" data-mode="normal">Normal</button><button data-mode="profi">Profi</button></div>`;
    this.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      this.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.dispatchEvent(new CustomEvent('mode-change', { detail: btn.dataset.mode, bubbles: true }));
    }));
  }
}

class ConfigRow extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute('title') || '';
    const text = this.getAttribute('text') || '';
    const checked = this.hasAttribute('checked') ? 'checked' : '';
    this.innerHTML = `<label class="config-row"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(text)}</small></span><input type="checkbox" ${checked}></label>`;
  }
}

customElements.define('app-hero', AppHero);
customElements.define('stat-card', StatCard);
customElements.define('data-status', DataStatus);
customElements.define('status-badge', StatusBadge);
customElements.define('action-button', ActionButton);
customElements.define('app-card', AppCard);
customElements.define('text-field', TextField);
customElements.define('select-field', SelectField);
customElements.define('empty-state', EmptyState);
customElements.define('loading-spinner', LoadingSpinner);
customElements.define('line-chart', LineChart);
customElements.define('device-card', DeviceCard);
customElements.define('device-detail-modal', DeviceDetailModal);
customElements.define('toggle-view', ToggleView);
customElements.define('config-row', ConfigRow);
