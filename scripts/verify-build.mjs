import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const contentScriptPath = resolve('dist/content.js');
const contentScript = readFileSync(contentScriptPath, 'utf8');

if (/^\s*import\s/m.test(contentScript)) {
  throw new Error(`Expected ${contentScriptPath} to be self-contained, but found a top-level import.`);
}
