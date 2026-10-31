/**
 * Node.js ESM loader hook for @/ path alias resolution.
 *
 * Resolves @/lib/foo → /path/to/project/lib/foo.js, mirroring
 * the jsconfig.json paths mapping used by Next.js.
 *
 * Usage:
 *   node --experimental-loader ./scripts/alias-loader.mjs <test-file>
 *
 * Required for any test that imports project source directly
 * (rather than extracting logic into a standalone function).
 */

import { resolve as resolvePath, extname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';

const projectRoot = resolvePath(fileURLToPath(import.meta.url), '../../');

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let rel = specifier.slice(2); // e.g. 'lib/ai-cost'
    let abs = resolvePath(projectRoot, rel);
    // Add .js extension if the bare path does not resolve
    if (!existsSync(abs) && !extname(rel)) {
      abs = abs + '.js';
    }
    return nextResolve(pathToFileURL(abs).href, context);
  }
  return nextResolve(specifier, context);
}
