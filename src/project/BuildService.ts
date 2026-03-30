// ============================================================
// FluxionJS V3 — Build Service
// Orchestrates a Web (HTML5) export of a game project:
//   1. Scan Assets/Scripts/ for all user script files
//   2. Discover installed Fluxion plugins
//   3. Generate .fluxion/game-scripts.ts  (auto-import registry)
//   4. Generate .fluxion/webpack.game.config.js  (dynamic, derived
//      from BuildSettings — nothing hard-coded)
//   5. Signal the Electron main process to spawn webpack
// ============================================================

import { getFileSystem, pathJoin, pathExtension } from '../filesystem';
import { npmProjectService, FluxionPlugin } from './NpmProjectService';
import type { BuildSettings } from './ProjectManager';

// ── Types ────────────────────────────────────────────────────

export type BuildEventType = 'stdout' | 'stderr' | 'done' | 'error' | 'progress';

export interface BuildEvent {
  type: BuildEventType;
  data: string;
}

export type BuildProgressCallback = (event: BuildEvent) => void;

export interface BuildOptions {
  projectDir:  string;
  engineRoot:  string;
  settings:    BuildSettings;
  onProgress?: BuildProgressCallback;
}

export interface BuildResult {
  success: boolean;
  outputDir: string;
  error?: string;
}

/** Result of prepare() — ready to pass configPath to the IPC build runner. */
export interface BuildPrepareResult {
  /** Absolute path to the generated webpack.game.config.js */
  configPath:  string;
  /** Absolute path to the target output directory */
  outputDir:   string;
}

// ── Script file extensions accepted for bundling ─────────────

const SCRIPT_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx']);

// ── BuildService ─────────────────────────────────────────────

export class BuildService {
  /**
   * Prepare phase — scans scripts, discovers plugins, generates:
   *   .fluxion/game-scripts.ts      (auto-import registry)
   *   .fluxion/webpack.game.config.js  (dynamic webpack config)
   *
   * The caller (BuildPanel) is responsible for the IPC step:
   *   api.build.run(engineRoot, result.configPath)
   */
  async prepare(options: BuildOptions): Promise<BuildPrepareResult> {
    const { projectDir, engineRoot, settings, onProgress } = options;
    const fs = getFileSystem();

    const emit = (type: BuildEventType, data: string) => onProgress?.({ type, data });

    const absOutputDir = pathJoin(projectDir, settings.outputDir);

    emit('progress', 'Scanning project scripts...');

    // 1. Discover user scripts
    const scriptPaths = await this._scanScripts(projectDir);
    emit('progress', `Found ${scriptPaths.length} script file(s).`);

    // 2. Discover installed plugins
    const plugins = await npmProjectService.discoverPlugins(projectDir);
    if (plugins.length) {
      emit('progress', `Found ${plugins.length} plugin(s): ${plugins.map(p => p.name).join(', ')}`);
    }

    // 3. Generate .fluxion/game-scripts.ts
    const generatedEntry = this._generateScriptRegistry(projectDir, scriptPaths, plugins);
    await fs.mkdir(pathJoin(projectDir, '.fluxion'));
    await fs.writeFile(pathJoin(projectDir, '.fluxion', 'game-scripts.ts'), generatedEntry);
    emit('progress', 'Generated .fluxion/game-scripts.ts');

    // 4. Generate webpack config
    const webpackConfig = this._generateWebpackConfig({
      projectDir,
      engineRoot,
      outputDir: absOutputDir,
      settings,
    });
    const configPath = pathJoin(projectDir, '.fluxion', 'webpack.game.config.js');
    await fs.writeFile(configPath, webpackConfig);
    emit('progress', 'Generated webpack.game.config.js');

    // 5. Ensure output directory exists
    await fs.mkdir(absOutputDir);

    return { configPath, outputDir: absOutputDir };
  }

