import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { documentHtml } from '../../src/extension/webview/document';
import { definitions } from '../../src/core/operations/registry';
import { WorkerRunner } from '../../src/core/engine/runner';
import { outputText, textValue, valueSize } from '../../src/core/types';
test.beforeEach(async ({ page }) => {
  const runner = new WorkerRunner(path.resolve('dist/worker.cjs'));
  await page.exposeFunction('host', async (message: any) => {
    const send = async (type: string, payload: unknown) => {
      await page.evaluate((m) => window.postMessage(m, '*'), {
        protocolVersion: 1,
        requestId: message.requestId,
        type,
        payload,
      });
    };
    if (message.type === 'ready')
      await send('init', { operations: definitions, graphNodeLimit: 300, input: '' });
    if (message.type === 'cancelRun') runner.cancel();
    if (message.type === 'runRecipe') {
      await send('runStarted', {});
      try {
        const r = await runner.run(
          message.payload.recipe,
          textValue(message.payload.input),
          10 * 1024 * 1024,
          10000,
        );
        const full =
          r.output.kind === 'bytes'
            ? Buffer.from(r.output.value).toString('hex')
            : outputText(r.output);
        await send('runCompleted', {
          kind: r.output.kind,
          value: full.slice(0, 262144),
          truncated: full.length > 262144,
          size: valueSize(r.output),
          durationMs: r.durationMs,
          steps: r.steps,
        });
      } catch (error) {
        await send('runFailed', {
          message: (error as Error).message,
          stepId: (error as any).stepId,
        });
      }
    }
  });
  await page.addInitScript(() => {
    (window as any).acquireVsCodeApi = () => ({
      getState: () => undefined,
      setState: (v: unknown) => {
        (window as any).savedState = v;
      },
      postMessage: (v: unknown) => void (window as any).host(v),
    });
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://powertools.test') {
      await route.abort();
      return;
    }
    if (url.pathname === '/')
      await route.fulfill({
        contentType: 'text/html',
        body: documentHtml(
          'https://powertools.test/ui.js',
          'https://powertools.test/ui.css',
          "'self'",
          'testnonce',
        ),
      });
    else if (['/ui.js', '/ui.css'].includes(url.pathname))
      await route.fulfill({
        contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
        body: readFileSync(`dist${url.pathname}`),
      });
    else await route.abort();
  });
  await page.goto('https://powertools.test');
  await expect(page.locator('#operations .operation')).toHaveCount(definitions.length);
});
test('example chain, tree search, graph collapse, and screenshot', async ({ page }) => {
  await page.getByRole('button', { name: 'Load example', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('#viewer')).toContainText('Ada');
  await page.getByRole('tab', { name: 'JSON tree' }).click();
  await expect(page.locator('.tree')).toContainText('id: 42');
  await page.getByRole('searchbox', { name: 'Search output' }).fill('admin');
  await expect(page.locator('.tree .match')).toContainText('admin');
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(8);
  await page.locator('.graph-node').first().click();
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await page.locator('.graph-node').first().press('Enter');
  await expect(page.locator('.graph-node')).toHaveCount(8);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.screenshot({ path: 'docs/workbench.png', fullPage: true });
});
test('step error, edit invalidation and keyboard run', async ({ page }) => {
  await page.locator('#input').fill('@@');
  await page.locator('#search').fill('From Base64');
  await page.locator('.operation').click();
  await page.locator('#input').press('Control+Enter');
  await expect(page.locator('#status')).toContainText('Invalid Base64');
  await page.locator('#input').fill('YQ==');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('#copy')).toBeDisabled();
  await page.getByRole('tab', { name: 'Hex', exact: true }).click();
  await expect(page.locator('#viewer')).toContainText('61');
  await page.locator('#input').fill('Yg==');
  await expect(page.locator('#output-kind')).toHaveText('CHANGED');
  await expect(page.locator('#replace')).toBeDisabled();
});
test('JSON Unescape is discoverable and chains into structured JSON inspection', async ({
  page,
}) => {
  await page.locator('#input').fill(String.raw`{\"message\":\"Hello\\nworld\",\"id\":42}`);
  await page.locator('#search').fill('JSON Unescape');
  await page.locator('.operation').click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('#output-kind')).toHaveText('TEXT');
  await expect(page.locator('#viewer')).toContainText(
    String.raw`{"message":"Hello\nworld","id":42}`,
  );
  await page.locator('#search').fill('JSON Parse');
  await page.getByRole('button', { name: 'JSON Parse JSON · text → json +', exact: true }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await page.getByRole('tab', { name: 'JSON tree' }).click();
  await expect(page.locator('.tree')).toContainText('id: 42');
});
test('one-step Base64 text operations compose without byte conversion cards', async ({ page }) => {
  const original = 'Hello Žofie 🌍';
  await page.locator('#input').fill(original);
  await page.locator('#search').fill('Text → Base64');
  await page.getByRole('button', { name: /^Text → Base64 / }).click();
  await page.locator('#search').fill('Base64 → Text');
  await page.getByRole('button', { name: /^Base64 → Text / }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('.output-text')).toHaveText(original);
});
test('mixed escaped JSON fields decode and selectively re-encode in the workbench', async ({
  page,
}) => {
  const mixed = {
    Metadata: '{"OsobniUdaje":{}}',
    SomeOtherNotEscapedData: { x: 'value' },
    Data: '{"name":"Žofie","date":"19.08.2025","id":"001234"}',
  };
  await page.locator('#input').fill(JSON.stringify(mixed));
  await page.locator('#search').fill('Decode Escaped JSON Fields');
  await page.getByRole('button', { name: /^Decode Escaped JSON Fields / }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('#output-kind')).toHaveText('JSON');
  const decoded = JSON.parse(await page.locator('.output-text').innerText());
  expect(decoded.Metadata).toEqual({ OsobniUdaje: {} });
  expect(decoded.Data).toEqual(JSON.parse(mixed.Data));
  expect(decoded.SomeOtherNotEscapedData).toEqual(mixed.SomeOtherNotEscapedData);
  await page.locator('#search').fill('JSON → Escaped JSON');
  await page.getByRole('button', { name: /^JSON → Escaped JSON / }).click();
  await page
    .getByLabel('JSON → Escaped JSON: Mode', { exact: true })
    .selectOption('selected fields');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  expect(JSON.parse(await page.locator('.output-text').innerText())).toEqual(mixed);
});
test('GUID generation works on empty input and dates expose source and output zones', async ({
  page,
}) => {
  await page.locator('#search').fill('Generate GUID');
  await page.getByRole('button', { name: /^Generate GUID / }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  expect(await page.locator('.output-text').innerText()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  await page.locator('#new').click();
  await page.locator('#input').fill('19.08.2025 12:00');
  await page.locator('#search').fill('Date → UTC');
  await page.getByRole('button', { name: /^Date → UTC \/ Timezone / }).click();
  await page
    .getByLabel('Date → UTC / Timezone: Source timezone (if no offset)', { exact: true })
    .fill('Europe/Prague');
  await expect(
    page.getByLabel('Date → UTC / Timezone: Output timezone', { exact: true }),
  ).toHaveValue('Europe/Prague');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('.output-text')).toHaveText('19.08.2025 12:00:00');
  await page
    .getByLabel('Date → UTC / Timezone: Output timezone', { exact: true })
    .fill('America/New_York');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('.output-text')).toHaveText('19.08.2025 06:00:00');
  await page
    .getByLabel('Date → UTC / Timezone: Output format', { exact: true })
    .selectOption('ISO 8601');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('.output-text')).toHaveText('2025-08-19T06:00:00.000-04:00');
});
test('YAML output renders directly as tree and zoomable graph and converts back to JSON', async ({
  page,
}) => {
  const value = { name: 'Žofie', items: [1, true, null], settings: { active: true } };
  await page.locator('#input').fill(JSON.stringify(value));
  await page.locator('#search').fill('JSON → YAML');
  await page.getByRole('button', { name: /^JSON → YAML / }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('.output-text')).toContainText('name: Žofie');
  await page.getByRole('tab', { name: 'JSON tree' }).click();
  await expect(page.locator('.tree')).toContainText('name: "Žofie"');
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(8);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('100%');
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#search').fill('YAML → JSON');
  await page.getByRole('button', { name: /^YAML → JSON / }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  expect(JSON.parse(await page.locator('.output-text').innerText())).toEqual(value);
});
test('pasted YAML can use the graph without a conversion recipe; unsupported tags are inert', async ({
  page,
}) => {
  await page.locator('#input').fill('root:\n  name: example\n  active: true');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(4);
  await page.locator('#input').fill('a: !custom value');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('#viewer')).toContainText('unsupported YAML');
});
test('JWT Inspect accepts an authorization Bearer token in the UI', async ({ page }) => {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  await page
    .locator('#input')
    .fill(`Bearer ${encode({ alg: 'none' })}.${encode({ sub: 'example' })}.`);
  await page.locator('#search').fill('JWT Inspect');
  await page.getByRole('button', { name: /^JWT Inspect / }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  const result = JSON.parse(await page.locator('.output-text').innerText());
  expect(result.payload.sub).toBe('example');
  expect(result.signatureVerified).toBe(false);
});
test('disable, reorder and remove steps using accessible controls', async ({ page }) => {
  await page.locator('#example').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await page.getByRole('checkbox', { name: 'Enable step 3' }).uncheck();
  await page.locator('#run').click();
  await expect(page.locator('#output-kind')).toHaveText('TEXT');
  await page.getByRole('button', { name: 'Move up: step 3', exact: true }).click();
  await expect(page.locator('#steps .step').nth(1)).toContainText('JSON Parse');
  await page.getByRole('button', { name: 'Remove step 2', exact: true }).click();
  await expect(page.locator('#steps .step')).toHaveCount(2);
});
test('untrusted markup remains inert and persisted state excludes inputs', async ({ page }) => {
  const payload = '<img src=x onerror="window.injected=true"><script>window.injected=true</script>';
  await page.locator('#input').fill(payload);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await expect(page.locator('#viewer img,#viewer script')).toHaveCount(0);
  await expect(page.locator('#viewer')).toContainText(payload);
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await page.locator('#recipe-name').fill('Saved recipe');
  await page.locator('#recipe-name').blur();
  const state = await page.evaluate(() => (window as any).savedState);
  expect(state.recipe.name).toBe('Saved recipe');
  expect(JSON.stringify(state)).not.toContain(payload);
  expect(state.input).toBeUndefined();
});
test('graph cap fallback and bounded tree', async ({ page }) => {
  await page.locator('#input').fill(JSON.stringify(Array.from({ length: 1600 }, (_, i) => i)));
  await page.locator('#search').fill('JSON Parse');
  await page.getByRole('button', { name: 'JSON Parse JSON · text → json +', exact: true }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await expect(page.locator('#viewer')).toContainText('Graph exceeds 300 nodes');
  await expect(page.locator('#viewer')).toContainText('Tree limited');
  expect(await page.locator('.tree-leaf').count()).toBeLessThan(1500);
});
test('Ctrl + wheel zooms both ways at the pointer without changing ordinary scrolling', async ({
  page,
}) => {
  await page.locator('#example').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  const graph = page.locator('svg.graph');
  const box = (await graph.boundingBox())!;
  const pointer = {
    x: Math.floor(box.x + box.width * 0.4),
    y: Math.floor(box.y + box.height * 0.4),
  };
  const camera = () =>
    graph.evaluate((svg: SVGSVGElement, p) => {
      const point = svg.createSVGPoint();
      point.x = p.x;
      point.y = p.y;
      const matrix = svg.getScreenCTM()!;
      const world = point.matrixTransform(matrix.inverse());
      return { scale: matrix.a, x: world.x, y: world.y };
    }, pointer);
  const before = await camera();
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await camera()).scale).toBeGreaterThan(before.scale);
  const enlarged = await camera();
  expect(enlarged.x).toBeCloseTo(before.x, 3);
  expect(enlarged.y).toBeCloseTo(before.y, 3);
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => (await camera()).scale).toBeCloseTo(before.scale, 4);
  await page.keyboard.up('Control');
  const ordinary = await graph.evaluate((svg) => {
    const e = new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true });
    svg.dispatchEvent(e);
    return { prevented: e.defaultPrevented, scale: (svg as SVGSVGElement).getScreenCTM()!.a };
  });
  expect(ordinary.prevented).toBe(false);
  expect(ordinary.scale).toBeCloseTo(before.scale, 4);
});
test('large graphs have absolute readable zoom, 1600% maximum and a working Fit reset', async ({
  page,
}) => {
  await page
    .locator('#input')
    .fill(JSON.stringify(Array.from({ length: 120 }, (_, i) => ({ id: i }))));
  await page.locator('#search').fill('JSON Parse');
  await page.getByRole('button', { name: 'JSON Parse JSON · text → json +', exact: true }).click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Recipe complete.');
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  const graph = page.locator('svg.graph');
  await expect(page.locator('.graph-node')).toHaveCount(241);
  const scale = () => graph.evaluate((svg: SVGSVGElement) => svg.getScreenCTM()!.a);
  const fit = await scale();
  expect(fit).toBeLessThan(0.1);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  expect(await scale()).toBeCloseTo(1, 4);
  for (let i = 0; i < 14; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await scale()).toBeCloseTo(16, 4);
  await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('1600%');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  expect(await scale()).toBeCloseTo(fit, 4);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  const offset = () =>
    graph.evaluate((svg: SVGSVGElement) => ({
      x: svg.viewBox.baseVal.x,
      y: svg.viewBox.baseVal.y,
    }));
  const panStart = await offset();
  const bounds = (await graph.boundingBox())!;
  await page.mouse.move(bounds.x + 4, bounds.y + 4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 64, bounds.y + 44);
  await page.mouse.up();
  const panEnd = await offset();
  expect(panEnd.x).toBeCloseTo(panStart.x - 60, 3);
  expect(panEnd.y).toBeCloseTo(panStart.y - 40, 3);
  const before = await graph.getAttribute('viewBox');
  await page.locator('#split-two').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => graph.getAttribute('viewBox')).not.toEqual(before);
  expect(await scale()).toBeCloseTo(1, 4);
});
test('responsive stacking and light theme', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  const input = await page.locator('.input-column').boundingBox();
  const recipe = await page.locator('.recipe-column').boundingBox();
  expect(recipe!.y).toBeGreaterThan(input!.y + input!.height);
  await page.evaluate(() => {
    const tokens = {
      'editor-background': '#ffffff',
      foreground: '#222222',
      'sideBar-background': '#f4f4f4',
      'input-background': '#ffffff',
      'input-foreground': '#222222',
      'input-border': '#cccccc',
      'panel-border': '#cccccc',
      descriptionForeground: '#666666',
      'button-secondaryBackground': '#e4e4e4',
      'button-secondaryForeground': '#333333',
      'button-secondaryHoverBackground': '#dddddd',
      'button-background': '#007a85',
      'button-foreground': '#ffffff',
      'textLink-foreground': '#007a85',
      'badge-background': '#e0e0e0',
      'badge-foreground': '#333333',
      'tab-activeBackground': '#e0e0e0',
    };
    for (const [k, v] of Object.entries(tokens))
      document.documentElement.style.setProperty(`--vscode-${k}`, v);
  });
  await page.screenshot({ path: 'docs/workbench-narrow.png', fullPage: true });
});
