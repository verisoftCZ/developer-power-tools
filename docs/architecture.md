# Architecture

This is a standalone VS Code extension repository. Build, test, packaging and CI commands run from the repository root.

`src/extension` owns commands, panel lifecycle, recipe files, global state, guarded selection edits and strict version-1 messaging. `src/core` owns the registry, schema, typed pipeline and disposable worker runner. `src/ui` is a vanilla TypeScript webview, with no UI framework or remote resources. esbuild emits separate extension-host, worker and browser bundles.

## Decisions

- ADR-001: focused native operation engine; CyberChef is an isolated feasibility experiment, not a shipped dependency.
- ADR-002: one worker per run, with heap limits and an external deadline. On cancel, supersession, timeout or disposal, terminate it. Completion waits for termination. No arbitrary code or regex operation. Fresh workers trade startup overhead for simple cleanup and isolation.
- ADR-003: recipe schemaVersion 1; operation ids and versions are stable. Schema validation clones input, rejects duplicate step ids and limits size, steps and parameter types. Unknown operation ids are preserved on import and error when enabled. Future schemas fail explicitly; a future migration must be a named, tested conversion rather than silently guessing semantics.
- ADR-004: keep inputs/results in memory; persisted webview state contains the recipe only. Explicit kind conversions. Binary output is hex in previews and cannot replace text without conversion. Untrusted workspaces can run local safe operations/read recipes but cannot save workspace recipes. Recipes cannot execute code or request network resources.

## Extension points

Register an operation in `src/core/operations/registry.ts` with a stable id, version, accepted kinds, output kind, parameter metadata, description and pure implementation. Metadata drives UI controls; the engine validates parameters before invoking it. Add golden tests. Output viewer dispatch is in `renderOutput` in `src/ui/main.ts`; keep rendering bounded and use DOM text nodes for all data.

## Protocol and concurrency

All messages use `{protocolVersion:1,requestId,type,payload}`. Host validates commands, request ids, recipe schemas and input byte limits before executing. Run events include started, per-step completion, completed and failed. UI and host reject stale run ids; input/recipe edits invalidate output and cancel the worker. Results from a previous selection revision are discarded. A document snapshot includes the actual document, its version, range and original text. Replacement submits a versioned TextEditor edit immediately after checks, with undo boundaries.

Output is retained once in the host for copy/replacement and sent as a bounded preview (256 KiB characters; binary hex). Buffers cross worker boundaries using transferable ArrayBuffers. JSON/text necessarily use structured cloning and serialization. Very large JSON still incurs host-side serialization cost; max input/output and rendering caps limit it, but this is not a streaming engine.

## Remaining release work

Full browser/Electron webview bridge automation, Linux/macOS and remote/WSL smoke tests, screen-reader/contrast manual validation, measured panel warm startup/render latency, RSS high-water measurements and traffic capture. Browser UI tests and real Windows extension-host integration (including minimum VS Code 1.99) are provided.
