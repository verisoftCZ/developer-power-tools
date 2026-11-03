# CyberChef compatibility

CyberChef 11.5.0 is investigated by `npm run spike:cyberchef`. The script creates an isolated `.spike` project, disables install scripts, attempts the published API and bundling, and records failures without substituting an unrelated npm package. See `cyberchef-spike.json` and ADR-001.

| CyberChef concept              | Power Tools support                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| From/To Base64                 | Native equivalents, explicit raw-byte output/input and strict canonical validation |
| JSON Beautify/Minify           | JSON Parse + JSON Pretty Print/Minify; explicit typed pipeline                     |
| URL/Hex operations             | Native equivalents, with explicit kinds and modes                                  |
| Nested JSON                    | Own bounded operation; no CyberChef equivalence claim                              |
| JWT/gzip/SHA-256/timestamp     | Native focused implementations; no full argument compatibility claim               |
| `{op,args}` recipe format      | Unsupported; only Power Tools schemaVersion 1 import/export                        |
| All other CyberChef operations | Unsupported; no implied parity                                                     |

The stable extension contract is the local operation registry and schema. This release neither embeds CyberChef nor promises CyberChef recipe migration. Any future adapter must map operation ids/arguments deliberately, validate supported subsets and supply independent binary/invalid-input tests.
