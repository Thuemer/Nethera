document.addEventListener('DOMContentLoaded', () => {
  const saved = JSON.parse(localStorage.getItem('nethera-config') || '{}');
  if (saved.routerName) document.getElementById('routerName').value = saved.routerName;
  if (saved.securityMode) document.getElementById('securityMode').value = saved.securityMode;

  document.querySelector('app-hero').addEventListener('hero-click', () => {
    const data = {
      routerName: document.getElementById('routerName').value,
      securityMode: document.getElementById('securityMode').value,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('nethera-config', JSON.stringify(data));
    document.getElementById('statusBox').setAttribute('text', 'Demo-Konfiguration lokal gespeichert.');
    document.getElementById('statusBox').setAttribute('state', 'success');
  });
});
