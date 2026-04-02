// ============================================================
// FluxionJS V3 — Game Player Entry Point
// Standalone runtime bootstrap — zero editor dependencies.
// Webpack bundles this as the entry when building for export.
//
// The alias `__fluxion_game_scripts__` is injected by the
// generated webpack.game.config.js and resolves to the
// auto-generated .fluxion/game-scripts.ts registry.
// ============================================================

import { Engine }          from '../core/Engine';
import { FluxionRenderer } from '../renderer/Renderer';
import { InputManager }    from '../input/InputManager';
import { AudioSystem }     from '../audio/AudioSystem';
import { PhysicsWorld }    from '../physics/PhysicsWorld';
import { AssetManager }    from '../assets/AssetManager';
import { MaterialSystem }  from '../renderer/MaterialSystem';
import { FuiRuntimeSystem } from '../ui/FuiRuntimeSystem';
import { ScriptSystem }    from '../scripting/ScriptSystem';
import { Scene }           from '../scene/Scene';
import { deserializeScene } from '../project/SceneSerializer';
import { WebFileSystem, setGlobalFileSystem } from '../filesystem';

// Injected by webpack alias — resolves to .fluxion/game-scripts.ts
// Using require so we gracefully handle the case where the alias
// is not resolved (e.g. running outside a build).
let scriptRegistry: Record<string, any> = {};
let pluginModules:  any[]               = [];

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const generated = require('__fluxion_game_scripts__');
  scriptRegistry  = generated.scriptRegistry  ?? {};
  pluginModules   = generated.pluginModules   ?? [];
} catch {
  console.warn('[PlayerEntry] game-scripts registry not found — scripts will not be loaded.');
}

// ── Build manifest (written to output by BuildService) ───────

interface BuildManifest {
  gameName:    string;
  gameVersion: string;
  startScene:  string;
  builtAt:     string;
  engine:      string;
}

async function fetchManifest(): Promise<BuildManifest> {
  const resp = await fetch('./build-manifest.json');
  if (!resp.ok) throw new Error('build-manifest.json not found');
  return resp.json() as Promise<BuildManifest>;
}

// ── Bootstrap ────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Element #game-canvas not found in player.html');

  // Initialize fetch-based filesystem — must happen before any system calls.
  setGlobalFileSystem(new WebFileSystem());

  // Fetch build manifest to know which scene to load
  let manifest: BuildManifest;
  try {
    manifest = await fetchManifest();
  } catch (e) {
    console.error('[PlayerEntry] Could not load build-manifest.json:', e);
    return;
  }

  document.title = manifest.gameName || 'FluxionJS Game';

  // ── Engine + core systems ────────────────────────────────
  const engine   = new Engine({ canvas, width: window.innerWidth, height: window.innerHeight });
  const renderer = new FluxionRenderer(engine);
  const input    = new InputManager(engine);
  const audio    = new AudioSystem(engine);

  // ── Asset & material subsystems ──────────────────────────
  const materials = new MaterialSystem();
  engine.registerSubsystem('materials', materials);
  const assets = new AssetManager();
  engine.registerSubsystem('assets', assets);

  // ── FUI runtime (screen-space UI) ────────────────────────
  engine.ecs.addSystem(new FuiRuntimeSystem(engine, renderer, input));

  // ── Physics (optional) ───────────────────────────────────
  try {
    const physics = new PhysicsWorld(engine);
    await physics.init();
  } catch (e) {
    console.warn('[PlayerEntry] Physics not available:', e);
  }

  // ── Scripting systems ────────────────────────────────────
  const scriptSystem = new ScriptSystem(engine, input, renderer, audio);

  scriptSystem.setBundledRegistry(scriptRegistry);

  engine.ecs.addSystem(scriptSystem);

  // ── Plugin registration ──────────────────────────────────
  for (const mod of pluginModules) {
    const register = mod?.default?.register ?? mod?.register;
    if (typeof register === 'function') {
      try { register(engine); } catch (e) { console.warn('[PlayerEntry] Plugin registration failed:', e); }
    }
  }

  // ── Scene loading ────────────────────────────────────────
  try {
    const sceneResp = await fetch('./' + manifest.startScene);
    if (!sceneResp.ok) throw new Error(`Cannot fetch scene "${manifest.startScene}"`);
    const sceneData = await sceneResp.json();
    const scene = new Scene(engine, manifest.gameName || 'Main');
    await deserializeScene(engine, sceneData, scene);
  } catch (e) {
    console.error('[PlayerEntry] Failed to load start scene:', e);
    return;
  }

  // ── Window resize ────────────────────────────────────────
  window.addEventListener('resize', () => {
    engine.resize(window.innerWidth, window.innerHeight);
  });

  // ── Start simulation ─────────────────────────────────────
  engine.simulationPaused = false;
  await engine.start();
}

bootstrap().catch(err => {
  console.error('[PlayerEntry] Fatal bootstrap error:', err);
});
