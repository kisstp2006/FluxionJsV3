// ============================================================
// FluxionJS V3 — API Emitter
// Orchestrates all generators and writes generated API files
// to {projectRoot}/.fluxion/api/ so VS Code and Lua IDEs pick
// them up automatically for autocompletion.
//
// Called by the editor when a project is opened:
//   await ApiEmitter.emit(projectManager.projectDir!);
// ============================================================

import { getFileSystem } from '../filesystem';
import { pathJoin } from '../filesystem/FileSystem';
import { DebugConsole } from '../core/DebugConsole';
import { MetaRegistry } from './MetaRegistry';
import { TypeScriptGenerator } from './generators/TypeScriptGenerator';
import { JavaScriptGenerator } from './generators/JavaScriptGenerator';
import { LuaGenerator } from './generators/LuaGenerator';
import { RegistryReporter } from './RegistryReporter';

/**
 * jsconfig.json placed next to the generated API files in `.fluxion/api/`.
 * VS Code uses this when the user opens a .js file from Assets/Scripts.
 */
const JSCONFIG_API = JSON.stringify(
  {
    compilerOptions: {
      allowJs:          true,
      checkJs:          true,
      noEmit:           true,
      lib:              ['ES2020', 'DOM'],
      moduleResolution: 'node',
      strict:           false,
      target:           'ES2020',
    },
    include: ['../Assets/Scripts/**/*.js', '../Assets/Scripts/**/*.ts', 'fluxion.d.ts'],
  },
  null,
  2,
);

/**
 * tsconfig.json written directly into Assets/Scripts/ so VS Code finds it
 * automatically when a .ts script is opened. Pulls in the generated fluxion.d.ts
 * as an ambient type declaration via `files`.
 */
const TSCONFIG_SCRIPTS = JSON.stringify(
  {
    compilerOptions: {
      target:           'ES2020',
      lib:              ['ES2020'],
      moduleResolution: 'node',
      allowJs:          true,
      checkJs:          false,
      noEmit:           true,
      strict:           false,
      skipLibCheck:     true,
      isolatedModules:  false,
    },
    include: ['**/*.ts'],
    files:   ['../../.fluxion/api/fluxion.d.ts'],
  },
  null,
  2,
);

/**
 * jsconfig.json written directly into Assets/Scripts/ for JavaScript scripts.
 */
const JSCONFIG_SCRIPTS = JSON.stringify(
  {
    compilerOptions: {
      target:           'ES2020',
      lib:              ['ES2020'],
      checkJs:          true,
      noEmit:           true,
      strict:           false,
      skipLibCheck:     true,
    },
    include: ['**/*.js'],
    files:   ['../../.fluxion/api/fluxion.d.ts'],
  },
  null,
  2,
);

/** Minimal .luarc.json for Lua Language Server workspace config. */
const LUARC = JSON.stringify(
  {
    workspace: { library: ['.'] },
    diagnostics: { globals: ['FluxionBehaviour', 'EntityRef', 'Mathf', 'Debug'] },
  },
  null,
  2,
);

export class ApiEmitter {
  /**
   * Generate TypeScript, JavaScript and Lua API files into
   * `{projectRoot}/.fluxion/api/`.
   *
   * @param projectRoot  Absolute path to the project root directory.
   */
  static async emit(projectRoot: string): Promise<void> {
    if (!projectRoot) {
      DebugConsole.LogWarning('[ApiEmitter] No project root — skipping API generation.');
      return;
    }

    const fs     = getFileSystem();
    const outDir = pathJoin(projectRoot, '.fluxion', 'api');

    try {
      await fs.mkdir(outDir);
    } catch {
      // Directory may already exist — ignore
    }

    const def = MetaRegistry.build(true); // always rebuild on project open

    const dts  = TypeScriptGenerator.generate(def);
    const js   = JavaScriptGenerator.generate(def);
    const lua  = LuaGenerator.generate(def);

    const report = RegistryReporter.generate(def, MetaRegistry.getLastBuildWarnings());

    const scriptsDir = pathJoin(projectRoot, 'Assets', 'Scripts');
    try { await fs.mkdir(scriptsDir); } catch { /* already exists */ }

    const writes: Promise<void>[] = [
      // ── API output directory ──────────────────────────────────────────
      fs.writeFile(pathJoin(outDir, 'fluxion.d.ts'), dts),
      fs.writeFile(pathJoin(outDir, 'fluxion.js'),   js),
      fs.writeFile(pathJoin(outDir, 'fluxion.lua'),  lua),
      fs.writeFile(pathJoin(outDir, 'jsconfig.json'), JSCONFIG_API),
      fs.writeFile(pathJoin(outDir, '.luarc.json'),   LUARC),
      fs.writeFile(
        pathJoin(outDir, 'registry-report.json'),
        JSON.stringify(report, null, 2),
      ).catch(e => {
        DebugConsole.LogWarning(`[ApiEmitter] Could not write registry-report.json: ${e}`);
      }),
      // ── Assets/Scripts — VS Code project config ───────────────────────
      // tsconfig.json lets VS Code resolve FluxionBehaviour types for .ts files
      fs.writeFile(pathJoin(scriptsDir, 'tsconfig.json'), TSCONFIG_SCRIPTS),
      // jsconfig.json does the same for .js files
      fs.writeFile(pathJoin(scriptsDir, 'jsconfig.json'), JSCONFIG_SCRIPTS),
    ];

    await Promise.all(writes);

    DebugConsole.Log(
      `[ApiEmitter] Generated API: ${def.components.length} components → ${outDir}`,
    );

    // Notify the built-in Monaco editor so it can hot-swap the generated types
    // without requiring a full reload. Guard with ?. — safe in non-browser envs.
    (globalThis as any).window?.dispatchEvent(
      new CustomEvent('fluxion:api-updated', { detail: { dts } }),
    );
  }
}
