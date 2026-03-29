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

/** VS Code jsconfig.json placed in the api output directory. */
const JSCONFIG = JSON.stringify(
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

    const writes: Promise<void>[] = [
      fs.writeFile(pathJoin(outDir, 'fluxion.d.ts'), dts),
      fs.writeFile(pathJoin(outDir, 'fluxion.js'),   js),
      fs.writeFile(pathJoin(outDir, 'fluxion.lua'),  lua),
      fs.writeFile(pathJoin(outDir, 'jsconfig.json'), JSCONFIG),
      fs.writeFile(pathJoin(outDir, '.luarc.json'),   LUARC),
      fs.writeFile(
        pathJoin(outDir, 'registry-report.json'),
        JSON.stringify(report, null, 2),
      ).catch(e => {
        DebugConsole.LogWarning(`[ApiEmitter] Could not write registry-report.json: ${e}`);
      }),
    ];

    await Promise.all(writes);

    DebugConsole.Log(
      `[ApiEmitter] Generated API: ${def.components.length} components → ${outDir}`,
    );
  }
}
