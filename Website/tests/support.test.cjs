const { test } = require('node:test');
const assert = require('node:assert/strict');
const { supportIssueUrl } = require('../js/support.js');

test('creates a GitHub draft with correctly encoded user text and a fixed destination', () => {
  const url = new URL(supportIssueUrl('Geräte und Netzwerk', ' WLAN & Geräte? #1 ', ' Schritte:\n1. Menü öffnen\nErgebnis: <leer> & ü '));
  assert.equal(url.origin + url.pathname, 'https://github.com/Thuemer/Nethera/issues/new');
  assert.equal(url.searchParams.get('title'), '[Support] WLAN & Geräte? #1');
  assert.equal(url.searchParams.get('body'), 'Bereich: Geräte und Netzwerk\n\nSchritte:\n1. Menü öffnen\nErgebnis: <leer> & ü');
  assert.deepEqual([...url.searchParams.keys()], ['title', 'body']);
});
