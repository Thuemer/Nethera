/* Prepare a draft only. Publication happens on GitHub after the user reviews it. */
function supportIssueUrl(topic, title, details) {
    const url = new URL('https://github.com/Thuemer/Nethera/issues/new');
    url.searchParams.set('title', `[Support] ${title.trim()}`);
    url.searchParams.set('body', `Bereich: ${topic}\n\n${details.trim()}`);
    return url.href;
}

if (typeof document !== 'undefined') {
    const form = document.getElementById('supportForm');
    form.addEventListener('submit', event => {
        event.preventDefault();
        const title = document.getElementById('supportTitle');
        const details = document.getElementById('supportDetails');
        for (const field of [title, details]) {
            field.setCustomValidity(field.value.trim() ? '' : 'Bitte fülle dieses Feld aus.');
        }
        if (!form.reportValidity()) return;
        document.getElementById('supportStatus').textContent = 'Du wechselst zu GitHub, um deinen Entwurf zu prüfen.';
        window.location.assign(supportIssueUrl(document.getElementById('supportTopic').value, title.value, details.value));
    });
    form.addEventListener('input', event => {
        event.target.setCustomValidity?.('');
        document.getElementById('supportStatus').textContent = '';
    });
    window.addEventListener('pageshow', () => { document.getElementById('supportStatus').textContent = ''; });
}
if (typeof module !== 'undefined') module.exports = { supportIssueUrl };
