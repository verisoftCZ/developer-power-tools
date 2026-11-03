# ADR-001: Native operation registry for v1

Date: 2026-11-02. Decision: **no-go for shipping the unmodified CyberChef 11.5.0 package; go for the focused native TypeScript engine**. The spike evidence and compatibility limits are recorded below.

## Reproducible evidence

Run `npm run spike:cyberchef`. The script pins `cyberchef@11.5.0` in an isolated development-only folder, records npm integrity/metadata, disables install scripts, loads its published CommonJS wrapper, attempts `From Base64 → JSON Beautify`, and attempts a Node-targeted esbuild bundle. Raw results are in [cyberchef-spike.json](../cyberchef-spike.json).

Source inspected: [CyberChef repository](https://github.com/gchq/CyberChef), HEAD observed as `b75398f1134fc59fd74d288f620aa1eecba77dc9`; npm artifact is pinned separately by version/integrity, not assumed identical to HEAD. [Package manifest](https://github.com/gchq/CyberChef/blob/b75398f1134fc59fd74d288f620aa1eecba77dc9/package.json) and [Apache-2.0 license](https://github.com/gchq/CyberChef/blob/b75398f1134fc59fd74d288f620aa1eecba77dc9/LICENSE) were inspected. No CyberChef source/assets ship in this extension.

- The published package has import/require exports; CommonJS wrapper resolves an asynchronous ESM import. It is incorrect to say no API exists.
- Node requirement is `>=24 <27`; incompatible with the declared minimum VS Code 1.99 Node 20 extension host. Node version is tied to Electron/VS Code, not the user's shell Node.
- Unpacked package is 20,659,500 bytes before its broad dependency tree. Apache-2.0 is identified, but that does not constitute a review of all transitive licenses.
- Installation with scripts disabled succeeds on local Node 24.15.0, with an old Node 14 dependency warning and deprecated dependencies.
- The published entry point fails before execution: `crypto-api/src/crypto-api.mjs` imports an unresolved extensionless `./hasher/has160` module.
- Generic Node bundle fails with 30 errors including unresolved crypto-api imports and an unconfigured argon2 WASM asset loader. This is evidence against a drop-in integration, not proof it cannot be adapted.
- Therefore a CyberChef 1 MiB transform benchmark and recipe execution/worker tests could not honestly be reported. No fabricated timings or compatibility results are substituted. Runtime and packaging would require a maintained patch/build adapter, dependency/license review and a narrower tested operation surface.

## Native fallback and performance

The native adapter uses explicit text/bytes/JSON kinds and 17 operations, no production dependencies, and worker isolation. `npm run benchmark` measures 25 native and isolated worker Base64 decodes of 1 MiB decoded data. On Windows / i7-12700H / Node 24.15.0, initial p95 was about **3 ms engine-only**, **85 ms including worker startup**, cancellation through actual worker termination about **4 ms**. See [benchmark.json](../benchmark.json) for exact current results. These are one-machine measurements, not guarantees or UI render measurements. The real worker pipeline is also checked under the minimum VS Code 1.99 extension host; the reported timings are from development Node 24.

## Compatibility and risks

See [compatibility matrix](../cyberchef-compatibility.md). Power Tools import/export is its own version-1 schema; CyberChef `{op,args}` recipes are unsupported. No operation equivalence is assumed from similar display names. Native code reduces dependency/bundle scope but makes this project responsible for operation correctness. Golden vectors, malformed inputs, binary roundtrips, bounded decompression and cancellation are covered in tests.

Spike A: investigated, blocked by published runtime/packaging defects. Spike B: validated for native engine workers; CyberChef-in-worker blocked by Spike A. Spike C: format inspected, interchange deferred; no verified CyberChef bake/export roundtrip claim. A future CyberChef adapter must pass all three gates before replacing the native engine.
