# Verification report and remaining release checks

## 0.1.5 repository preparation — 2026-11-03

Publisher changed to `verisoftcz`; the integration test resolves the new extension id. Repository metadata targets `verisoftCZ/developer-power-tools`. Added an executed-example test (63 unit tests total), release/lockfile/tag checks and a strict VSIX file allowlist. Readable source formatting, a committed PNG icon, contribution/security policies, issue templates and pinned-action CI/release/publish workflows are included. Source maps, test code, local benchmark/investigation reports, dependency trees and tooling are excluded from the VSIX. Local checks do not establish that GitHub Actions or Marketplace authentication have run; those require the repository's first push and publisher setup. Existing local prototype recipes must be exported/imported when changing publisher identities.

## 0.1.4 update — 2026-11-03

26 operations total. All 62 unit tests pass, including Prague summer/winter and Czech output formatting, selectable UTC/ISO output, YAML/JSON roundtrips and type preservation, invalid/duplicate YAML, unsupported tags, multiple documents, oversized integers, non-finite numbers, alias expansion/cycles, depth/size limits, inert prototype keys, and case-insensitive Bearer JWT handling. Three new browser tests cover JSON → YAML → JSON, direct YAML tree/graph/zoom inspection (including pasted YAML without operations), unsupported tags and Bearer-prefixed inspection; the date workflow verifies new defaults and selectable ISO output. The pinned YAML parser is bundled and its ISC license is included. Earlier no-third-party-runtime statements below describe previous releases.

## 0.1.3 update — 2026-11-03

Six new operations bring the registry to 24: Base64 → Text, Text → Base64, Decode Escaped JSON Fields, JSON → Escaped JSON, Generate GUID, and Date → UTC / Timezone. All 55 unit tests pass, including mixed-field preservation, selective re-encoding, Unicode Base64, malformed data, prototype keys, GUID v4 shape/format/count, automatic/explicit/custom date formats, source/output zones, seasonal offsets, invalid dates, DST gaps and repeated-time disambiguation. Three new browser workflows run the new operations in real workers. Extension-host integration also smoke-tests all six in the minimum supported host. Synthetic test data mirrors the supplied example's structure; personal details from the example are not stored in fixtures.

## 0.1.2 update — 2026-11-03

Graph scale now uses CSS pixels instead of a multiplier of the whole graph's fitted size. Added Ctrl/Cmd + wheel zoom anchored at the pointer, 100% reset, 1600% maximum, a percentage indicator, and viewport-aware fit/pan/resize. Browser regression tests verify wheel directions, pointer anchoring, ordinary wheel preservation, absolute scaling on a 241-node tall graph, maximum zoom, Fit, background dragging and column resizing. Existing graph collapse and complexity fallback tests also pass.

## 0.1.1 update — 2026-11-03

JSON Unescape adds one operation (18 total). Strict TypeScript check, builds and all 41 unit tests pass. The new Chromium test verifies operation discovery, unescaping in a real worker, explicit JSON Parse chaining and tree inspection. New golden vectors cover quoted/unquoted input, every JSON escape, Unicode, whitespace preservation, single-layer decoding, malformed input and step errors. The original 0.1.0 evidence below remains historical; its platform and release limitations still apply.

Date: 2026-11-02. Local environment: Windows x64, development Node 24.15.0, desktop VS Code 1.143.1 and minimum VS Code 1.99.0. This is a tested local preview, not a claim that every release gate in the source specification is satisfied.

## Executed

- TypeScript strict check and separate host/worker/browser bundles.
- 36 Node tests: golden vectors, all 256 byte values through Base64/hex, malformed alphabets/padding/UTF-8, JSON syntax location, nested JSON path/recursion/depth/atomic failures, prototype keys, URL modes, gzip limit/roundtrip, SHA-256, JWT unverified claims, explicit timezone, schema/protocol adversarial cases, recipe settings roundtrip and incidental input stripping, reorder/disable/identity, input/intermediate quotas, transferables, supersession, deadlines and cancellation/recovery. CPU cancellation test waits until a synchronous infinite-loop fixture has actually started, then verifies termination and a subsequent successful run.
- Real VS Code Extension Development Host integration on both 1.143.1 and 1.99.0: activate extension, contributed commands, actual worker Base64 → bytes → UTF-8 → JSON pipeline, capture selected text, versioned replacement, stale version rejection, open-selection command and panel open/close. Tests use a synthetic untitled document and isolated test profile.
- Six Chromium browser tests with the actual bundled UI, shared HTML/CSP template and real worker engine behind a simulated VS Code message/clipboard/storage bridge: example pipeline, text/tree/search, graph collapse by mouse and keyboard, malformed-step errors, keyboard run, input invalidation, binary copy restrictions/hex, disable/reorder/remove, inert HTML/script input, recipe-only persisted UI state, graph/tree bounds, narrow stacking and light-theme token changes. These do not automate the actual VS Code webview bridge or native file/QuickPick dialogs.
- Screenshots: `workbench.png` at 1440×900 and `workbench-narrow.png` at 600px width. Visually inspected desktop layout; browser tests verify stacking.
- 25-sample native/worker 1 MiB benchmark, with cancellation through termination and RSS snapshot; raw report in benchmark.json. No panel warm-start or RSS high-water claims.
- npm audit: zero reported vulnerabilities following the build-only packager update and scoped patched minimatch override. No third-party runtime dependencies.
- CyberChef 11.5.0 package installation/runtime/bundle investigation; unmodified runtime and bundle fail, documented as failures in ADR-001.

## Source-spec scenario mapping

| Scenarios | Evidence                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| F01–F08   | Core tests; reorder/disable also covered in browser                                                                  |
| F09       | Implementation supports persisted user/workspace JSON; real save/restart/load dialog flow remains manual             |
| F10       | Core validates/preserves unknown operations; disabled unknown step runs; import dialog remains manual                |
| F11–F12   | Real VS Code capture/replacement/stale-version integration tests                                                     |
| F13–F14   | Browser tree and graph cap/fallback checks; core nested depth bound                                                  |
| F15–F18   | Empty identity, real worker cancellation/recovery, supersession, invalid UTF-8 tests                                 |
| F19       | Browser light/dark screenshots and responsive check; actual theme switching/high contrast manual pass remains        |
| F20       | Keyboard run, graph toggle, accessible move/enable/remove controls tested; full screen-reader/keyboard audit remains |

## Before a public release

Verify user/workspace save/restart/load and native import/export dialogs in VS Code; corrupt workspace recipe handling and untrusted workspace behavior; full actual webview integration; light/dark/high contrast and screen reader use; macOS/Linux/WSL/remote; repeated panel/run/cancel leak checks; 10/100 MiB graceful-rejection scenarios; measured panel startup/rendering, high-water RSS and offline packet capture. CI is supplied as a template, not claimed to have run remotely.

## Reproduction

From this extension folder: `npm ci`, `npm run check`, `npm run build`, `npm test`, `npm run test:integration`, `npx playwright install chromium`, `npm run test:e2e`, `npm run benchmark`, `npm audit`, `npm run package`. Generated VSIX is ignored by Git but retained locally for installation. Screenshots and machine-readable reports are intentionally included for review.
