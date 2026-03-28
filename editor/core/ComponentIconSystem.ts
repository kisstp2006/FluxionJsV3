// ============================================================
// FluxionJS V3 — Component Billboard Icon System
// Renders a camera-facing SVG icon in the viewport for each
// entity whose primary (highest-priority) component has an
// icon defined.  Invisible during play mode.
//
// Design:
//   • ONE THREE.Sprite per entity (added to a shared group)
//   • SVG rasterised to CanvasTexture once per component type
//     and cached — zero redundant GPU uploads
//   • Sprite scale adjusted each frame so icons keep a constant
//     apparent screen size regardless of camera distance
//   • Clicking a sprite triggers entity selection via the
//     __editorEntityId property read in Viewport's click handler
// ============================================================

import * as THREE from 'three';
import type { EntityId, ECSManager } from '../../src/core/ECS';
import { TransformComponent } from '../../src/core/Components';

// ── Raw SVG imports (webpack asset/source) ───────────────────
import cameraSvg     from '../ui/icons/camera.svg';
import sunSvg        from '../ui/icons/sun.svg';
import cpuSvg        from '../ui/icons/cpu.svg';
import windSvg       from '../ui/icons/wind.svg';
import volume2Svg    from '../ui/icons/volume-2.svg';
import terminalSvg   from '../ui/icons/terminal.svg';
import crosshairSvg  from '../ui/icons/crosshair.svg';
import hexagonSvg    from '../ui/icons/hexagon.svg';
import globeSvg      from '../ui/icons/globe.svg';
import moonSvg       from '../ui/icons/moon.svg';
import filmSvg       from '../ui/icons/film.svg';
import layoutSvg     from '../ui/icons/layout.svg';
import imageSvg      from '../ui/icons/image.svg';
import zapSvg        from '../ui/icons/zap.svg';
import codeSvg       from '../ui/icons/code.svg';

// ── Component type → icon + colour ──────────────────────────
// MeshRenderer and CSGBrush are intentionally excluded:
// entities with visible geometry don't need a billboard.
const ICON_MAP: Record<string, { svg: string; cssColor: string }> = {
  Camera:             { svg: cameraSvg,    cssColor: 'var(--accent)' },
  Light:              { svg: sunSvg,       cssColor: 'var(--accent-yellow)' },
  Rigidbody:          { svg: cpuSvg,       cssColor: 'var(--accent-red)' },
  ParticleEmitter:    { svg: windSvg,      cssColor: 'var(--accent-yellow)' },
  AudioSource:        { svg: volume2Svg,   cssColor: 'var(--accent)' },
  Script:             { svg: terminalSvg,  cssColor: 'var(--text-muted)' },
  CharacterController:{ svg: crosshairSvg, cssColor: 'var(--accent-red)' },
  Collider:           { svg: hexagonSvg,   cssColor: 'var(--accent-red)' },
  Environment:        { svg: globeSvg,     cssColor: 'var(--accent)' },
  FogVolume:          { svg: moonSvg,      cssColor: 'var(--text-muted)' },
  Animation:          { svg: filmSvg,      cssColor: 'var(--accent-yellow)' },
  Fui:                { svg: layoutSvg,    cssColor: 'var(--accent)' },
  Sprite:             { svg: imageSvg,     cssColor: 'var(--accent-purple)' },
  TextRenderer:       { svg: codeSvg,      cssColor: 'var(--accent)' },
  CSGBrush:           { svg: zapSvg,       cssColor: 'var(--accent-purple)' },
};

// First matching entry wins — highest-priority component type first
const PRIORITY_ORDER = Object.keys(ICON_MAP);

// ── Screen-size constant (fraction of viewport height) ───────
const SCREEN_FRACTION = 0.055;   // ~5.5% of viewport height
const MIN_WORLD_SIZE  = 0.05;

// ── Helpers ──────────────────────────────────────────────────

function resolveCssVar(color: string): string {
  if (!color.startsWith('var(')) return color;
  const name = color.slice(4, -1).trim();
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
  return resolved || '#aaaaaa';
}

const _wp = new THREE.Vector3();

// ── Main class ───────────────────────────────────────────────

export class ComponentIconSystem {
  /** Sprites indexed by entity.  Visible only in editor mode. */
  private readonly sprites   = new Map<EntityId, THREE.Sprite>();
  /** One CanvasTexture per component typeId — shared across all entities. */
  private readonly texCache  = new Map<string, THREE.Texture>();
  /** Prevents duplicate async loads for the same typeId. */
  private readonly pending   = new Set<string>();
  private readonly group:    THREE.Group;
  private readonly scene:    THREE.Object3D;

  constructor(threeScene: THREE.Object3D) {
    this.scene = threeScene;
    this.group = new THREE.Group();
    this.group.name = '__componentIconBillboards';
    threeScene.add(this.group);
  }

