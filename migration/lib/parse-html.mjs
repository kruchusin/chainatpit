// Default HTML parser (devDependency node-html-parser). Loaded lazily so unit tests need no install.
import { createRequire } from 'node:module';

export function defaultParse(html) {
  const { parse } = createRequire(import.meta.url)('node-html-parser');
  return parse(html);
}
