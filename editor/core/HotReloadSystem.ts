// ============================================================
// FluxionJS V3 — Hot Reload System
// Standalone class that subscribes to engine.events and reloads
// changed assets (materials, textures, fonts, models, scripts, FUI)
// at runtime without a scene reload.
//
// Extracted from EditorLogic.tsx / AssetHotReload component.
// ============================================================

import * as THREE from 'three';
import type { Engine } from '../../src/core/Engine';
import { projectManager } from '../../src/project/ProjectManager';
import { getFileSystem } from '../../src/filesystem';
import { toLocalUrl } from '../../src/utils/localUrl';
import { markDirty } from '../../src/core/ECS';
import { invalidateScript } from '../../src/scripting/ScriptCompiler';
import { applyMaterialsToModel } from '../../src/assets/FluxMeshData';
import { MetaRegistry } from '../../src/meta/MetaRegistry';
import { ApiEmitter } from '../../src/meta/ApiEmitter';
import { loadDeferredFluxMesh, loadDeferredModel } from '../../src/project/SceneSerializer';

export class HotReloadSystem {
  private recentReloads = new Map<string, number>();
  private readonly DEDUP_MS = 500;

  constructor(private engine: Engine) {}

  /**
   * Subscribe to engine.events and window events.
   * Returns a cleanup function suitable for React useEffect.
   */
  attach(): () => void {
    // ── Window path: 'fluxion:material-changed' (editor UI saves, bypass file watcher) ──
    const materialChangedHandler = async (e: Event) => {
      const path = (e as CustomEvent).detail?.path as string | undefined;
      if (!path || this.isDuplicate(path)) return;
      await this.reloadMaterial(path);
    };
    window.addEventListener('fluxion:material-changed', materialChangedHandler);

    // ── engine.events path: file watcher changes via AssetHotReloadService bridge ──
    const unsub = this.engine.events.on<{ path: string; assetType: string; eventType: string }>(
      'asset:changed',
      (detail) => void this.assetChangedHandler(detail),
    );

    return () => {
      window.removeEventListener('fluxion:material-changed', materialChangedHandler);
      unsub();
      this.recentReloads.clear();
    };
  }

  // ── Dedup ──

  private isDuplicate(path: string): boolean {
    const now = Date.now();
    const last = this.recentReloads.get(path);
    if (last && now - last < this.DEDUP_MS) return true;
    this.recentReloads.set(path, now);
    if (this.recentReloads.size > 100) {
      for (const [k, v] of this.recentReloads) {
        if (now - v > this.DEDUP_MS * 2) this.recentReloads.delete(k);
      }
    }
    return false;
  }

  // ── Helpers ──

  private norm(p: string): string {
    return p.replace(/\\/g, '/');
  }

  private getSubsystems() {
    const ecs = this.engine.ecs;
    const assets = this.engine.getSubsystem('assets') as any;
    const materials = this.engine.getSubsystem('materials') as any;
    const renderer = this.engine.getSubsystem('renderer') as any;
    return { ecs, assets, materials, renderer };
  }

  private async resolveRelPath(absPath: string): Promise<string | null> {
    try {
      return projectManager.relativePath(absPath);
    } catch { return null; }
  }

  private buildLoadTexture(matDir: string, assets: any) {
    return async (texRelPath: string): Promise<THREE.Texture> => {
      let texAbsPath: string;
      if (/^[A-Z]:/i.test(texRelPath) || texRelPath.startsWith('/') || texRelPath.startsWith('file://')) {
        texAbsPath = texRelPath;
      } else if (texRelPath.startsWith('..')) {
        texAbsPath = `${matDir}/${texRelPath}`;
      } else {
        try { texAbsPath = projectManager.resolvePath(texRelPath); } catch { texAbsPath = `${matDir}/${texRelPath}`; }
      }
      const texUrl = toLocalUrl(texAbsPath);
      return assets.loadTexture(texUrl);
    };
  }

  // ── Main dispatcher ──

