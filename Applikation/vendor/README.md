# Local browser dependencies

The static Docker frontend ships these pinned npm distributions locally; no CDN is needed for authentication or icons.

| Package | Version | Distributed file | License |
| --- | --- | --- | --- |
| lucide | 1.73.0 | dist/umd/lucide.min.js | LICENSE.lucide |

Source: https://www.npmjs.com/package/lucide/v/1.73.0.

The topology renders accessible DOM buttons and SVG connections locally. Cytoscape is no longer shipped.
Downloaded using `npm pack --ignore-scripts`. No package scripts were executed.

Registry tarball integrity:

- lucide: `sha512-qiNin5j7qEflnAdLG/9Yb4d5N9qnnP8TOMdn6e66399fgX25Y0eYEPS3PUPWGIPLloOj4X+xLTdF2lk9gSgWpA==`

- `keycloak.min.js`: Keycloak JS 24.0.5 (unverändert aus dem npm-Paket `keycloak-js@24.0.5`), Apache-2.0, siehe `LICENSE.keycloak`. Lokal eingebunden, damit die Anmeldung kein externes CDN benötigt.
