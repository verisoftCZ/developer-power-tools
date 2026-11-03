import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const files = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md'];
for (const file of readdirSync('docs', { recursive: true })) {
  if (String(file).endsWith('.md')) files.push(path.join('docs', String(file)));
}
let links = 0;
for (const file of files) {
  for (const match of readFileSync(file, 'utf8').matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    assert.ok(
      existsSync(path.resolve(path.dirname(file), target)),
      `Broken link in ${file}: ${target}`,
    );
    links++;
  }
}
console.log(`Documentation links verified (${links} local targets).`);
