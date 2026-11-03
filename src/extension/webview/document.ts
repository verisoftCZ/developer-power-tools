export function documentHtml(
  script: string,
  css: string,
  cspSource: string,
  nonce: string,
): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource}; connect-src 'none'; font-src ${cspSource};"><link rel="stylesheet" href="${css}"><title>Developer Power Tools</title></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
}
