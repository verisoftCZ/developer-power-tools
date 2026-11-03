# Security policy

Security fixes target the latest released version. Upgrade before reporting a problem; older versions do not have a separate maintenance schedule.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/verisoftCZ/developer-power-tools/security/advisories/new). Include the affected version, impact, minimal synthetic reproduction and suggested mitigation if available. Do not put vulnerabilities, real tokens, personal data or private documents in public issues. If private reporting is unavailable, contact a listed repository maintainer privately through their GitHub contact details before sharing technical details publicly.

Maintainers will coordinate a fix and disclosure where possible; no guaranteed response time or bounty is offered. Please allow reasonable time for investigation before public disclosure.

## Design and limitations

The extension processes data locally, uses a restrictive webview CSP, validates recipes/messages, and runs transformations in terminable workers. Workers protect responsiveness and bound some resource use; they are not a sandbox for arbitrary untrusted code. JWT Inspect does not verify signatures. Clipboard/export/editor replacement can intentionally move user data. See the [security design](docs/security.md) for quotas and remaining verification work.

Repository owners must enable GitHub **Private vulnerability reporting** under Settings → Security before public launch. See [release setup](docs/releasing.md) for other repository settings.
