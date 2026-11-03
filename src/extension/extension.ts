import * as vscode from 'vscode';
import { WorkerRunner } from '../core/engine/runner';
import { definitions } from '../core/operations/registry';
import { validateRecipe } from '../core/recipes/schema';
import { DataValue, Recipe, outputText, textValue, valueSize } from '../core/types';
import { validateMessage } from './messaging/protocol';
import { captureSelection, replaceOriginal, SelectionSnapshot } from './selection';
import { panelHtml } from './webview/html';

export function activate(context: vscode.ExtensionContext): void {
  let panel: vscode.WebviewPanel | undefined;
  let selection: SelectionSnapshot | undefined;
  let output: DataValue | undefined;
  let latestRun = '';
  let ready = false;
  let revision = 0;
  let lastEditor = vscode.window.activeTextEditor;
  const runner = new WorkerRunner(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'worker.cjs').fsPath,
  );
  const config = () => vscode.workspace.getConfiguration('powertools');
  const maxBytes = () => config().get<number>('maxInputMB', 10) * 1024 * 1024;
  const send = (type: string, requestId: string, payload: unknown) =>
    panel?.webview.postMessage({ protocolVersion: 1, type, requestId, payload });
  const workspaceUri = () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder && vscode.Uri.joinPath(folder.uri, '.vscode', 'powertools-recipes.json');
  };
  async function recipes(): Promise<Recipe[]> {
    const global = context.globalState.get<unknown[]>('recipes', []).map(validateRecipe);
    const uri = workspaceUri();
    if (!uri) return global;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > 1024 * 1024) throw new Error('Workspace recipe file exceeds 1 MiB.');
      const parsed = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
      if (!Array.isArray(parsed) || parsed.length > 200)
        throw new Error('Expected an array of at most 200 recipes.');
      return [...global, ...parsed.map(validateRecipe)];
    } catch (error) {
      if ((error as { code?: string }).code === 'FileNotFound') return global;
      throw error;
    }
  }
  async function chooseRecipe(requestId: string): Promise<void> {
    const list = await recipes();
    const picked = await vscode.window.showQuickPick(
      list.map((recipe, index) => ({
        label: recipe.name,
        description: `${recipe.steps.length} steps`,
        index,
      })),
      { placeHolder: 'Choose a saved recipe' },
    );
    if (picked) void send('recipeLoaded', requestId, { recipe: list[picked.index] });
  }
  async function loadSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor ?? lastEditor;
    if (!editor) throw new Error('Focus a text editor and select text first.');
    const snapshot = captureSelection(editor);
    if (Buffer.byteLength(snapshot.text) > maxBytes())
      throw new Error('Selection exceeds the input size limit.');
    selection = snapshot;
    output = undefined;
    revision++;
    open();
    if (ready) void send('selectionLoaded', 'selection', { input: selection.text });
  }
  async function replace(): Promise<void> {
    if (!output) throw new Error('Run a recipe successfully before replacing.');
    await replaceOriginal(selection, outputText(output));
    selection = undefined;
    void send('notice', 'replace', {
      message: 'Original selection replaced. Undo is available in the editor.',
    });
  }
  function open(): void {
    if (panel) {
      panel.reveal();
      return;
    }
    ready = false;
    panel = vscode.window.createWebviewPanel(
      'developerPowerTools',
      'Developer Power Tools',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      },
    );
    panel.webview.html = panelHtml(panel.webview, context.extensionUri);
    panel.onDidDispose(() => {
      runner.cancel();
      latestRun = '';
      panel = undefined;
      ready = false;
      output = undefined;
      selection = undefined;
      revision++;
    });
    panel.webview.onDidReceiveMessage(async (raw) => {
      let requestId = 'invalid';
      try {
        const message = validateMessage(raw, maxBytes());
        requestId = message.requestId;
        const { type, payload: p } = message;
        if (type === 'ready') {
          ready = true;
          void send('init', requestId, {
            operations: definitions,
            graphNodeLimit: config().get('graphNodeLimit', 300),
            input: selection?.text ?? '',
          });
        } else if (type === 'loadSelection') await loadSelection();
        else if (type === 'cancelRun') {
          runner.cancel();
          output = undefined;
        } else if (type === 'runRecipe') {
          const recipe = validateRecipe(p.recipe);
          latestRun = requestId;
          output = undefined;
          const currentRevision = revision;
          void send('runStarted', requestId, {});
          try {
            const result = await runner.run(
              recipe,
              textValue(p.input as string),
              maxBytes(),
              config().get('timeoutMs', 10000),
              (step) => {
                if (latestRun === requestId) void send('stepCompleted', requestId, step);
              },
            );
            if (latestRun !== requestId || currentRevision !== revision) return;
            output = result.output;
            const full =
              result.output.kind === 'bytes'
                ? Buffer.from(result.output.value).toString('hex')
                : outputText(result.output);
            const limit = 262144;
            void send('runCompleted', requestId, {
              kind: result.output.kind,
              value: full.slice(0, limit),
              truncated: full.length > limit,
              size: valueSize(result.output),
              durationMs: result.durationMs,
              steps: result.steps,
            });
          } catch (error) {
            if (latestRun === requestId)
              void send('runFailed', requestId, {
                message: (error as Error).message,
                stepId: (error as { stepId?: string }).stepId,
              });
          }
        } else if (type === 'copyOutput') {
          if (!output) throw new Error('No successful output.');
          await vscode.env.clipboard.writeText(outputText(output));
          void send('notice', requestId, { message: 'Full output copied.' });
        } else if (type === 'replaceSelection') await replace();
        else if (type === 'loadRecipes') await chooseRecipe(requestId);
        else if (type === 'saveRecipe') {
          const recipe = validateRecipe(p.recipe);
          const name = await vscode.window.showInputBox({
            prompt: 'Recipe name',
            value: recipe.name,
            validateInput: (v) => (v.trim() && v.length <= 128 ? null : 'Use 1–128 characters.'),
          });
          if (!name) return;
          recipe.name = name.trim();
          const scope = await vscode.window.showQuickPick(
            ['User', ...(workspaceUri() && vscode.workspace.isTrusted ? ['Workspace'] : [])],
            { placeHolder: 'Store recipe in user settings or .vscode/powertools-recipes.json' },
          );
          if (!scope) return;
          const uri = workspaceUri();
          let list: Recipe[];
          if (scope === 'User')
            list = context.globalState.get<unknown[]>('recipes', []).map(validateRecipe);
          else {
            try {
              const stat = await vscode.workspace.fs.stat(uri!);
              if (stat.size > 1024 * 1024) throw new Error('Recipe file exceeds 1 MiB.');
              const parsed = JSON.parse(
                new TextDecoder().decode(await vscode.workspace.fs.readFile(uri!)),
              );
              if (!Array.isArray(parsed)) throw new Error('Invalid workspace recipe file.');
              list = parsed.map(validateRecipe);
            } catch (error) {
              if ((error as { code?: string }).code !== 'FileNotFound') throw error;
              list = [];
            }
          }
          const index = list.findIndex((x) => x.id === recipe.id);
          if (index >= 0) list[index] = recipe;
          else list.push(recipe);
          if (list.length > 200 || JSON.stringify(list).length > 1024 * 1024)
            throw new Error('Recipe storage limit reached.');
          if (scope === 'User') await context.globalState.update('recipes', list);
          else {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri!, '..'));
            await vscode.workspace.fs.writeFile(uri!, Buffer.from(JSON.stringify(list, null, 2)));
          }
          void send('recipeListChanged', requestId, {
            recipe,
            message: `Saved “${recipe.name}” to ${scope.toLowerCase()} storage.`,
          });
        } else if (type === 'importRecipe') {
          const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'Power Tools recipe': ['json'] },
          });
          if (!files?.[0]) return;
          const stat = await vscode.workspace.fs.stat(files[0]);
          if (stat.size > 1024 * 1024) throw new Error('Recipe file exceeds 1 MiB.');
          const recipe = validateRecipe(
            JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(files[0]))),
          );
          const unknown = recipe.steps.filter(
            (s) => !definitions.some((o) => o.id === s.operationId),
          );
          void send('recipeLoaded', requestId, {
            recipe,
            message: unknown.length
              ? `${unknown.length} unsupported operation(s) preserved. Disable or replace them to run.`
              : 'Recipe imported.',
          });
        } else if (type === 'exportRecipe') {
          const recipe = validateRecipe(p.recipe);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${recipe.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`),
            filters: { 'Power Tools recipe': ['json'] },
          });
          if (uri)
            await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(recipe, null, 2)));
        }
      } catch (error) {
        void send('error', requestId, { message: (error as Error).message });
      }
    });
  }
  const guarded = (fn: () => unknown) => async () => {
    try {
      return await fn();
    } catch (error) {
      void vscode.window.showErrorMessage((error as Error).message);
    }
  };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) lastEditor = editor;
    }),
    vscode.commands.registerCommand('powertools.open', open),
    vscode.commands.registerCommand('powertools.openSelection', guarded(loadSelection)),
    vscode.commands.registerCommand('powertools.replaceSelection', guarded(replace)),
    {
      dispose: () => {
        runner.cancel();
        panel?.dispose();
      },
    },
  );
}
export function deactivate(): void {}
