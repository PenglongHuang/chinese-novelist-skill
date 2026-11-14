# Browser dependencies

The workbench runs offline. These files are bundled browser distributions, not Node runtime dependencies. No install or build is required to start it.

| File | Version | Official source archive | SHA256 of bundled JavaScript |
| --- | --- | --- | --- |
| web/vendor/markdown-it.min.js | markdown-it 15.0.3 | https://registry.npmjs.org/markdown-it/-/markdown-it-15.0.3.tgz (`package/dist/browser/markdown-it.umd.min.js`) | 391f2aa638e75e6c7859d0a5c5650ef0956722a45998f17e05b83bc655778e1e |
| web/vendor/purify.min.js | DOMPurify 3.4.17 | https://registry.npmjs.org/dompurify/-/dompurify-3.4.17.tgz (`package/dist/purify.min.js`) | cd37898f9782adf54820c413191b5691803f0f137c799d6edcfd38523b4c2c31 |

Retrieved 2026-11-14. markdown-it is distributed under MIT; see `web/vendor/markdown-it.LICENSE`. DOMPurify offers Apache-2.0 or MPL-2.0; this distribution uses Apache-2.0 (`web/vendor/DOMPurify.LICENSE`), and retains the alternative license in `web/vendor/DOMPurify.LICENSE-MPL`. Copyright and attribution headers are preserved. The project MIT license does not replace these third-party licenses.

The minified distributions retain upstream source-map comments. Source maps are not needed at runtime and are not included.
