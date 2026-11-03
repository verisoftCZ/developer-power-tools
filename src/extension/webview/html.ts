import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { documentHtml } from './document';
export function panelHtml(webview: vscode.Webview, root: vscode.Uri): string {
  const nonce = randomBytes(24).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(root, 'dist', 'ui.js'));
  const css = webview.asWebviewUri(vscode.Uri.joinPath(root, 'dist', 'ui.css'));
  return documentHtml(script.toString(), css.toString(), webview.cspSource, nonce);
}
