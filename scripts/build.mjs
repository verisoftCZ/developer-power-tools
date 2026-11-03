import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const [entry, name] of [
  ['src/extension/extension.ts', 'extension'],
  ['src/core/workers/worker.ts', 'worker'],
  ['tests/integration/suite.ts', 'integration'],
]) {
  await build({
    entryPoints: [entry],
    outfile: `dist/${name}.cjs`,
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['vscode'],
    sourcemap: true,
  });
}
await build({
  entryPoints: ['src/ui/main.ts'],
  outfile: 'dist/ui.js',
  bundle: true,
  platform: 'browser',
  target: 'es2022',
});
await copyFile('src/ui/styles.css', 'dist/ui.css');