  /** Write build-manifest.json after a successful webpack run. */
  async writeBuildManifest(outputDir: string, settings: BuildSettings): Promise<void> {
    return this._writeBuildManifest(outputDir, settings);
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Recursively scan Assets/Scripts for bundleable script files. */
  private async _scanScripts(projectDir: string): Promise<string[]> {
    const fs = getFileSystem();
    const scriptsDir = pathJoin(projectDir, 'Assets', 'Scripts');
    if (!(await fs.exists(scriptsDir))) return [];
    return this._walkDir(scriptsDir, scriptsDir);
  }

  private async _walkDir(dir: string, root: string): Promise<string[]> {
    const fs = getFileSystem();
    const results: string[] = [];
    let entries;
    try { entries = await fs.readDir(dir); } catch { return results; }
    for (const entry of entries) {
      if (entry.isDirectory) {
        results.push(...await this._walkDir(entry.path, root));
      } else if (SCRIPT_EXTENSIONS.has(pathExtension(entry.name))) {
        results.push(entry.path);
      }
    }
    return results;
  }

  /**
   * Generate .fluxion/game-scripts.ts:
   * Imports every discovered script + plugin and exports a registry
   * so PlayerEntry can register all classes with the BundledScriptLoader.
   */
  private _generateScriptRegistry(
    projectDir: string,
    scriptPaths: string[],
    plugins: FluxionPlugin[],
  ): string {
    const lines: string[] = [
      '// Auto-generated by FluxionJS Build System — do not edit manually',
      '',
    ];

    // Import user scripts
    scriptPaths.forEach((absPath, i) => {
      // Make path relative to .fluxion/ dir (one level up to project root, then into Assets)
      const rel = absPath.replace(/\\/g, '/');
      const projectRel = rel.startsWith(projectDir.replace(/\\/g, '/'))
        ? rel.slice(projectDir.replace(/\\/g, '/').length + 1)
        : rel;
      // Strip extension for the import
      const importPath = '../' + projectRel.replace(/\.(ts|tsx|js|jsx)$/, '');
      lines.push(`import * as _script${i} from '${importPath}';`);
    });

    // Import plugins — use a path relative to .fluxion/ (one level below project root)
    const fwdProjectDir = projectDir.replace(/\\/g, '/').replace(/\/$/, '');
    plugins.forEach((plugin, i) => {
      const fwdMain = plugin.mainPath.replace(/\\/g, '/');
      const importPath = fwdMain.startsWith(fwdProjectDir + '/')
        ? '../' + fwdMain.slice(fwdProjectDir.length + 1)
        : fwdMain; // absolute fallback (should not occur in normal usage)
      lines.push(`import * as _plugin${i} from '${importPath}';`);
    });

    lines.push('');
    lines.push('/** Map of project-relative script path → module namespace */');
    lines.push('export const scriptRegistry: Record<string, any> = {');
    scriptPaths.forEach((absPath, i) => {
      const rel = absPath.replace(/\\/g, '/');
      const projectRel = rel.startsWith(projectDir.replace(/\\/g, '/'))
        ? rel.slice(projectDir.replace(/\\/g, '/').length + 1)
        : rel;
      lines.push(`  ${JSON.stringify(projectRel)}: _script${i},`);
    });
    lines.push('};');

    lines.push('');
    lines.push('/** List of plugin module namespaces to auto-register */');
    lines.push('export const pluginModules: any[] = [');
    plugins.forEach((_, i) => lines.push(`  _plugin${i},`));
    lines.push('];');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate the webpack config JS string.
   * All paths are derived from runtime arguments — nothing is hard-coded.
   */
  private _generateWebpackConfig(opts: {
    projectDir: string;
    engineRoot: string;
    outputDir:  string;
    settings:   BuildSettings;
  }): string {
    const { projectDir, engineRoot, outputDir, settings } = opts;
    const gameName = settings.gameName || 'My Game';
    const minify   = settings.minify;
    const sourceMaps = settings.includeSourceMaps ? "'source-map'" : 'false';

    // Paths — forward-slash for webpack
    const fwdProject = projectDir.replace(/\\/g, '/');
    const fwdEngine  = engineRoot.replace(/\\/g, '/');
    const fwdOutput  = outputDir.replace(/\\/g, '/');
    const entryPath  = `${fwdEngine}/src/player/PlayerEntry.ts`;
    const assetsDir  = `${fwdProject}/Assets`;

    return `// Auto-generated by FluxionJS Build System — do not edit manually
const path = require('path');
const fs   = require('fs');

// Engine root — plugins are resolved from here, not from the project directory
const engineRoot  = ${JSON.stringify(fwdEngine)};
const projectDir  = ${JSON.stringify(fwdProject)};

// Require webpack plugins from the engine's node_modules so the game project
// doesn't need its own copies of html-webpack-plugin / copy-webpack-plugin.
const HtmlWebpackPlugin = require(path.join(engineRoot, 'node_modules/html-webpack-plugin'));
const CopyWebpackPlugin = require(path.join(engineRoot, 'node_modules/copy-webpack-plugin'));
const webpack           = require(path.join(engineRoot, 'node_modules/webpack'));
const outputDir   = ${JSON.stringify(fwdOutput)};
const assetsDir   = ${JSON.stringify(assetsDir)};
const gameName    = ${JSON.stringify(gameName)};
const gameVersion = ${JSON.stringify(settings.gameVersion || '1.0.0')};

const copyPatterns = [];
if (fs.existsSync(assetsDir)) {
  copyPatterns.push({
    from: assetsDir,
    to: path.join(outputDir, 'Assets'),
    noErrorOnMissing: true,
  });
}

/** Scan Scenes/ folder */
const scenesDir = path.join(projectDir, 'Scenes');
if (fs.existsSync(scenesDir)) {
  copyPatterns.push({
    from: scenesDir,
    to: path.join(outputDir, 'Scenes'),
    noErrorOnMissing: true,
  });
}

module.exports = {
  mode: ${minify ? "'production'" : "'development'"},
  devtool: ${sourceMaps},
  entry: ${JSON.stringify(entryPath)},
  target: 'web',
  output: {
    path: outputDir,
    filename: 'game.bundle.js',
    globalObject: 'self',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    modules: [
      path.join(engineRoot, 'node_modules'),
      path.join(projectDir, 'node_modules'),
    ],
    alias: {
      '@core':     path.join(engineRoot, 'src/core'),
      '@renderer': path.join(engineRoot, 'src/renderer'),
      '@physics':  path.join(engineRoot, 'src/physics'),
      '@scene':    path.join(engineRoot, 'src/scene'),
      '@input':    path.join(engineRoot, 'src/input'),
      '@audio':    path.join(engineRoot, 'src/audio'),
      '@assets':   path.join(engineRoot, 'src/assets'),
      // Inject the generated script registry
      '__fluxion_game_scripts__': path.join(projectDir, '.fluxion', 'game-scripts.ts'),
    },
    fallback: { url: false, module: false, path: false, fs: false },
  },
  module: {
    rules: [
      {
        test: /\\.tsx?$/,
        use: [{
          loader: require.resolve(path.join(engineRoot, 'node_modules/ts-loader')),
          options: {
            transpileOnly: true,
            context: engineRoot,
            configFile: path.join(engineRoot, 'tsconfig.json'),
          },
        }],
        exclude: /node_modules/,
      },
      { test: /\\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\\.glsl$/, type: 'asset/source' },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(engineRoot, 'src/player/player.html'),
      filename: 'index.html',
      templateParameters: { gameName, gameVersion },
    }),
    ...(copyPatterns.length ? [new CopyWebpackPlugin({ patterns: copyPatterns })] : []),
    new webpack.DefinePlugin({ 'global': 'globalThis' }),
  ],
  optimization: { minimize: ${minify} },
};
`;
  }

  /** Write a build-manifest.json to the output directory. */
  private async _writeBuildManifest(outputDir: string, settings: BuildSettings): Promise<void> {
    const fs = getFileSystem();
    const manifest = {
      gameName:    settings.gameName,
      gameVersion: settings.gameVersion,
      startScene:  settings.startScene,
      builtAt:     new Date().toISOString(),
      engine:      'FluxionJS V3',
    };
    await fs.writeFile(
      pathJoin(outputDir, 'build-manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
  }
}

export const buildService = new BuildService();
