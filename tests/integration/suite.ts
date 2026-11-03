import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { captureSelection, replaceOriginal } from '../../src/extension/selection';
import { WorkerRunner } from '../../src/core/engine/runner';
import { textValue } from '../../src/core/types';
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('verisoftcz.developer-power-tools');
  assert.ok(extension);
  await extension.activate();
  const commands = await vscode.commands.getCommands();
  for (const name of ['powertools.open', 'powertools.openSelection', 'powertools.replaceSelection'])
    assert.ok(commands.includes(name));
  const runner = new WorkerRunner(
    vscode.Uri.joinPath(extension.extensionUri, 'dist', 'worker.cjs').fsPath,
  );
  const result = await runner.run(
    {
      schemaVersion: 1,
      id: 'integration',
      name: 'Extension host engine',
      steps: ['base64.decode', 'bytes.text', 'json.parse'].map((operationId, i) => ({
        id: String(i),
        operationId,
        enabled: true,
        params: {},
      })),
    },
    textValue('eyJvayI6dHJ1ZX0='),
    1024,
    10000,
  );
  assert.deepEqual(result.output, { kind: 'json', value: { ok: true } });
  runner.cancel();
  const runOperation = async (
    operationId: string,
    input: string,
    params: Record<string, unknown> = {},
  ) =>
    (
      await runner.run(
        {
          schemaVersion: 1,
          id: 'new-operations',
          name: 'New operation smoke',
          steps: [{ id: 'step', operationId, enabled: true, params }],
        },
        textValue(input),
        1024,
        10000,
      )
    ).output;
  const encoded = await runOperation('text.base64', 'Žofie 🌍');
  assert.deepEqual(
    await runOperation('base64.text', encoded.value as string),
    textValue('Žofie 🌍'),
  );
  const mixed = { Metadata: '{"a":{}}', Other: { x: 'value' }, Data: '{"name":"Žofie"}' };
  const decoded = await runOperation('json.decodeFields', JSON.stringify(mixed));
  assert.deepEqual(decoded.value, {
    Metadata: { a: {} },
    Other: { x: 'value' },
    Data: { name: 'Žofie' },
  });
  assert.deepEqual(
    JSON.parse(
      (
        await runOperation('json.escape', JSON.stringify(decoded.value), {
          mode: 'selected fields',
          paths: '/Metadata, /Data',
        })
      ).value as string,
    ),
    mixed,
  );
  assert.match((await runOperation('guid.generate', '')).value as string, /^[0-9a-f-]{36}$/);
  assert.equal(
    (await runOperation('date.convert', '2025-08-19T10:00:00Z')).value,
    '19.08.2025 12:00:00',
  );
  const yaml = await runOperation('json.yaml', '{"name":"Žofie","enabled":true}');
  assert.deepEqual((await runOperation('yaml.json', yaml.value as string)).value, {
    name: 'Žofie',
    enabled: true,
  });
  const jwtPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.equal(
    (
      (
        await runOperation(
          'jwt.inspect',
          `Bearer ${jwtPart({ alg: 'none' })}.${jwtPart({ sub: 'example' })}.`,
        )
      ).value as any
    ).signatureVerified,
    false,
  );
  const doc = await vscode.workspace.openTextDocument({
    content: 'before SELECT after',
    language: 'plaintext',
  });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(0, 7, 0, 13);
  const snapshot = captureSelection(editor);
  assert.equal(snapshot.text, 'SELECT');
  await replaceOriginal(snapshot, 'changed');
  assert.equal(doc.getText(), 'before changed after');
  await assert.rejects(replaceOriginal(snapshot, 'bad'), /changed/);
  editor.selection = new vscode.Selection(0, 7, 0, 14);
  await vscode.commands.executeCommand('powertools.openSelection');
  await vscode.commands.executeCommand('powertools.open');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  console.log(
    `Power Tools integration: command activation, actual worker pipeline, selection transfer/replacement, stale version protection and panel lifecycle passed on Node ${process.version}.`,
  );
}
