function pointerKeys(pointer: string): string[] {
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer))
    throw new Error('Use JSON Pointers such as /Metadata, /Data.');
  return pointer
    .slice(1)
    .split('/')
    .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}
export function decodeJsonFields(
  value: unknown,
  depthLimit: number,
  parse: (source: string) => unknown,
): unknown {
  let visited = 0;
  function visit(value: unknown, depth: number, path: string): unknown {
    if (++visited > 100000) throw new Error('Nested JSON exceeds 100,000 visited values.');
    const encoded = typeof value === 'string' && /^\s*[\[{]/.test(value);
    if ((encoded || (value !== null && typeof value === 'object')) && depth > depthLimit)
      throw new Error(
        `Nested JSON depth limit reached at ${path || 'root'}. Increase Maximum depth.`,
      );
    if (encoded) {
      let decoded: unknown;
      try {
        decoded = parse(value as string);
      } catch {
        throw new Error(`Invalid escaped JSON at ${path || 'root'}.`);
      }
      return visit(decoded, depth + 1, path);
    }
    if (value !== null && typeof value === 'object') {
      const result = Array.isArray(value) ? [] : {};
      for (const [key, child] of Object.entries(value))
        Object.defineProperty(result, key, {
          value: visit(child, depth + 1, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      return result;
    }
    return value;
  }
  return visit(value, 0, '');
}
export function escapeJsonFields(value: unknown, paths: string): unknown {
  const pointers = paths.split(',').map((path) => path.trim());
  const keys = pointers.map(pointerKeys);
  if (
    pointers.some((p, i) => pointers.some((q, k) => k !== i && (q === p || q.startsWith(p + '/'))))
  )
    throw new Error('Selected JSON Pointers must be unique and must not overlap.');
  const root = structuredClone(value);
  for (const path of keys) {
    let parent = root;
    for (const key of path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key))
        throw new Error('Selected JSON Pointer does not exist.');
      parent = (parent as Record<string, unknown>)[key];
    }
    const key = path[path.length - 1];
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key))
      throw new Error('Selected JSON Pointer does not exist.');
    const field = (parent as Record<string, unknown>)[key];
    if (field === null || typeof field !== 'object')
      throw new Error('Selected fields must be JSON objects or arrays.');
    Object.defineProperty(parent, key, {
      value: JSON.stringify(field),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return root;
}
