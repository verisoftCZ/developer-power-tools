import type { OperationDefinition, Recipe, RecipeStep } from '../core/types';
import { yamlToJson } from '../core/operations/yaml';
declare function acquireVsCodeApi(): {
  postMessage(value: unknown): void;
  getState(): { recipe?: Recipe } | undefined;
  setState(value: unknown): void;
};
const api = acquireVsCodeApi();
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
const app = $('app');
app.innerHTML = `
<header><div class="brand"><span class="brand-icon">⌘</span><div><strong>Developer Power Tools</strong><small>LOCAL WORKBENCH</small></div></div><div class="privacy"><span class="dot"></span> Offline · private by default</div></header>
<nav aria-label="Workbench actions"><button id="new">New</button><button id="selection">Open selection</button><span class="divider"></span><button id="recipes">Recipes</button><button id="save">Save recipe</button><button id="import">Import</button><button id="export">Export</button><span class="spacer"></span><label class="toggle"><input id="auto" type="checkbox">Auto-run</label><button id="run" class="primary">▶ Run <kbd>Ctrl ↵</kbd></button><button id="cancel" disabled>Cancel</button></nav>
<main id="columns">
<section class="column input-column" aria-labelledby="input-title"><div class="section-head"><h2 id="input-title"><span>01</span> Input</h2><span class="tag">UTF-8 TEXT</span></div><div class="subbar"><span>Source text</span><button id="example">Load example</button></div><textarea id="input" aria-label="Input text" spellcheck="false" placeholder="Paste data here, or open a selection from your editor…"></textarea><footer><span id="input-size">0 bytes</span><span>Never saved</span></footer></section>
<div class="splitter" role="separator" aria-label="Resize input column" aria-orientation="vertical" tabindex="0" id="split-one"></div>
<section class="column recipe-column" aria-labelledby="recipe-title"><div class="section-head"><h2 id="recipe-title"><span>02</span> Recipe</h2><span id="step-count" class="tag">0 STEPS</span></div><input id="recipe-name" aria-label="Recipe name" value="Untitled recipe" maxlength="128"><div id="steps"></div><div class="operation-picker"><label for="search">ADD AN OPERATION</label><input id="search" type="search" placeholder="Search operations…"><div id="operations"></div></div><footer><span>Runs from top to bottom</span><span id="engine">Native engine</span></footer></section>
<div class="splitter" role="separator" aria-label="Resize output column" aria-orientation="vertical" tabindex="0" id="split-two"></div>
<section class="column output-column" aria-labelledby="output-title"><div class="section-head"><h2 id="output-title"><span>03</span> Output</h2><span id="output-kind" class="tag">READY</span></div><div class="subbar tabs" role="tablist" aria-label="Output viewer"><button role="tab" id="tab-text" aria-selected="true">Text</button><button role="tab" id="tab-tree" aria-selected="false">JSON tree</button><button role="tab" id="tab-graph" aria-selected="false">Graph</button><button role="tab" id="tab-hex" aria-selected="false">Hex</button></div><div class="output-actions"><button id="copy" disabled>Copy output</button><button id="replace" disabled>Replace selection</button><span class="spacer"></span><input id="output-search" type="search" aria-label="Search output" placeholder="Find…"></div><div id="viewer" role="tabpanel" tabindex="0"><div class="empty"><div class="empty-icon">↗</div><h3>A clearer view of your data</h3><p>Add operations to a recipe, then run.<br>Start with an example to explore the workbench.</p><button id="empty-example">Try Base64 → JSON</button></div></div><footer><span id="output-size">No output yet</span><span id="elapsed">—</span></footer></section>
</main><div id="status" role="status" aria-live="polite">Ready. All transformations run locally.</div>`;
let operations: OperationDefinition[] = [];
let recipe: Recipe = api.getState()?.recipe ?? {
  schemaVersion: 1,
  id: crypto.randomUUID(),
  name: 'Untitled recipe',
  steps: [],
};
let requestCounter = 0;
let active = '';
let running = false;
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let output:
  { kind: string; value: string; truncated: boolean; size: number; durationMs: number } | undefined;
