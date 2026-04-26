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
});
