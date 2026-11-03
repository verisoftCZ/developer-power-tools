import assert from 'node:assert/strict';
import { listFiles, PackageManager } from '@vscode/vsce';
const allowed = new Set([
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'dist/extension.cjs',
  'dist/worker.cjs',
  'dist/ui.js',
  'dist/ui.css',
  'resources/icon.png',
  'docs/operations.md',
  'docs/workbench.png',
  'docs/THIRD-PARTY-NOTICES.md',
]);
const files = (await listFiles({ packageManager: PackageManager.None })).map((file) =>
  file.replaceAll('\\', '/'),
);
for (const file of files) assert.ok(allowed.has(file), `Unexpected file in VSIX: ${file}`);
for (const file of allowed)
  assert.ok(files.includes(file), `Required file missing from VSIX: ${file}`);
console.log(
  `VSIX allowlist verified (${files.length} files; no tests, local reports, dependencies or source maps).`,
);
