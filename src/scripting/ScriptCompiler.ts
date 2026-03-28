// ============================================================
// FluxionJS V3 — Script Compiler
// Compiles TypeScript source to CommonJS JavaScript via
// ts.transpileModule. No type-checking — pure syntax transform.
// Results are cached by (path, source) to avoid redundant work.
// ============================================================

import * as ts from 'typescript';

interface CacheEntry {
  source: string;
  compiled: string;
}

const cache = new Map<string, CacheEntry>();

/**
 * Compile a TypeScript (or JavaScript) source string to CommonJS JS.
 * Cached — returns the cached result if the source hasn't changed.
 *
 * @param source  Raw source text of the script file.
 * @param filePath  Absolute path (used as cache key and for TS diagnostics).
 * @returns Compiled JavaScript string.
 */
export function compileScript(source: string, filePath: string): string {
  const hit = cache.get(filePath);
  if (hit && hit.source === source) return hit.compiled;

  const result = ts.transpileModule(source, {
    compilerOptions: {
      module:                ts.ModuleKind.CommonJS,
      target:                ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      strict:                false,
      noEmitOnError:         false,
    },
    fileName: filePath,
  });

  const compiled = result.outputText;
  cache.set(filePath, { source, compiled });
  return compiled;
}

/**
 * Invalidate the compiler cache for a specific file path.
 * Call this when the file changes on disk (hot reload).
 */
export function invalidateScript(filePath: string): void {
  cache.delete(filePath);
}

/** Clear the entire compiler cache (e.g. on project close). */
export function clearScriptCache(): void {
  cache.clear();
}
