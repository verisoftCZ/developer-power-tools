import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const repository = 'https://github.com/verisoftCZ/developer-power-tools';
assert.equal(pkg.publisher, 'verisoftcz', 'Marketplace publisher must be verisoftcz.');
assert.equal(pkg.repository.url, repository + '.git');
assert.equal(pkg.bugs.url, repository + '/issues');
assert.equal(pkg.homepage, repository + '#readme');
assert.equal(pkg.license, 'MIT');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.ok(
  readFileSync('CHANGELOG.md', 'utf8').includes(`## ${pkg.version}`),
  'Add a changelog entry.',
);
assert.ok(existsSync(pkg.icon), 'Committed PNG icon is required.');
assert.equal(readFileSync(pkg.icon).subarray(1, 4).toString(), 'PNG');
assert.ok(!readFileSync('README.md', 'utf8').includes('local-dev-tools'));
const tag = process.env.RELEASE_TAG;
if (tag) assert.equal(tag, `v${pkg.version}`, 'Tag must match the committed package version.');
console.log(`Release metadata valid: ${pkg.publisher}.${pkg.name}@${pkg.version}`);