  private async assetChangedHandler(detail: { path: string; assetType: string; eventType: string }): Promise<void> {
    if (!detail?.path) return;
    const { path, assetType, eventType } = detail;
    if (this.isDuplicate(path)) return;

    if (eventType === 'delete') {
      if (assetType === 'script') {
        try {
          MetaRegistry.removeScriptFile(path);
          if (projectManager.projectDir) {
            await ApiEmitter.emit(projectManager.projectDir);
          }
        } catch { /* non-fatal */ }
      }
      return;
    }

    switch (assetType) {
      case 'material':
      case 'visual_material':
        await this.reloadMaterial(path);
        break;
      case 'texture':
        await this.reloadTexture(path);
        break;
      case 'font':
        await this.reloadFont(path);
        break;
      case 'model':
      case 'mesh':
        await this.reloadModel(path);
        break;
      case 'fui':
        await this.reloadFui(path);
        break;
      case 'script':
        await this.reloadScript(path);
        break;
      // shader, scene, json, prefab — no live reload needed
    }
  }

  // ── Material reload ──

  private async reloadMaterial(changedPath: string): Promise<void> {
    const { ecs, assets, materials } = this.getSubsystems();
    if (!assets || !materials) return;

    const nChanged = this.norm(changedPath);
    const isVisualMat = nChanged.endsWith('.fluxvismat');
    assets.invalidateCache(changedPath);
    if (nChanged !== changedPath) assets.invalidateCache(nChanged);

    const relPath = await this.resolveRelPath(changedPath);
    const nRel = relPath ? this.norm(relPath) : null;
    const matDir = nChanged.substring(0, nChanged.lastIndexOf('/'));
    const loadTexture = this.buildLoadTexture(matDir, assets);

    const createMaterial = async (): Promise<THREE.Material | null> => {
      try {
        if (isVisualMat) {
          const visData = await assets.loadAsset(nChanged, 'visual_material');
          if (!visData) return null;
          return materials.createFromVisualMat(visData, loadTexture, nChanged);
        } else {
          const matData = await assets.loadAsset(nChanged, 'material');
          if (!matData) return null;
          return materials.createFromFluxMat(matData, loadTexture, nChanged);
        }
      } catch { return null; }
    };

    const allMR = ecs.getComponentsOfType<any>('MeshRenderer');
    for (const [, mr] of allMR) {
      if (!mr.mesh) continue;

      const mrMatPath = mr.materialPath;
      const nMrMat = mrMatPath ? this.norm(mrMatPath) : null;
      if (nMrMat && (nMrMat === nChanged || nMrMat === nRel)) {
        const mat = await createMaterial();
        if (mat) {
          if (mr.mesh instanceof THREE.Mesh) {
            mr.mesh.material = mat;
          } else if (mr.mesh instanceof THREE.Group) {
            mr.mesh.traverse((child: THREE.Object3D) => {
              if (child instanceof THREE.Mesh) child.material = mat;
            });
          }
        }
        continue;
      }

      if (!mr.modelPath?.toLowerCase().endsWith('.fluxmesh') || !mr.mesh) continue;

      const slotsToUpdate: number[] = [];
      let fluxSlots: any[] | null = null;

      try {
        const fs = getFileSystem();
        const absFluxmesh = this.norm(projectManager.resolvePath(mr.modelPath));
        const fluxmeshDir = absFluxmesh.substring(0, absFluxmesh.lastIndexOf('/'));
        const text = await fs.readFile(absFluxmesh);
        const data = JSON.parse(text);
        fluxSlots = (data.materialSlots || []).map((s: any) => ({
          ...s,
          defaultMaterial: s.defaultMaterial && !/^[A-Z]:/i.test(s.defaultMaterial) && !s.defaultMaterial.startsWith('/')
            ? `${fluxmeshDir}/${s.defaultMaterial}`
            : s.defaultMaterial,
        }));
      } catch { continue; }

      if (!fluxSlots) continue;

      const overrides = mr.materialSlots || [];
      for (let idx = 0; idx < fluxSlots.length; idx++) {
        const override = overrides.find((o: any) => o.slotIndex === idx);
        if (override) {
          const oPath = this.norm(override.materialPath || '');
          let oAbs: string | null = null;
          try {
            oAbs = this.norm(projectManager.resolvePath(override.materialPath));
          } catch {}
          if (oPath === nChanged || oPath === nRel || oAbs === nChanged) slotsToUpdate.push(idx);
        } else {
          const defMat = this.norm(fluxSlots[idx].defaultMaterial || '');
          if (defMat === nChanged || defMat === nRel) slotsToUpdate.push(idx);
        }
      }

      if (slotsToUpdate.length === 0) continue;

      const mat = await createMaterial();
      if (mat) {
        for (const slotIdx of slotsToUpdate) {
          const slot = fluxSlots[slotIdx];
          if (slot) applyMaterialsToModel(mr.mesh, [slot], [mat]);
        }
      }
    }
  }