let tab = 'text';
let graphLimit = 300;
let disposeViewer = () => {};
const input = $<HTMLTextAreaElement>('input');
function send(type: string, payload: unknown = {}, requestId = `q-${++requestCounter}`): string {
  api.postMessage({ protocolVersion: 1, requestId, type, payload });
  return requestId;
}
function status(message: string, error = false): void {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function persist(): void {
  api.setState({ recipe });
}
function size(n: number): string {
  return n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KiB`;
}
function busy(value: boolean): void {
  running = value;
  $<HTMLButtonElement>('cancel').disabled = !value;
  $('run').textContent = value ? '↻ Run again' : '▶ Run';
}
function invalidate(): void {
  disposeViewer();
  disposeViewer = () => {};
  output = undefined;
  active = '';
  send('cancelRun');
  if (running) busy(false);
  $<HTMLButtonElement>('copy').disabled = true;
  $<HTMLButtonElement>('replace').disabled = true;
  $('output-kind').textContent = 'CHANGED';
  $('output-size').textContent = 'Run to update output';
  $('viewer').replaceChildren(
    el('p', 'Input or recipe changed. Run to inspect the new output.', 'viewer-hint'),
  );
  clearTimeout(autoTimer);
  if ($<HTMLInputElement>('auto').checked) {
    if (new TextEncoder().encode(input.value).length <= 65536) autoTimer = setTimeout(run, 400);
    else status('Auto-run pauses above 64 KiB. Use Run for this input.');
  }
}
function changed(): void {
  persist();
  invalidate();
}
function run(): void {
  clearTimeout(autoTimer);
  output = undefined;
  renderSteps();
  $<HTMLButtonElement>('copy').disabled = true;
  $<HTMLButtonElement>('replace').disabled = true;
  active = `run-${++requestCounter}`;
  busy(true);
  status('Running recipe in an isolated worker…');
  send('runRecipe', { recipe, input: input.value }, active);
}
function addOperation(operation: OperationDefinition): void {
  recipe.steps.push({
    id: crypto.randomUUID(),
    operationId: operation.id,
    enabled: true,
    params: Object.fromEntries(operation.parameters.map((p) => [p.key, p.default])),
  });
  renderSteps();
  changed();
}
function renderOperations(): void {
  const query = $<HTMLInputElement>('search').value.toLowerCase();
  const list = $('operations');
  list.replaceChildren();
  for (const op of operations.filter((x) =>
    `${x.displayName} ${x.category} ${x.description}`.toLowerCase().includes(query),
  )) {
    const button = el('button', '', 'operation');
    button.title = op.description;
    button.append(
      el('span', op.displayName),
      el('small', `${op.category} · ${op.inputKinds.join('/')} → ${op.outputKind}`),
      el('span', '+', 'plus'),
    );
    button.onclick = () => addOperation(op);
    list.append(button);
  }
  if (!list.children.length) list.append(el('p', 'No matching operations.', 'viewer-hint'));
}
let dragged = '';
function renderSteps(): void {
  const list = $('steps');
  list.replaceChildren();
  $('step-count').textContent = `${recipe.steps.length} STEPS`;
  $<HTMLInputElement>('recipe-name').value = recipe.name;
  if (!recipe.steps.length)
    list.append(el('div', 'Your recipe starts here. Choose an operation below.', 'recipe-empty'));
  recipe.steps.forEach((step, index) => {
    const op = operations.find((o) => o.id === step.operationId);
    const card = el('article', '', `step${step.enabled ? '' : ' disabled'}`);
    card.dataset.step = step.id;
    card.draggable = true;
    card.ondragstart = (event) => {
      if ((event.target as HTMLElement).matches('input,select')) {
        event.preventDefault();
        return;
      }
      dragged = step.id;
      event.dataTransfer?.setData('text/plain', step.id);
    };
    card.ondragover = (event) => event.preventDefault();
    card.ondrop = (event) => {
      event.preventDefault();
      const from = recipe.steps.findIndex((s) => s.id === dragged);
      if (from < 0) return;
      recipe.steps.splice(index, 0, ...recipe.steps.splice(from, 1));
      renderSteps();
      changed();
    };
    const head = el('div', '', 'step-head');
    head.append(el('span', String(index + 1).padStart(2, '0'), 'step-number'));
    const enabled = el('input');
    enabled.type = 'checkbox';
    enabled.checked = step.enabled;
    enabled.setAttribute('aria-label', `Enable step ${index + 1}`);
    enabled.onchange = () => {
      step.enabled = enabled.checked;
      renderSteps();
      changed();
    };
    head.append(enabled, el('strong', op?.displayName ?? `Unsupported: ${step.operationId}`));
    for (const [label, delta] of [
      ['Move up', -1],
      ['Move down', 1],
    ] as const) {
      const b = el('button', delta < 0 ? '↑' : '↓', 'icon-button');
      b.title = label;
      b.setAttribute('aria-label', `${label}: step ${index + 1}`);
      b.disabled = index + delta < 0 || index + delta >= recipe.steps.length;
      b.onclick = () => {
        [recipe.steps[index], recipe.steps[index + delta]] = [
          recipe.steps[index + delta],
          recipe.steps[index],
        ];
        renderSteps();
        changed();
      };
      head.append(b);
    }
    const remove = el('button', '×', 'icon-button');
    remove.setAttribute('aria-label', `Remove step ${index + 1}`);
    remove.onclick = () => {
      recipe.steps.splice(index, 1);
      renderSteps();
      changed();
    };
    head.append(remove);
    card.append(head);
    for (const param of op?.parameters ?? []) {
      const label = el('label', param.label, 'parameter');
      const control = param.type === 'select' ? el('select') : el('input');
      if (control instanceof HTMLSelectElement)
        for (const option of param.options ?? []) {
          const item = el('option', option);
          item.value = option;
          control.append(item);
        }
      else {
        control.type =
          param.type === 'boolean' ? 'checkbox' : param.type === 'number' ? 'number' : 'text';
        if (param.min !== undefined) control.min = String(param.min);
        if (param.max !== undefined) control.max = String(param.max);
      }
      if (control instanceof HTMLInputElement && control.type === 'checkbox')
        control.checked = Boolean(step.params[param.key] ?? param.default);
      else control.value = String(step.params[param.key] ?? param.default);
      control.setAttribute('aria-label', `${op?.displayName}: ${param.label}`);
      control.onchange = () => {
        step.params[param.key] =
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? control.checked
            : param.type === 'number'
              ? Number(control.value)
              : control.value;
        changed();
      };
      label.append(control);
      card.append(label);
    }
    card.append(
      el(
        'small',
        op?.description ?? 'This operation is preserved but cannot run in this version.',
        'step-description',
      ),
      el('div', '', 'step-status'),
    );
    list.append(card);
  });
}
function jsonOutput(): unknown {
  if (!output || output.kind === 'bytes' || output.truncated)
    throw new Error('JSON/YAML inspection requires a complete text or JSON result.');
  try {
    return JSON.parse(output.value);
  } catch (error) {
    if (output.kind === 'json') throw error;
    return yamlToJson(output.value, 1024 * 1024);
  }
}
function treeView(value: unknown, query: string): HTMLElement {
  const container = el('div', '', 'tree');
  const controls = el('div', '', 'viewer-controls');
  const expand = el('button', 'Expand visible');
  const collapse = el('button', 'Collapse all');
  controls.append(expand, collapse);
  container.append(controls);
  let count = 0;
  let limited = false;
  function node(key: string, v: unknown, depth: number): HTMLElement {
    if (++count > 1500 || depth > 32) {
      limited = true;
      return el('div', '… view limit reached', 'muted');
    }
    if (v !== null && typeof v === 'object') {
      const details = el('details');
      details.open = depth < 2 || !!query;
      const entries = Object.entries(v);
      details.append(
        el('summary', `${key} ${Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`}`),
      );
      for (const [k, child] of entries) {
        if (count >= 1500) {
          limited = true;
          break;
        }
        details.append(node(k, child, depth + 1));
      }
      return details;
    }
    const line = el('div', `${key}: ${JSON.stringify(v)}`, 'tree-leaf');
    if (query && line.textContent!.toLowerCase().includes(query)) line.classList.add('match');
    return line;
  }
  container.append(node('root', value, 0));
  if (limited)
    container.append(
      el(
        'p',
        'Tree limited to 1,500 values / 32 levels. Refine the recipe to inspect a smaller subtree.',
        'warning',
      ),
    );
  expand.onclick = () => container.querySelectorAll('details').forEach((d) => (d.open = true));
  collapse.onclick = () => container.querySelectorAll('details').forEach((d) => (d.open = false));
  return container;
}
function graphView(value: unknown, query: string): HTMLElement {
  type N = { id: string; label: string; value: unknown; depth: number; parent: number };
  const wrapper = el('div', '', 'graph-wrapper');
  const tools = el('div', '', 'viewer-controls');
  const surface = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  surface.setAttribute('class', 'graph');
  surface.setAttribute(
    'aria-label',
    'JSON graph. Ctrl or Cmd plus mouse wheel to zoom; drag background to pan; activate nodes to collapse.',
  );
  surface.setAttribute('role', 'img');
  const collapsed = new Set<string>();
  let nodes: N[] = [];
  let zoom = 1,
    offsetX = 0,
    offsetY = 0;
  let total = 0;
  let fitting = true;
  // Count before rendering; avoid constructing a graph beyond the cap.
  const stack = [value];
  while (stack.length && total <= graphLimit) {
    const v = stack.pop();
    total++;
    if (v && typeof v === 'object')
      for (const c of Object.values(v)) {
        stack.push(c);
        if (stack.length > graphLimit) break;
      }
  }
  if (total > graphLimit || stack.length) {
    wrapper.append(
      el(
        'p',
        `Graph exceeds ${graphLimit} nodes. Showing the bounded JSON tree instead.`,
        'warning',
      ),
      treeView(value, query),
    );
    return wrapper;
  }
  function flatten(v: unknown, key: string, id: string, depth: number, parent: number): void {
    const index = nodes.length;
    nodes.push({
      id,
      label: `${key}${v && typeof v === 'object' ? (Array.isArray(v) ? ' [ ]' : ' { }') : `: ${JSON.stringify(v)}`}`,
      value: v,
      depth,
      parent,
    });
    if (!collapsed.has(id) && v && typeof v === 'object')
      for (const [k, c] of Object.entries(v))
        flatten(c, k, `${id}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`, depth + 1, index);
  }
  let contentWidth = 800,
    contentHeight = 400;
  const percentage = el('span', '', 'graph-zoom');
  percentage.setAttribute('aria-label', 'Graph zoom');
  const viewport = () => {
    const rect = surface.getBoundingClientRect();
    return { width: rect.width || 800, height: rect.height || 400 };
  };
  const fitScale = () => {
    const { width, height } = viewport();
    return Math.min(1, width / contentWidth, height / contentHeight);
  };
  function view(): void {
    const { width, height } = viewport();
    // Scale is absolute: 100% means one graph unit per CSS pixel, independent of graph size.
    surface.setAttribute('viewBox', `${offsetX} ${offsetY} ${width / zoom} ${height / zoom}`);
    percentage.textContent = `${Math.round(zoom * 100)}%`;
  }
  function fit(): void {
    fitting = true;
    zoom = fitScale();
    const { width, height } = viewport();
    offsetX = (contentWidth - width / zoom) / 2;
    offsetY = (contentHeight - height / zoom) / 2;
    view();
  }
  function zoomAt(next: number, clientX?: number, clientY?: number): void {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const y = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const target = Math.max(Math.min(0.05, fitScale()), Math.min(16, next));
    offsetX += x / zoom - x / target;
    offsetY += y / zoom - y / target;
    zoom = target;
    fitting = false;
    view();
  }
  function draw(): void {
    nodes = [];
    flatten(value, 'root', '', 0, -1);
    surface.replaceChildren();
    contentWidth = Math.max(...nodes.map((n) => n.depth * 230 + 222));
    contentHeight = nodes.length * 48;
    if (fitting) fit();
    else view();
    nodes.forEach((n, i) => {
      const x = n.depth * 230 + 12,
        y = i * 48 + 12;
      if (n.parent >= 0) {
        const p = nodes[n.parent];
        const line = document.createElementNS(surface.namespaceURI, 'path');
        line.setAttribute(
          'd',
          `M ${p.depth * 230 + 210} ${n.parent * 48 + 30} H ${x - 12} V ${y + 18} H ${x}`,
        );
        line.setAttribute('class', 'edge');
        surface.append(line);
      }
      const g = document.createElementNS(surface.namespaceURI, 'g');
      g.setAttribute('transform', `translate(${x},${y})`);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${n.label}; toggle children`);
      g.setAttribute(
        'class',
        query && n.label.toLowerCase().includes(query) ? 'graph-node match' : 'graph-node',
      );
      const rect = document.createElementNS(surface.namespaceURI, 'rect');
      rect.setAttribute('width', '198');
      rect.setAttribute('height', '36');
      rect.setAttribute('rx', '5');
      const text = document.createElementNS(surface.namespaceURI, 'text');
      text.setAttribute('x', '9');
      text.setAttribute('y', '23');
      text.textContent = (collapsed.has(n.id) ? '▸ ' : '') + n.label.slice(0, 25);
      const title = document.createElementNS(surface.namespaceURI, 'title');
      title.textContent = n.label;
      g.append(rect, text, title);
      const toggle = () => {
        if (collapsed.has(n.id)) collapsed.delete(n.id);
        else collapsed.add(n.id);
        draw();
      };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') toggle();
      });
      surface.append(g);
    });
  }
  for (const [label, action] of [
    ['Zoom in', () => zoomAt(zoom * 1.3)],
    ['Zoom out', () => zoomAt(zoom / 1.3)],
    ['100%', () => zoomAt(1)],
    ['Fit', fit],
  ] as const) {
    const b = el('button', label);
    b.onclick = action;
    tools.append(b);
  }
  tools.append(percentage);
  surface.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport().height : 1);
      zoomAt(zoom * Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002), e.clientX, e.clientY);
    },
    { passive: false },
  );
  let drag: { x: number; y: number } | undefined;
  surface.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.graph-node')) return;
    fitting = false;
    drag = { x: e.clientX, y: e.clientY };
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', (e) => {
    if (!drag) return;
    offsetX -= (e.clientX - drag.x) / zoom;
    offsetY -= (e.clientY - drag.y) / zoom;
    drag = { x: e.clientX, y: e.clientY };
    view();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    surface.addEventListener(event, () => (drag = undefined));
  tools.append(el('small', 'Ctrl/Cmd + wheel to zoom · drag to pan · select a node to collapse'));
  wrapper.append(tools, surface);
  draw();
  const observer = new ResizeObserver(() => {
    if (fitting) fit();
    else view();
  });
  observer.observe(surface);
  disposeViewer = () => observer.disconnect();
  return wrapper;
}
function renderOutput(): void {
  if (!output) return;
  disposeViewer();
  disposeViewer = () => {};
  const viewer = $('viewer');
  viewer.replaceChildren();
  const query = $<HTMLInputElement>('output-search').value.toLowerCase();
  if (output.truncated)
    viewer.append(
      el(
        'p',
        'Preview truncated to 256 KiB. Copy uses the full output. JSON viewers require a smaller result.',
        'warning',
      ),
    );
  try {
    if (tab === 'tree') viewer.append(treeView(jsonOutput(), query));
    else if (tab === 'graph') viewer.append(graphView(jsonOutput(), query));
    else {
      let text = output.value;
      if (tab === 'hex') {
        const bytes =
          output.kind === 'bytes'
            ? Uint8Array.from(text.match(/.{2}/g) ?? [], (s) => parseInt(s, 16))
            : new TextEncoder().encode(text);
        const rows = [];
        const max = Math.min(bytes.length, 65536);
        for (let i = 0; i < max; i += 16) {
          const chunk = bytes.slice(i, i + 16);
          rows.push(
            `${i.toString(16).padStart(8, '0')}  ${Array.from(chunk, (b) =>
              b.toString(16).padStart(2, '0'),
            )
              .join(' ')
              .padEnd(
                47,
              )}  ${Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}`,
          );
        }
        text = rows.join('\n');
        if (bytes.length > max) text += '\n… Hex view limited to 64 KiB.';
      } else if (output.kind === 'bytes')
        viewer.append(
          el(
            'p',
            'Raw bytes shown as hex. Add Bytes → Text for explicit UTF-8 decoding.',
            'warning',
          ),
        );
      const pre = el('pre', '', 'output-text');
      if (query) {
        let pos = 0,
          hits = 0;
        const lower = text.toLowerCase();
        let at = lower.indexOf(query);
        while (at >= 0 && hits++ < 1000) {
          pre.append(
            document.createTextNode(text.slice(pos, at)),
            el('mark', text.slice(at, at + query.length)),
          );
          pos = at + query.length;
          at = lower.indexOf(query, pos);
        }
        pre.append(document.createTextNode(text.slice(pos)));
      } else pre.textContent = text;
      viewer.append(pre);
    }
  } catch (error) {
    viewer.append(el('p', (error as Error).message, 'viewer-hint'));
  }
}
function example(): void {
  input.value =
    'eyJ1c2VyIjp7ImlkIjo0MiwibmFtZSI6IkFkYSIsInJvbGVzIjpbImFkbWluIiwiZWRpdG9yIl19LCJhY3RpdmUiOnRydWV9';
  recipe = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'Base64 → JSON',
    steps: ['base64.decode', 'bytes.text', 'json.parse'].map((operationId) => ({
      id: crypto.randomUUID(),
      operationId,
      enabled: true,
      params: {},
    })),
  };
  renderSteps();
  persist();
  updateInputSize();
  run();
}
function updateInputSize(): void {
  $('input-size').textContent = size(new TextEncoder().encode(input.value).length);
}
$('new').onclick = () => {
  recipe = { schemaVersion: 1, id: crypto.randomUUID(), name: 'Untitled recipe', steps: [] };
  input.value = '';
  renderSteps();
  changed();
  updateInputSize();
};
$('selection').onclick = () => send('loadSelection');
$('recipes').onclick = () => send('loadRecipes');
$('save').onclick = () => send('saveRecipe', { recipe });
$('import').onclick = () => send('importRecipe');
$('export').onclick = () => send('exportRecipe', { recipe });
$('run').onclick = run;
$('cancel').onclick = () => {
  clearTimeout(autoTimer);
  send('cancelRun');
};
$('copy').onclick = () => send('copyOutput');
$('replace').onclick = () => send('replaceSelection');
$('example').onclick = example;
$('empty-example').onclick = example;
input.oninput = () => {
  updateInputSize();
  invalidate();
};
$<HTMLInputElement>('recipe-name').onchange = (e) => {
  recipe.name = (e.target as HTMLInputElement).value.trim() || 'Untitled recipe';
  persist();
};
$('search').oninput = renderOperations;
$('output-search').oninput = renderOutput;
$('auto').onchange = () => {
  if ($<HTMLInputElement>('auto').checked) invalidate();
  else clearTimeout(autoTimer);
};
for (const name of ['text', 'tree', 'graph', 'hex'])
  $('tab-' + name).onclick = () => {
    tab = name;
    for (const n of ['text', 'tree', 'graph', 'hex'])
      $('tab-' + n).setAttribute('aria-selected', String(n === tab));
    renderOutput();
  };
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    if (output) send('copyOutput');
  }
});
window.addEventListener('message', (event) => {
  const m = event.data;
  if (m.protocolVersion !== 1) return;
  const p = m.payload;
  if (m.type === 'init') {
    operations = p.operations;
    graphLimit = p.graphNodeLimit;
    if (p.input) input.value = p.input;
    renderSteps();
    renderOperations();
    updateInputSize();
  } else if (m.type === 'selectionLoaded') {
    input.value = p.input;
    invalidate();
    updateInputSize();
    status('Selection loaded. Replacement checks the original document version.');
  } else if (m.type === 'recipeLoaded' || m.type === 'recipeListChanged') {
    recipe = p.recipe;
    renderSteps();
    changed();
    status(p.message ?? `Loaded “${recipe.name}”.`);
  } else if (m.type === 'notice') status(p.message);
  else if (m.type === 'error') {
    if (m.requestId === active) busy(false);
    status(p.message, true);
  } else if (m.requestId === active) {
    if (m.type === 'runStarted') {
      busy(true);
      $('output-kind').textContent = 'RUNNING';
    } else if (m.type === 'stepCompleted') {
      const badge = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'))
        .find((n) => n.dataset.step === p.stepId)
        ?.querySelector('.step-status');
      if (badge)
        badge.textContent = `✓ ${p.kind} · ${size(p.size)} · ${p.durationMs.toFixed(1)} ms`;
    } else if (m.type === 'runCompleted') {
      output = p;
      busy(false);
      $('output-kind').textContent = p.kind.toUpperCase();
      $('output-size').textContent = size(p.size);
      $('elapsed').textContent = `${p.durationMs.toFixed(1)} ms`;
      $<HTMLButtonElement>('copy').disabled = p.kind === 'bytes';
      $<HTMLButtonElement>('replace').disabled = p.kind === 'bytes';
      status('Recipe complete.');
      renderOutput();
    } else if (m.type === 'runFailed') {
      busy(false);
      output = undefined;
      $('output-kind').textContent = 'STOPPED';
      status(p.message, true);
      const badge = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'))
        .find((n) => n.dataset.step === p.stepId)
        ?.querySelector('.step-status');
      if (badge) {
        badge.textContent = p.message;
        badge.classList.add('error');
      }
      $('viewer').replaceChildren(el('p', p.message, 'viewer-hint'));
    }
  }
});
for (const [id, column] of [
  ['split-one', '.input-column'],
  ['split-two', '.recipe-column'],
]) {
  const handle = $(id);
  const target = document.querySelector<HTMLElement>(column)!;
  let start: number | undefined,
    width = 0;
  handle.onpointerdown = (e) => {
    start = e.clientX;
    width = target.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
  };
  handle.onpointermove = (e) => {
    if (start === undefined) return;
    target.style.flex = `0 0 ${Math.max(220, Math.min(window.innerWidth * 0.6, width + e.clientX - start))}px`;
  };
  handle.onpointerup = () => (start = undefined);
  handle.onkeydown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      target.style.flex = `0 0 ${Math.max(220, target.getBoundingClientRect().width + (e.key === 'ArrowLeft' ? -20 : 20))}px`;
    }
  };
}
send('ready');
