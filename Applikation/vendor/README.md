# Local browser dependencies

The static Docker frontend ships these pinned npm distributions locally; no CDN is needed for the graph or the new icons.

| Package | Version | Distributed file | License |
| --- | --- | --- | --- |
| cytoscape | 3.35.0 | dist/cytoscape.min.js | LICENSE.cytoscape |
| lucide | 1.73.0 | dist/umd/lucide.min.js | LICENSE.lucide |

Sources: https://www.npmjs.com/package/cytoscape/v/3.35.0 and https://www.npmjs.com/package/lucide/v/1.73.0.
Downloaded using `npm pack --ignore-scripts`. No package scripts were executed.

Registry tarball integrity:

- cytoscape: `sha512-sMvBIXiGMnhkCaWz2R06FwF/27MNlS+Tqvi17foO9UhnUg3XGZccKjxsvEqQFAQYMSSZmN5SxYzUYlQ0DOJJ3g==`
- lucide: `sha512-qiNin5j7qEflnAdLG/9Yb4d5N9qnnP8TOMdn6e66399fgX25Y0eYEPS3PUPWGIPLloOj4X+xLTdF2lk9gSgWpA==`
