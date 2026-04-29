const ACCOUNT_API_URL = 'http://localhost:8080/api/accounts/list';

const DEMO_ACCOUNTS = [
  { name: 'Admin Alpha', email: 'admin@network.local', rolle: 'ADMIN', security: true, traffic: true, weekly: true },
  { name: 'User Beta', email: 'beta@home.de', rolle: 'USER', security: false, traffic: true, weekly: false },
  { name: 'Support Gamma', email: 'support@isp.com', rolle: 'MAINTAINER', security: true, traffic: false, weekly: true }
];

function roleLabel(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'Admin';
  if (value === 'MAINTAINER') return 'Maintainer';
  if (value === 'USER') return 'User';
  return role || 'Unbekannt';
}

function boolLabel(value) {
  return value ? 'Aktiv' : 'Aus';
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function renderAccounts(accounts) {
  const list = document.getElementById('accountList');
  if (!list) return;

  if (!accounts.length) {
    list.innerHTML = '<div class="empty-state"><strong>Keine Accounts</strong><p>Es wurden keine Account-Daten gefunden.</p></div>';
    return;
  }

  list.innerHTML = accounts.map(account => `
    <article class="data-card account-data-card">
      <div class="mini-avatar">${initials(account.name)}</div>
      <div class="data-main">
        <div class="data-title-row">
          <strong>${escapeHtml(account.name || 'Unbekannter Account')}</strong>
          <span class="badge ${String(account.rolle || '').toLowerCase()}">${roleLabel(account.rolle)}</span>
        </div>
        <p class="muted one-line">${escapeHtml(account.email || 'Keine E-Mail')}</p>
        <div class="mini-kpi-row">
          <span>Security: <b>${boolLabel(account.security)}</b></span>
          <span>Traffic: <b>${boolLabel(account.traffic)}</b></span>
          <span>Weekly: <b>${boolLabel(account.weekly)}</b></span>
        </div>
      </div>
    </article>
  `).join('');
}

async function loadAccounts() {
  try {
    const response = await fetch(ACCOUNT_API_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    renderAccounts(Array.isArray(data) ? data : DEMO_ACCOUNTS);
  } catch (error) {
    renderAccounts(DEMO_ACCOUNTS);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const saved = JSON.parse(localStorage.getItem('nethera-account') || '{}');
  if (saved.displayName) document.getElementById('displayName').value = saved.displayName;
  if (saved.email) document.getElementById('email').value = saved.email;

  document.querySelector('app-hero').addEventListener('hero-click', () => {
    localStorage.setItem('nethera-account', JSON.stringify({
      displayName: document.getElementById('displayName').value,
      email: document.getElementById('email').value
    }));
    document.getElementById('statusBox').setAttribute('text', 'Account-Daten lokal gespeichert.');
    document.getElementById('statusBox').setAttribute('state', 'success');
  });

  loadAccounts();
});