  // ── Texture reload: sprites, cookie lights, environment, MeshRenderer ──

  private async reloadTexture(changedPath: string): Promise<void> {
    const { ecs, assets } = this.getSubsystems();
    if (!assets) return;

    const nChanged = this.norm(changedPath);
    assets.invalidateCache(changedPath);
    const relPath = await this.resolveRelPath(changedPath);
    const nRel = relPath ? this.norm(relPath) : null;

    const pathEq = (p: string | undefined) => {
      if (!p) return false;
      const np = this.norm(p);
      return np === nChanged || np === nRel;
    };

    // Sprites — null out spriteTexture so renderer re-loads next frame
    const sprites = ecs.getComponentsOfType<any>('Sprite');
    for (const [, sprite] of sprites) {
      if (pathEq(sprite.texturePath)) {
        if (sprite.spriteTexture) {
          sprite.spriteTexture.dispose();
          sprite.spriteTexture = null;
        }
      }
    }

    // Lights — null out cookie texture so LightSystem re-loads
    const lights = ecs.getComponentsOfType<any>('Light');
    for (const [, light] of lights) {
      if (pathEq(light.cookieTexturePath)) {
        if (light.cookieTexture) {
          light.cookieTexture.dispose();
          light.cookieTexture = null;
        }
        if (light.light instanceof THREE.SpotLight) {
          light.light.map = null;
        }
      }
    }

    // Environment skybox — mark for re-apply
    const envs = ecs.getComponentsOfType<any>('Environment');
    for (const [, env] of envs) {
      if (pathEq(env.skyboxPath) || (env.skyboxFaces && Object.values(env.skyboxFaces).some((p: unknown) => pathEq(p as string | undefined)))) {
        env._appliedSkybox = null;
      }
    }

    // MeshRenderer materials that reference this texture — force material re-build
    const reloadedMats = new Set<string>();
    const allMR = ecs.getComponentsOfType<any>('MeshRenderer');
    for (const [, mr] of allMR) {
      if (!mr.mesh) continue;
      let hasTexRef = false;
      const checkMat = (mat: THREE.Material) => {
        if (hasTexRef) return;
        const m = mat as any;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap', 'alphaMap']) {
          const tex = m[key] as THREE.Texture | null;
          if (tex && tex.image?.src) {
            const src = decodeURIComponent(tex.image.src.replace(/^https?:\/\/asset\.localhost\//i, '').replace('file:///', '').replace(/\\/g, '/'));
            if (src === nChanged || src === nRel) {
              hasTexRef = true;
              return;
            }
          }
        }
      };
      if (mr.mesh instanceof THREE.Mesh && mr.mesh.material) {
        const mats = Array.isArray(mr.mesh.material) ? mr.mesh.material : [mr.mesh.material];
        mats.forEach(checkMat);
      } else if (mr.mesh instanceof THREE.Group) {
        mr.mesh.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(checkMat);
          }
        });
      }
      if (hasTexRef && mr.materialPath && !reloadedMats.has(mr.materialPath)) {
        reloadedMats.add(mr.materialPath);
        await this.reloadMaterial(mr.materialPath);
      }
    }
  }

  // ── Font reload: clear fontCache, force text rebuild ──

  private async reloadFont(changedPath: string): Promise<void> {
    const { ecs, renderer } = this.getSubsystems();
    if (!renderer) return;

    const nChanged = this.norm(changedPath);
    const relPath = await this.resolveRelPath(changedPath);
    const nRel = relPath ? this.norm(relPath) : null;

    const textSystem = renderer.systems?.find?.((s: any) => s.name === 'TextRendererSync');
    if (textSystem) {
      textSystem.fontCache?.delete?.(changedPath);
      textSystem.fontCache?.delete?.(relPath);
      textSystem.loadingFonts?.delete?.(changedPath);
      textSystem.loadingFonts?.delete?.(relPath);
    }

    const textComps = ecs.getComponentsOfType<any>('TextRenderer');
    for (const [, tc] of textComps) {
      const nFont = tc.fontPath ? this.norm(tc.fontPath) : null;
      if (nFont && (nFont === nChanged || nFont === nRel)) {
        tc._cacheKey = '';
      }
    }
  }

  // ── Model / mesh live reload (replaces cache-only) ──

  private async reloadModel(changedPath: string): Promise<void> {
    const { ecs, assets } = this.getSubsystems();
    if (!assets) return;
    assets.invalidateCache(changedPath);

    const nChanged = this.norm(changedPath);
    const relPath = await this.resolveRelPath(changedPath);
    const nRel = relPath ? this.norm(relPath) : null;

    const allMR = ecs.getComponentsOfType<any>('MeshRenderer');
    for (const [, mr] of allMR) {
      if (!mr.mesh || !mr.modelPath) continue;
      let mrAbs: string | null = null;
      try { mrAbs = this.norm(projectManager.resolvePath(mr.modelPath)); } catch {}
      const mrNorm = this.norm(mr.modelPath);
      if (mrNorm !== nChanged && mrNorm !== nRel && mrAbs !== nChanged) continue;

      // Live swap using SceneSerializer functions (handle cloning, materials, shadows, UV)
      if (nChanged.endsWith('.fluxmesh')) {
        await loadDeferredFluxMesh(this.engine, mr, mr.modelPath);
      } else {
        await loadDeferredModel(this.engine, mr, mr.modelPath);
      }
    }
  }

  // ── Script reload: invalidate compiler cache + destroy instances ──

  private async reloadScript(changedPath: string): Promise<void> {
    const { ecs } = this.getSubsystems();
    if (!ecs) return;
    const nChanged = this.norm(changedPath);
    invalidateScript(changedPath);
    const scriptComps = ecs.getComponentsOfType<any>('Script');
    for (const [, comp] of scriptComps) {
      for (const entry of (comp.scripts ?? [])) {
        let abs = entry.path;
        try { abs = projectManager.resolvePath(entry.path); } catch {}
        if (this.norm(abs) !== nChanged && this.norm(entry.path) !== nChanged) continue;
        const inst = comp._instances?.get(entry.path);
        try { inst?.onDestroy?.(); } catch {}
        comp._instances?.delete(entry.path);
        comp._loading?.delete(entry.path);
      }
    }

    // Regenerate IDE API files so the changed script's type info is up to date
    try {
      if (projectManager.projectDir) {
        await MetaRegistry.refreshScriptFile(changedPath);
        await ApiEmitter.emit(projectManager.projectDir);
      }
    } catch { /* non-fatal — IDE files are best-effort */ }
  }

  // ── FUI reload: mark all FuiComponents referencing this file as dirty ──

  private async reloadFui(changedPath: string): Promise<void> {
    const { ecs } = this.getSubsystems();
    if (!ecs) return;
    const nChanged = this.norm(changedPath);
    const fuiComps = ecs.getComponentsOfType<any>('Fui');
    for (const [, comp] of fuiComps) {
      if (!comp.fuiPath) continue;
      let abs = comp.fuiPath;
      try { abs = projectManager.resolvePath(comp.fuiPath); } catch {}
      if (this.norm(abs) === nChanged || this.norm(comp.fuiPath) === nChanged) {
        markDirty(comp);
      }
    }
  }
}