  /**
   * Call every editor frame.
   * @param ecs         - active ECSManager
   * @param getObject   - engine.renderer.getObject
   * @param camera      - editor perspective camera (for screen-size scaling)
   * @param isPlaying   - hide all icons during play mode
   */
  update(
    ecs:       ECSManager,
    getObject: (id: EntityId) => THREE.Object3D | undefined,
    camera:    THREE.PerspectiveCamera,
    isPlaying: boolean,
  ): void {
    this.group.visible = !isPlaying;
    if (isPlaying) return;

    const seen = new Set<EntityId>();

    for (const entityId of ecs.getAllEntities()) {
      const match = this._findMatch(ecs, entityId);
      if (!match) continue;

      seen.add(entityId);

      let sprite = this.sprites.get(entityId);
      const currentType = sprite
        ? (sprite as any).__editorIconTypeId as string | undefined
        : undefined;

      // (Re)create sprite when entity gains a higher-priority component
      if (!sprite || currentType !== match.typeId) {
        if (sprite) {
          this.group.remove(sprite);
          (sprite.material as THREE.SpriteMaterial).dispose();
        }
        sprite = this._makeSprite(match.typeId, match.svg, match.cssColor);
        (sprite as any).__editorEntityId  = entityId;
        (sprite as any).__editorIconTypeId = match.typeId;
        this.sprites.set(entityId, sprite);
        this.group.add(sprite);
      }

      // Sync world position
      const obj = getObject(entityId);
      if (obj) {
        obj.getWorldPosition(_wp);
        sprite.position.copy(_wp);
      } else {
        const t = ecs.getComponent<TransformComponent>(entityId, 'Transform');
        if (t) sprite.position.copy(t.position);
      }

      // Constant apparent screen size
      const dist = sprite.position.distanceTo(camera.position);
      const s = Math.max(
        dist * Math.tan(camera.fov * (Math.PI / 360)) * SCREEN_FRACTION,
        MIN_WORLD_SIZE,
      );
      sprite.scale.setScalar(s);
    }

    // Remove sprites for destroyed/no-longer-matching entities
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        this.group.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).dispose();
        this.sprites.delete(id);
      }
    }
  }

  /**
   * Raycast against billboard sprites.
   * Returns the entity id if a billboard was hit, otherwise null.
   */
  hitTest(raycaster: THREE.Raycaster): EntityId | null {
    if (!this.group.visible) return null;
    const hits = raycaster.intersectObjects(this.group.children, false);
    for (const hit of hits) {
      const id = (hit.object as any).__editorEntityId as EntityId | undefined;
      if (id !== undefined) return id;
    }
    return null;
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const sprite of this.sprites.values()) {
      (sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.sprites.clear();
    for (const tex of this.texCache.values()) tex.dispose();
    this.texCache.clear();
  }

  // ── Private ────────────────────────────────────────────────

  private _findMatch(
    ecs: ECSManager,
    entityId: EntityId,
  ): { typeId: string; svg: string; cssColor: string } | null {
    for (const typeId of PRIORITY_ORDER) {
      if (ecs.hasComponent(entityId, typeId)) {
        return { typeId, ...ICON_MAP[typeId] };
      }
    }
    return null;
  }

  private _makeSprite(typeId: string, svg: string, cssColor: string): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      transparent:  true,
      depthTest:    false,
      depthWrite:   false,
      sizeAttenuation: true,
      // Apply cached texture immediately if already loaded
      map: this.texCache.get(typeId) ?? null,
    });

    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 998;

    if (!this.texCache.has(typeId)) {
      this._loadTexture(typeId, svg, cssColor).then(tex => {
        if (!tex) return;
        material.map = tex;
        material.needsUpdate = true;
      });
    }

    return sprite;
  }

  private _loadTexture(
    typeId:   string,
    svg:      string,
    cssColor: string,
  ): Promise<THREE.Texture | null> {
    if (this.texCache.has(typeId)) {
      return Promise.resolve(this.texCache.get(typeId)!);
    }
    if (this.pending.has(typeId)) return Promise.resolve(null);
    this.pending.add(typeId);

    const color = resolveCssVar(cssColor);

    // Replace CSS currentColor placeholders with the resolved hex colour
    const colored = svg
      .replace(/stroke="currentColor"/g,   `stroke="${color}"`)
      .replace(/fill="currentColor"/g,     `fill="${color}"`)
      .replace(/stroke: ?currentColor/g,   `stroke: ${color}`)
      .replace(/fill: ?currentColor/g,     `fill: ${color}`);

    return new Promise<THREE.Texture | null>(resolve => {
      const SIZE = 128;
      const canvas = document.createElement('canvas');
      canvas.width  = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;

      const img = new Image();

      img.onload = () => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        this.texCache.set(typeId, tex);
        this.pending.delete(typeId);

        // Patch any existing sprites of this type that are awaiting texture
        for (const sprite of this.sprites.values()) {
          if ((sprite as any).__editorIconTypeId === typeId) {
            (sprite.material as THREE.SpriteMaterial).map = tex;
            (sprite.material as THREE.SpriteMaterial).needsUpdate = true;
          }
        }

        resolve(tex);
      };

      img.onerror = () => {
        this.pending.delete(typeId);
        resolve(null);
      };

      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
    });
  }
}
