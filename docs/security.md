# Security review

## Implemented controls

- Webview CSP: default deny, nonce script, extension-local stylesheet, no network connections, no remote resources, restricted localResourceRoots.
- Pasted/imported values render via textContent/DOM text nodes. The only innerHTML is the static application shell. No eval, dynamic JavaScript recipes, untrusted HTML or executable imports.
- Incoming protocol and recipes validated; import size bounded before reading. Limits cover step count, parameters, input bytes, intermediate/output bytes, gzip output, worker deadline and heap.
- CPU-bound execution is in worker_threads. Termination interrupts synchronous operations; new runs do not reuse a poisoned worker.
- Explicit bytes/text conversion; UTF-8 decoder is fatal by default. Canonical Base64 validation rejects impossible padding/trailing bits. JWT results prominently report signatureVerified=false.
- JSON Pointer traversal permits only own properties and uses defineProperty when replacing values, including `__proto__`, to avoid prototype pollution.
- Selection replacement requires the original document/version/text and a versioned TextEditor edit. UI edits invalidate previous output.
- No telemetry, network modules or automatic persistence of input/output. Recipe state and explicitly saved recipes contain no input field. Errors are displayed locally; no input logging.
- YAML support uses the pinned `yaml@2.9.1` ISC-licensed library, bundled locally (no runtime fetching). Its license is in THIRD-PARTY-NOTICES.md. Build tooling is locked in package-lock.json and excluded from VSIX. CyberChef spike dependency tree is excluded too.
- YAML 1.2 core schema only, with no custom or YAML 1.1 extension tags; warnings and duplicate keys fail. ParseDocument uses error logging level and explicit error/warning checks (silent mode suppresses its multiple-document error). Alias expansion is capped at 50; cycles, non-finite numbers, oversized integers, complex map keys and multiple documents are rejected. Converted values are cloned using own properties, bounded to 64 levels/100,000 visits and an output byte budget. No tag handlers can execute code or fetch external data.
- YAML graph/tree inspection uses the same parser and bounds on the capped preview; graph node and tree rendering caps still apply.

## Boundaries and residual risk

Workers are isolation for responsiveness/resource handling, not a security sandbox for arbitrary code. Only built-in operations are registered. Heap limits exclude external Buffer allocations, so they are not a total RSS quota. Very deep JSON can be rejected by serialization stack limits. Serialization is not streaming. Clipboard, recipe file exports and editor replacement intentionally move user-selected data on explicit actions.

Dependencies and npm audit must be rechecked before release. A scoped minimatch override in the build-only VSIX packager selects the patched v11 API; packaging verifies its compatibility. This override does not ship in the extension.

Code review and automated adversarial vectors are included. Packet capture, full CSP browser fuzzing and external security audit have not been performed. Do not describe those checks as passed.
