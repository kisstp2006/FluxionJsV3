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

const LUA_GLOBALS = [
  'FluxionBehaviour', 'EntityRef', 'Mathf', 'Debug',
  'Vec2', 'Vec3', 'Vec4', 'Quat', 'Color', 'Euler', 'Mat3', 'Mat4',
  'vec3', 'vec3_add', 'vec3_sub', 'vec3_scale', 'vec3_dot', 'vec3_cross',
  'vec3_normalize', 'vec3_length', 'vec3_lerp', 'vec3_dist',
  'color_lerp', 'color_mul', 'color_add',
];

/**
 * .luarc.json at the project root — the Lua Language Server (sumneko/lua-ls)
 * reads this automatically when VS Code opens the project folder.
 * Points the library at `.fluxion/api` so `fluxion.lua` is indexed for
 * type inference, completions and diagnostics.
 */
const LUARC_ROOT = JSON.stringify(
  {
    $schema: 'https://raw.githubusercontent.com/LuaLS/vscode-lua/master/setting/schema.json',
    runtime:     { version: 'Lua 5.4' },
    workspace:   { library: ['.fluxion/api'], checkThirdParty: false },
    diagnostics: { globals: LUA_GLOBALS },
  },
  null,
  2,
);

/**
 * .luarc.json kept in the api output dir — used when Lua LS is configured
 * to point directly at `.fluxion/api` as a library source.
 */
const LUARC_API = JSON.stringify(
  {
    workspace:   { library: ['.'], checkThirdParty: false },
    diagnostics: { globals: LUA_GLOBALS },
  },
  null,
  2,
);

/**
 * .vscode/settings.json — workspace-level VS Code settings that wire up the
 * Lua LS library path, TypeScript SDK, and minor editor conveniences.
 * Written once when the project is created; preserved on subsequent emits
 * so user customisations are not overwritten (write-if-absent logic below).
 */
const VSCODE_SETTINGS = JSON.stringify(
  {
    // ── Lua Language Server ───────────────────────────────────────────────
    'Lua.runtime.version':           'Lua 5.4',
    'Lua.workspace.library':         ['.fluxion/api'],
    'Lua.workspace.checkThirdParty': false,
    'Lua.diagnostics.globals':       LUA_GLOBALS,
    'Lua.completion.enable':         true,
    'Lua.hover.enable':              true,

    // ── TypeScript / JavaScript ───────────────────────────────────────────
    'typescript.preferences.includePackageJsonAutoImports': 'off',
    'javascript.preferences.includePackageJsonAutoImports': 'off',
    // Validate JS files in Assets/Scripts via the generated jsconfig.json
    'js/ts.implicitProjectConfig.checkJs': true,

    // ── File associations ─────────────────────────────────────────────────
    'files.associations': {
      '*.lua':  'lua',
      '*.ts':   'typescript',
      '*.js':   'javascript',
    },

    // ── Search / explorer exclusions (keep .fluxion internals tidy) ───────
    'files.exclude': {
      '**/.fluxion/api/fluxion.js':       true,
      '**/.fluxion/api/registry-report.json': true,
    },
    'search.exclude': {
      '**/.fluxion': true,
    },
  },
  null,
  2,
);

/**
 * .vscode/extensions.json — surfaces extension recommendations when VS Code
 * opens the project for the first time.
 */
const VSCODE_EXTENSIONS = JSON.stringify(
  {
    recommendations: [
      'sumneko.lua',            // Lua Language Server (type checking + completions)
      'ms-vscode.vscode-typescript-next', // latest TS language features
    ],
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
    const vscodeDir  = pathJoin(projectRoot, '.vscode');
    try { await fs.mkdir(scriptsDir); } catch { /* already exists */ }
    try { await fs.mkdir(vscodeDir);  } catch { /* already exists */ }

    // .vscode/settings.json and extensions.json are written only if they do
    // not already exist so that user customisations are never clobbered.
    const writeIfAbsent = async (path: string, content: string) => {
      try { await fs.readFile(path); /* exists — skip */ }
      catch { await fs.writeFile(path, content); }
    };

    const writes: Promise<void>[] = [
      // ── API output directory ──────────────────────────────────────────
      fs.writeFile(pathJoin(outDir, 'fluxion.d.ts'),      dts),
      fs.writeFile(pathJoin(outDir, 'fluxion.js'),         js),
      fs.writeFile(pathJoin(outDir, 'fluxion.lua'),        lua),
      fs.writeFile(pathJoin(outDir, 'jsconfig.json'),      JSCONFIG_API),
      fs.writeFile(pathJoin(outDir, '.luarc.json'),        LUARC_API),
      fs.writeFile(
        pathJoin(outDir, 'registry-report.json'),
        JSON.stringify(report, null, 2),
      ).catch(e => {
        DebugConsole.LogWarning(`[ApiEmitter] Could not write registry-report.json: ${e}`);
      }),

      // ── Project root ──────────────────────────────────────────────────
      // .luarc.json at the root is where Lua LS looks by default
      fs.writeFile(pathJoin(projectRoot, '.luarc.json'),   LUARC_ROOT),

      // ── Assets/Scripts — language-server project configs ─────────────
      fs.writeFile(pathJoin(scriptsDir, 'tsconfig.json'),  TSCONFIG_SCRIPTS),
      fs.writeFile(pathJoin(scriptsDir, 'jsconfig.json'),  JSCONFIG_SCRIPTS),

      // ── .vscode — written only on first run ───────────────────────────
      writeIfAbsent(pathJoin(vscodeDir, 'settings.json'),   VSCODE_SETTINGS),
      writeIfAbsent(pathJoin(vscodeDir, 'extensions.json'), VSCODE_EXTENSIONS),
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
