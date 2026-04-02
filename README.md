# FluxionJS V3

**High-performance 2D/3D TypeScript game engine with a Tauri desktop editor**  
Inspired by [Nuake](https://github.com/antopilo/Nuake), [LumixEngine](https://github.com/nem0/LumixEngine) & [s&box](https://sbox.game/)

---

## Architecture

```
FluxionJsV3/
├── src/                    # Engine core (TypeScript)
│   ├── core/               # ECS, Engine loop, Components, Events, Time
│   ├── renderer/           # Three.js PBR renderer, Post-processing, Particles
│   ├── physics/            # Rapier3D physics (WASM)
│   ├── scripting/          # Script system (TypeScript & JavaScript)
│   ├── scene/              # Scene management, Serialization, Prefabs
│   ├── input/              # Keyboard, Mouse, Gamepad
│   ├── audio/              # Spatialized 3D audio (Web Audio API)
│   ├── assets/             # Asset pipeline, importers, type registry
│   ├── meta/               # API generator, script scanner, registry reporter
│   ├── ui/                 # FUI runtime UI system
│   └── filesystem/         # Abstracted filesystem (Tauri / Web fallback)
├── editor/                 # Editor UI (React + TypeScript)
│   ├── components/         # Panels: Hierarchy, Inspector, Viewport, Console, Asset Browser
│   ├── core/               # Editor engine wiring, Tauri API shim, drop services
│   └── ui/                 # Shared inputs, overlays, icons
├── fluxion-core/           # Rust/WASM core library (CSG, particles, transforms)
│   └── src/
├── src-tauri/              # Tauri desktop shell (Rust)
│   ├── src/                # Commands, file system, file watcher, build system
│   └── tauri.conf.json     # Tauri app configuration
├── webpack.config.js       # 5-bundle webpack config (editor + sub-windows)
├── start-editor.bat        # One-click dev launcher (Windows)
└── package.json
```

---

## Features

### Engine Core
- **ECS (Entity Component System)** — cache-friendly archetype queries
- **Fixed Timestep** — deterministic physics with variable render interpolation
- **Event System** — decoupled pub/sub for engine-wide communication
- **Scene Graph** — hierarchical entity parenting with recursive operations
- **Scene Serialization** — save/load scenes to JSON
- **Prefab System** — reusable entity templates

### Renderer
- **PBR Materials** — physically-based metalness/roughness workflow
- **Post-Processing** — Bloom, SSAO, Vignette, ACES tone mapping, HDR pipeline
- **GPU Particles** — instanced particle emitter system
- **Sprite Renderer** — 2D sprites with SVG support and pixel-per-unit scaling
- **Debug Draw** — world-space lines, spheres, boxes, text overlays

### Physics
- **Rapier3D** — Jolt-equivalent WASM physics with raycasting, forces, impulses, character controller

### Scripting
- **TypeScript & JavaScript** — full IntelliSense with generated `fluxion.d.ts` API stubs
- **Hot Reload** — scripts reload on save without restarting the simulation
- **Component Decorators** — `@component`, `@field` for inspector integration
- **16 Script Templates** — FPS controller, flying camera, physics object, coroutines, and more

### Editor
- **Scene Hierarchy** — entity tree with parenting, multi-select, drag reorder
- **Property Inspector** — typed fields, color pickers, asset slots, curve editors
- **3D Viewport** — translate/rotate/scale gizmos, camera orbit, editor-only debug rendering
- **Asset Browser** — import pipeline, thumbnail previews, drag-and-drop to viewport/inspector
- **Visual Material Editor** — node-based shader graph (sub-window)
- **FUI Editor** — screen-space UI layout editor (sub-window)
- **Script Editor** — Monaco-based code editor with generated type stubs (sub-window)
- **Console** — colour-coded log output with runtime error tracking
- **Build Panel** — one-click web export with settings, minification, and output browsing

### Rust / WASM
- **fluxion-core** — Rust library compiled to WASM for CSG operations, particle simulation, and math-heavy transforms
- **Tauri backend** — native file system, file watcher with debounce, window management, build system commands

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **TypeScript / React** | Engine core and editor UI |
| **Three.js** | WebGL 3D renderer |
| **Rapier3D** | WASM physics engine |
| **Rust + Tauri** | Desktop shell, native OS integration |
| **fluxion-core (Rust/WASM)** | High-performance CSG, particles, transforms |
| **Webpack 5** | Five-bundle build pipeline |
| **Monaco Editor** | In-editor script editing |
| **Web Audio API** | Spatialized 3D audio |

---

## Prerequisites

Install these once before building:

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 18+ | https://nodejs.org |
| **Rust + cargo** | stable | https://rustup.rs |
| **wasm-pack** | latest | `cargo install wasm-pack` |
| **wasm32 target** | — | `rustup target add wasm32-unknown-unknown` |

> **Windows shortcut:** run `setup-and-build.bat` — it checks and installs all of the above automatically, then does a full build.

---

## Quick Start

### Option A — One command (recommended)

```bash
npm run dev:full
```

Or double-click `start-editor.bat` on Windows.

This runs all three steps in order:
1. `npm install` — syncs dependencies
2. `npm run build:wasm` — compiles Rust → WASM
3. `npm run tauri:dev` — starts webpack watch + opens the editor

### Option B — Manual steps

```bash
# 1. Install JS dependencies
npm install

# 2. Compile Rust/WASM core (required once, and after fluxion-core changes)
npm run build:wasm

# 3. Start editor with hot reload
npm run tauri:dev
```

---

## All Build Commands

| Command | What it does |
|---|---|
| `npm run dev:full` | Full setup + WASM build + start editor (recommended) |
| `npm run tauri:dev` | Start editor (assumes WASM already built) |
| `npm run build:wasm` | Compile fluxion-core Rust → WASM only |
| `npm run build` | Compile TypeScript → `dist/` (production, no watch) |
| `npm run build:watch` | Compile TypeScript → `dist/` (watch mode) |
| `npm run tauri:build` | Full release build — produces installer binary |
| `npm run lint` | ESLint check (no output files) |

### Build order

```
npm install          ← JS packages
npm run build:wasm   ← Rust → WASM  (fluxion-core/pkg/)
npm run build        ← TypeScript → dist/editor/   (5 bundles)
npm run tauri:build  ← Rust (src-tauri) + packages installer
```

> `tauri:build` calls `npm run build:tauri` automatically via `beforeBuildCommand` in `tauri.conf.json`, so steps 3 and 4 are merged. You still need to run `build:wasm` manually before a release build.

---

## Release / Distribution Build

```bash
# 1. Build WASM core
npm run build:wasm

# 2. Build and package the editor
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/`

| Platform | Output |
|---|---|
| Windows | `.exe` installer (NSIS) |
| macOS | `.dmg` |
| Linux | `AppImage` + `.deb` |

---

## Game Export (Web / HTML5)

Game export is handled entirely inside the editor — no terminal needed.

1. Open your project in the FluxionJS editor
2. Open the **Build** panel
3. Configure settings (game name, start scene, output directory, minify)
4. Click **Build**
5. Click **Open Output** to reveal the folder

The output is a standard web app — serve `index.html` via any local web server:

```bash
cd YourProject/Build/Web
python -m http.server 8080
# open http://localhost:8080
```

> Direct `file://` opening won't work because browsers block `fetch()` for local files.

---

## Editor Shortcuts

| Key | Action |
|---|---|
| `W` | Move (translate) gizmo |
| `E` | Rotate gizmo |
| `R` | Scale gizmo |
| `F` | Focus selected entity in viewport |
| `Delete` | Delete selected entity |
| `Ctrl+Z` | Undo |
| `Ctrl+S` | Save scene |
| `Ctrl+D` | Duplicate selected entity |

---

## Console Commands

| Command | Description |
|---|---|
| `help` | Show available commands |
| `clear` | Clear console output |
| `stats` | Show renderer statistics |
| `entities` | Count active entities |
| `fps` | Show current FPS |
| `select <id>` | Select entity by ID |

---

## Project Structure Notes

- **`fluxion-core/pkg/`** — Generated WASM output. Do not edit manually; regenerated by `npm run build:wasm`.
- **`dist/editor/`** — Generated frontend bundles. Tauri serves these as the app UI.
- **`.fluxion/api/`** (inside each project) — Auto-generated TypeScript/JavaScript type stubs for scripting IntelliSense. Regenerated when a project is opened.
- **`src-tauri/target/`** — Rust build artifacts. Safe to delete (slow to regenerate).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `wasm-pack: command not found` | `cargo install wasm-pack` |
| `wasm32-unknown-unknown` target missing | `rustup target add wasm32-unknown-unknown` |
| Build runs out of memory | Already handled — webpack uses `--max-old-space-size=4096` |
| Monaco or Draco assets missing after build | Delete `node_modules/.cache` and rebuild |
| Editor shows blank window | Check that `dist/editor/` exists and `npm run build` completed |
| Rust compile errors after pulling changes | `cargo clean` inside `src-tauri/`, then rebuild |

---

## License

unknown
