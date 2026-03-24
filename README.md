# FluxionJS V2

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

| Technology | Purpose |
|---|---|
| **TypeScript** | Type-safe engine & editor code |
| **Three.js** | WebGL/WebGPU 3D renderer |
| **Rapier3D** | WASM physics engine |
| **Electron** | Desktop editor shell |
| **Webpack** | Build system |
| **Web Audio API** | Spatialized 3D audio |

## Quick Start

```bash
# Install dependencies
npm install

# Build & launch editor
npm start

# Development mode (hot rebuild)
npm run dev
```

## Editor Shortcuts

| Key | Action |
|---|---|
| Q | Select tool |
| W | Move (translate) |
| E | Rotate |
| R | Scale |
| F | Focus selected |
| Delete | Delete selected entity |

## Console Commands

| Command | Description |
|---|---|
| `help` | Show available commands |
| `clear` | Clear console |
| `stats` | Show render statistics |
| `entities` | Count entities |
| `save` | Serialize current scene |
| `select <id>` | Select entity by ID |
| `fps` | Show current FPS |

## License

MIT
