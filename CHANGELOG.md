# Changelog

## 0.1.5

- Correct Marketplace publisher to `verisoftcz` and add repository, issue tracker, homepage, keywords and a PNG icon.
- Prepare the standalone open-source repository with contribution/security policies, examples, readable formatting and cross-platform CI.
- Add package/release validation, tested-artifact GitHub releases and manual OIDC Marketplace publishing.
- Exclude source maps, tests and local investigation reports from the published extension.

## 0.1.4

- Date conversion defaults to Europe/Prague and Czech dd.MM.yyyy HH:mm:ss output; ISO format remains selectable.
- Add YAML → JSON and JSON → YAML with bounded YAML 1.2 parsing.
- Tree and Graph inspect YAML text directly, including JSON → YAML output, with existing zoom/pan and complexity limits.
- JWT Inspect accepts an optional case-insensitive Bearer prefix.

## 0.1.3

- Add one-step Base64 → Text and Text → Base64 with UTF-8 and standard/URL alphabets.
- Add Decode Escaped JSON Fields for mixed documents and JSON → Escaped JSON for whole documents or selected fields.
- Add random UUID v4 GUID generation with count, case and brace options.
- Add Date → UTC / Timezone with auto-detection, selectable/custom formats, source/output zones, and DST validation.

## 0.1.2

- Ctrl/Cmd + mouse wheel zooms the JSON graph around the pointer; ordinary scrolling is preserved.
- Use absolute graph scale up to 1600%, independent of graph size, plus a 100% button and zoom indicator.
- Fit and drag panning account for the actual viewport, including resizing the output column.

## 0.1.1

- Add JSON Unescape for quoted JSON strings or bare escaped string contents, with automatic or explicit input format selection.
- Decode exactly one escape layer; report malformed escapes as step errors. Chain with JSON Parse for tree/graph inspection.

## 0.1.0

- Initial offline VS Code extension with an isolated recipe engine and 17 operations.
- Text, JSON tree, bounded SVG graph and hex inspection.
- Version-checked selection replacement; user/workspace recipe persistence and portable JSON import/export.
