# Contributing

Bug reports, documentation, accessibility improvements and focused operations are welcome. Open an issue before large changes so maintainers can discuss scope and compatibility.

## Setup

Use Node 24 (`.nvmrc`), npm and desktop VS Code. Clone the repository, then:

```sh
npm ci
npm run verify
npx playwright install chromium
npm run test:e2e
npm run test:integration
```

On Linux, use `xvfb-run -a npm run test:integration` without a display. Set `VSCODE_TEST_VERSION=1.99.0` to check the minimum host, or `VSCODE_EXECUTABLE` to an existing installation. F5 launches an Extension Development Host. `npm run format` formats source; `npm run format:check` checks it. Regenerate the committed icon with `npm run icon` after installing Chromium.

## Operations and viewers

Register operations in `src/core/operations/registry.ts`, with a stable id, accepted/output kinds, parameter defaults and a clear description. Keep larger implementations in separate modules. Explicit conversion and binary/Unicode preservation matter. Maintain existing operation ids and saved recipes; discuss behavior changes before changing defaults. Add golden vectors, malformed-input cases, quota checks and relevant browser/integration coverage.

All processing must remain local. Do not add telemetry, network requests, arbitrary recipe code, unbounded decompression or input persistence. Render untrusted content with text nodes. CPU-bound work belongs in workers; graph/tree work must stay bounded. See [architecture](docs/architecture.md) and [security design](docs/security.md).

## Pull requests

Keep changes focused, explain the resulting behavior and list checks run. Use synthetic data in examples and screenshots. Update CHANGELOG.md for user-visible changes. CI checks Linux, Windows and macOS, the minimum host, browser flows and packaging; a workflow definition is not proof that every platform has already passed. Follow the [code of conduct](CODE_OF_CONDUCT.md).

Contributions are licensed under the repository's MIT license. Retain third-party notices and disclose new dependencies/licenses. No contributor license agreement is required.
