/**
 * ESM resolve hook — maps @/ to the project root.
 * Registered by alias-loader.mjs via node:module register().
 *
 * Also handles extensionless imports (adds .js) for files that exist on disk,
 * since Node ESM doesn't do automatic extension resolution.
 */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../');

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let resolved = path.join(projectRoot, specifier.slice(2));
    // Try exact path first, then with .js extension
    if (!existsSync(resolved)) {
      if (existsSync(resolved + '.js')) {
        resolved = resolved + '.js';
      } else if (existsSync(path.join(resolved, 'index.js'))) {
        resolved = path.join(resolved, 'index.js');
      }
    }
    return { shortCircuit: true, url: pathToFileURL(resolved).href };
  }
  return nextResolve(specifier, context);
}
