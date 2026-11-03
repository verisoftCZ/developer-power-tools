import { runTests } from '@vscode/test-electron';
import path from 'node:path';
const executable = process.env.VSCODE_EXECUTABLE;
await runTests({
  extensionDevelopmentPath: path.resolve('.'),
  extensionTestsPath: path.resolve('dist/integration.cjs'),
  ...(executable ? { vscodeExecutablePath: executable } : {}),
  ...(process.env.VSCODE_TEST_VERSION ? { version: process.env.VSCODE_TEST_VERSION } : {}),
  launchArgs: [
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--user-data-dir=' + path.resolve('.vscode-test/profile'),
  ],
});
