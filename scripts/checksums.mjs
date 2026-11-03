import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const file = `${pkg.name}-${pkg.version}.vsix`;
const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
writeFileSync('SHA256SUMS', `${hash}  ${file}\n`);
console.log(`SHA-256 checksum written for ${file}.`);
