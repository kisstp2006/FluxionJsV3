# FluxionJS V3

**High-performance 2D/3D TypeScript game engine with Electron editor**  
Inspired by [Nuake](https://github.com/antopilo/Nuake), [LumixEngine](https://github.com/nem0/LumixEngine) & [s&box](https://sbox.game/)

---

## Architecture

```
FluxionJsV2/
├── electron/           # Electron main process & preload
│   ├── main.ts
│   └── preload.ts
├── src/                # Engine core
│   ├── core/           # ECS, Engine loop, Events, Time, Components
│   ├── renderer/       # Three.js PBR renderer, Post-processing, Particles, Materials
│   ├── physics/        # Rapier3D physics (WASM)
│   ├── scene/          # Scene management, Serialization, Prefabs
│   ├── input/          # Keyboard, Mouse, Gamepad
│   ├── audio/          # Spatialized 3D audio (Web Audio API)
│   └── assets/         # Asset pipeline (GLTF, Textures, Audio)
├── editor/             # Editor UI
│   ├── EditorApp.ts    # Full editor with Hierarchy, Inspector, Viewport, Console
│   ├── index.html
│   └── styles/
└── package.json
```

## Features

### From Nuake

- **ECS (Entity Component System)** — cache-friendly archetype queries
- **PBR Renderer** — physically-based materials with metalness/roughness workflow
- **Post-Processing** — Bloom, SSAO, Vignette, ACES tone mapping, HDR pipeline
- **GPU Particles** — instanced particle emitter system
- **Physics** — Rapier3D (Jolt-equivalent for web) with raycasting, forces, impulses
- **Spatialized Audio** — HRTF-based 3D audio system

### From LumixEngine

- **Scene Graph** — hierarchical entity parenting with recursive operations
- **Full Editor** — Scene Hierarchy, Property Inspector, 3D Viewport with gizmos
- **Asset Pipeline** — GLTF/GLB model loading, texture management, caching
- **Scene Serialization** — Save/load scenes to JSON

### From s&box

- **Modern Editor UI** — Dark professional theme, tabbed panels, console
- **Component Model** — Clean typed components (Transform, Camera, Light, Rigidbody, etc.)
- **Prefab System** — Reusable entity templates
- **Developer Experience** — TypeScript-first API, IntelliSense-friendly

### Engine Core

- **Fixed Timestep** — deterministic physics with variable render
- **Event System** — decoupled pub/sub for engine-wide communication
- **Input System** — keyboard, mouse, gamepad with per-frame press/release tracking
- **Transform Gizmos** — translate, rotate, scale with keyboard shortcuts (W/E/R)
- **Real-time Profiler** — FPS graph, draw calls, triangle count, memory stats

## Tech Stack

| Technology        | Purpose                        |
| ----------------- | ------------------------------ |
| **TypeScript**    | Type-safe engine & editor code |
| **Three.js**      | WebGL/WebGPU 3D renderer       |
| **Rapier3D**      | WASM physics engine            |
| **Electron**      | Desktop editor shell           |
| **Webpack**       | Build system                   |
| **Web Audio API** | Spatialized 3D audio           |

## Quick Start

```bash
# Install dependencies
npm install

# Build & launch editor
npm start

# Development mode (hot rebuild)
npm run dev
```

---

## Building & Exporting

### Overview — Three separate "build" concepts

| What                 | Command / Action              | Who runs it      | Output                                        |
| -------------------- | ----------------------------- | ---------------- | --------------------------------------------- |
| **Editor dev build** | `npm start` or `npm run dev`  | Engine developer | Launches editor from source                   |
| **Game export**      | Build panel inside the editor | Game developer   | `Build/Web/index.html` + `game.bundle.js`     |
| **Engine installer** | `npm run dist:win`            | Engine developer | `release/FluxionJS V3 Editor Setup x.x.x.exe` |

---

### 1. Editor — Development Build

Used while you are working on the engine itself.

```bash
# Install all dependencies (first time only)
npm install

# One-shot build + launch
npm start

# Incremental watch build + auto-launch (recommended during development)
npm run dev
```

**What happens:**

- Webpack compiles `electron/main.ts`, `electron/preload.ts`, all editor React panels, the VME/FUI/Script sub-windows, and `src/` into `dist/`.
- Electron loads `dist/electron/main.js` directly from the `dist/` folder — no installer, no packaging.
- Changes to source require a rebuild (`npm run dev` watches and rebuilds automatically).

**Output directory:** `dist/`

---

### 2. Game Export — Web (HTML5)

Used by a game developer to ship their game. Accessed entirely through the editor UI — no terminal needed.

#### Steps

1. Open your project in the FluxionJS editor.
2. Open the **Build** tab in the bottom panel.
3. Fill in the **Settings** sub-tab:

| Setting              | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| **Game Name**        | Displayed in the browser tab and embedded in `index.html`              |
| **Version**          | Embedded in `build-manifest.json`                                      |
| **Output Directory** | Project-relative folder for the output (e.g. `Build/Web`)              |
| **Start Scene**      | Project-relative path to the scene loaded on startup                   |
| **Minify**           | Enables production-mode webpack minification (recommended for release) |
| **Source Maps**      | Emits `.map` files alongside the bundle (useful for debugging)         |

4. Click **Build** in the toolbar at the bottom of the panel.
5. Watch the **Console** sub-tab for progress. A green `Build finished successfully` line means it worked.
6. Click **Open Output** to reveal the output folder in Explorer.

#### What gets generated

```
YourProject/
└── Build/
    └── Web/
        ├── index.html          ← Open this in a browser (needs a web server)
        ├── game.bundle.js      ← Full game bundle (engine + scripts + plugins)
        ├── build-manifest.json ← Start scene, version, build timestamp
        ├── Assets/             ← Copied from project Assets/
        └── Scenes/             ← Copied from project Scenes/
```

#### Running the exported game

The output is a standard web app. Open `index.html` via any local web server — it will not work when opened directly as a `file://` URL because browsers block `fetch()` for local files.

```bash
# Quick option — Python (no install needed on most systems)
cd YourProject/Build/Web
python -m http.server 8080
# then open http://localhost:8080

# Or use VS Code's Live Server extension, npx serve, etc.
```

#### Plugins (optional)

The **Plugins** sub-tab lets you install npm packages that follow the `fluxion-plugin-*` naming convention or have `"fluxionPlugin": true` in their `package.json`. They are auto-discovered and bundled into the game automatically on the next build.

```bash
# Example: install a pathfinding plugin
fluxion-plugin-pathfinding
```

---

### 3. Engine Editor — Production Installer

Used when you want to **distribute the FluxionJS editor** to other people as a standalone installable application. End users do not need Node.js, npm, or any development tools installed.

#### Prerequisites

```bash
# Install electron-builder (already in devDependencies after npm install)
npm install
```

#### Build commands

```bash
# Current platform (auto-detects Windows / Linux / macOS)
npm run dist

# Windows — produces an NSIS installer (.exe)
npm run dist:win

# Linux — produces an AppImage
npm run dist:linux

# macOS — produces a .dmg
npm run dist:mac
```

**Output:** `release/` folder in the project root.

```
release/
└── FluxionJS V3 Editor Setup 2.0.0.exe   ← Windows installer
```

#### What gets packaged

The installer bundles everything an end user needs:

- Compiled editor (`dist/`)
- Engine TypeScript source (`src/`) — needed so the editor can compile user scripts at game-export time
- All `dependencies` from `package.json`, including webpack, ts-loader, Three.js, Rapier3D, etc.
- `tsconfig.json`

> **Note:** `asar` packaging is intentionally disabled (`asar: false` in `electron-builder.yml`). This is required because the game-export process spawns a webpack child process that needs to read engine source files as real filesystem files — ASAR archives are not accessible to external child processes.

#### Icons

Place icon files in the `Data/` folder before building:

| File             | Platform | Recommended size         |
| ---------------- | -------- | ------------------------ |
| `Data/icon.ico`  | Windows  | 256×256 (multi-size ICO) |
| `Data/icon.png`  | Linux    | 512×512 PNG              |
| `Data/icon.icns` | macOS    | ICNS bundle              |

Then uncomment the `icon:` lines in `electron-builder.yml`.

#### Typical release workflow

```bash
# 1. Make sure everything compiles cleanly
npm start

# 2. Build the Windows installer
npm run dist:win

# 3. Distribute release/FluxionJS V3 Editor Setup x.x.x.exe
```

## Editor Shortcuts

| Key    | Action                 |
| ------ | ---------------------- |
| Q      | Select tool            |
| W      | Move (translate)       |
| E      | Rotate                 |
| R      | Scale                  |
| F      | Focus selected         |
| Delete | Delete selected entity |

## Console Commands

| Command       | Description             |
| ------------- | ----------------------- |
| `help`        | Show available commands |
| `clear`       | Clear console           |
| `stats`       | Show render statistics  |
| `entities`    | Count entities          |
| `save`        | Serialize current scene |
| `select <id>` | Select entity by ID     |
| `fps`         | Show current FPS        |

## License

MIT
