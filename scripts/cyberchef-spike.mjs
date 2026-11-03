// Deliberately isolated investigation; CyberChef is never a shipped dependency.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import path from 'node:path';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(args, cwd = process.cwd()) {
  return execFileSync(npm, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
  });
}
mkdirSync('.spike', { recursive: true });
writeFileSync(
  '.spike/package.json',
  JSON.stringify({ private: true, dependencies: { cyberchef: '11.5.0' } }),
);
const report = {
  node: process.version,
  version: '11.5.0',
  date: new Date().toISOString(),
  metadata: JSON.parse(
    run([
      'view',
      'cyberchef@11.5.0',
      'version',
      'main',
      'exports',
      'engines',
      'license',
      'dist.unpackedSize',
      'dist.integrity',
      '--json',
    ]),
  ),
};
try {
  run(['install', '--ignore-scripts', '--no-audit', '--no-fund'], path.resolve('.spike'));
  report.install = 'pass';
} catch (error) {
  report.install = 'failed';
  report.installError = String(error.stderr ?? error.message).slice(-5000);
}
try {
  const require = createRequire(path.resolve('.spike/probe.cjs'));
  const chef = await require('cyberchef');
  const input = Buffer.from(JSON.stringify({ sample: 'A'.repeat(1024 * 1024) })).toString('base64');
  const start = performance.now();
  const result = await chef.bake(input, [
    { op: 'From Base64', args: ['A-Za-z0-9+/=', true, false] },
    { op: 'JSON Beautify', args: ['    ', false, true] },
  ]);
  report.runtime = {
    passed: true,
    elapsedMs: performance.now() - start,
    outputType: typeof result,
  };
} catch (error) {
  report.runtime = { passed: false, error: error.message };
}
try {
  const require = createRequire(path.resolve('.spike/probe.cjs'));
  const result = await build({
    entryPoints: [require.resolve('cyberchef')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    write: false,
    logLevel: 'silent',
  });
  report.bundle = { passed: true, bytes: result.outputFiles[0].contents.length };
} catch (error) {
  report.bundle = { passed: false, error: error.message.slice(0, 5000) };
}
const output = JSON.stringify(
  report,
  (_key, value) =>
    typeof value === 'string' ? value.replaceAll(process.cwd(), '<repository>') : value,
  2,
);
writeFileSync('docs/cyberchef-spike.json', output);
console.log(output);
