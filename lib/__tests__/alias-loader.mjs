/**
 * Node.js ESM loader that resolves Next.js @/ path aliases to the project root.
 * Usage: node --import ./lib/__tests__/alias-loader.mjs --test lib/__tests__/stage2.test.mjs
 *
 * register() in Node 22 requires a URL pointing to a hooks module file.
 * The hooks module (alias-hooks.mjs) exports the `resolve` function.
 */
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hooksUrl = new URL('./alias-hooks.mjs', import.meta.url).href;

register(hooksUrl, import.meta.url);
