import * as vscode from 'vscode';
export interface SelectionSnapshot {
  document: vscode.TextDocument;
  version: number;
  range: vscode.Range;
  text: string;
}
export function captureSelection(editor: vscode.TextEditor): SelectionSnapshot {
  if (editor.selection.isEmpty) throw new Error('Select some text in the editor first.');
  return {
    document: editor.document,
    version: editor.document.version,
    range: new vscode.Range(editor.selection.start, editor.selection.end),
    text: editor.document.getText(editor.selection),
  };
}
export async function replaceOriginal(
  snapshot: SelectionSnapshot | undefined,
  output: string,
): Promise<void> {
  if (!snapshot || snapshot.document.isClosed)
    throw new Error('Original selection is no longer available. Open the selection again.');
  const editor = await vscode.window.showTextDocument(snapshot.document, {
    preserveFocus: false,
    preview: false,
  });
  // No await between the version check and edit submission; TextEditor.edit uses a versioned edit.
  if (
    editor.document.version !== snapshot.version ||
    editor.document.getText(snapshot.range) !== snapshot.text
  )
    throw new Error(
      'Document changed since selection was captured. Open the selection again before replacing.',
    );
  const applied = await editor.edit((edit) => edit.replace(snapshot.range, output), {
    undoStopBefore: true,
    undoStopAfter: true,
  });
  if (!applied) throw new Error('Replacement rejected because the document changed.');
}
