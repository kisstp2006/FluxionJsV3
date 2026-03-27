// ============================================================
// FluxionJS V3 — Asset Type Registry
// Pluggable file type system — ext→type→loader→icon→inspector.
// Inspired by Stride IAssetImporter and ezEngine DocumentManager.
// ============================================================

import type { IFileSystem } from '../filesystem/FileSystem';
import type { AssetMeta } from './AssetMeta';
import type { FluxMeshData, FluxMeshMaterialSlot, FluxMeshSubMeshRef } from './FluxMeshData';

// ── Types ──

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  generate: (className: string) => string;
}

export interface AssetTypeDefinition {
  /** Unique type id, e.g. 'texture', 'model', 'audio', 'scene' */
  type: string;
  /** Human-readable name shown in UI */
  displayName: string;
  /** Emoji / icon char for the asset browser */
  icon: string;
  /** File extensions this type handles (lowercase, with dot) */
  extensions: string[];
  /** Grouping category in the asset browser sidebar */
  category: string;
  /** Optional accent colour for the asset browser badge */
  color?: string;
  /**
   * Optional loader — given a filesystem and absolute path, returns
   * the loaded asset data. When not provided the AssetManager will
   * fall back to its built-in THREE.js loaders.
   */
  loader?: (fs: IFileSystem, path: string) => Promise<any>;
  /**
   * Optional factory that creates a new default asset file.
   * When present, a "New <displayName>" option appears in the
   * Asset Browser context menu.
   */
  createDefault?: (fs: IFileSystem, dirPath: string, name: string, templateId?: string) => Promise<string>;
  /** Optional list of creation templates shown in a picker dialog. */
  templates?: ScriptTemplate[];
  /** Show in import dialog? */
  canImport?: boolean;
  /** Electron file dialog filters for importing */
  importFilters?: { name: string; extensions: string[] }[];
  /** Whether the asset is serialisable into scene data */
  serializable?: boolean;
  /**
   * Optional post-import processor. Runs after a file is copied
   * into the project and its .fluxmeta is written. Use for
   * validation, thumbnail generation, metadata enrichment, etc.
   */
  importProcessor?: (fs: IFileSystem, importedPath: string, meta: AssetMeta) => Promise<void>;
  /**
   * Default import settings for this type (merged into .fluxmeta
   * importSettings when no overrides are provided).
   */
  defaultImportSettings?: Record<string, unknown>;
}

// ── Registry ──

class AssetTypeRegistryImpl {
  private types = new Map<string, AssetTypeDefinition>();
  private extMap = new Map<string, AssetTypeDefinition>();

  register(def: AssetTypeDefinition): void {
    this.types.set(def.type, def);
    for (const ext of def.extensions) {
      this.extMap.set(ext.toLowerCase(), def);
    }
  }

  getByType(type: string): AssetTypeDefinition | undefined {
    return this.types.get(type);
  }

  getByExtension(ext: string): AssetTypeDefinition | undefined {
    return this.extMap.get(ext.toLowerCase());
  }

  getAll(): AssetTypeDefinition[] {
    return [...this.types.values()];
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const def of this.types.values()) cats.add(def.category);
    return [...cats];
  }

  /** Types that have a createDefault factory → "New X" menu items */
  getCreatable(): AssetTypeDefinition[] {
    return this.getAll().filter((d) => d.createDefault != null);
  }

  /** Types available for import */
  getImportable(): AssetTypeDefinition[] {
    return this.getAll().filter((d) => d.canImport);
  }

  /** Resolve a filename to its AssetTypeDefinition (or undefined) */
  resolveFile(filename: string): AssetTypeDefinition | undefined {
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return undefined;
    return this.getByExtension(filename.substring(dot));
  }
}

export const AssetTypeRegistry = new AssetTypeRegistryImpl();

// ── Built-in type registrations ──

AssetTypeRegistry.register({
  type: 'texture',
  displayName: 'Texture',
  icon: 'image',
  extensions: ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg', '.gif', '.tga', '.hdr', '.exr'],
  category: 'Textures',
  color: '#4fc3f7',
  canImport: true,
  importFilters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'gif', 'tga', 'hdr', 'exr'] }],
});

AssetTypeRegistry.register({
  type: 'model',
  displayName: '3D Model',
  icon: 'model',
  extensions: ['.glb', '.gltf', '.fbx', '.obj'],
  category: 'Models',
  color: '#81c784',
  canImport: true,
  importFilters: [{ name: '3D Models', extensions: ['glb', 'gltf', 'fbx', 'obj'] }],
  defaultImportSettings: { scale: 1, generateCollider: false },
  importProcessor: async (_fs, importedPath, meta) => {
    const ext = importedPath.substring(importedPath.lastIndexOf('.')).toLowerCase();
    const format = ext === '.glb' ? 'glb' : ext === '.gltf' ? 'gltf' : ext === '.fbx' ? 'fbx' : 'obj';
    meta.importSettings = { ...meta.importSettings, format };

    // --- Generate .fluxmesh + default .fluxmat files (with full material & texture extraction) ---
    try {
      const THREEModule = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const {
        extractFluxMatFromMaterial,
        getTextureRefsFromMaterial,
        saveTextureToFile,
      } = await import('./FluxMeshData');
      const { createAssetMeta, writeAssetMeta } = await import('./AssetMeta');

      // Load the model to inspect sub-meshes
      const fileUrl = `file:///${importedPath.replace(/\\/g, '/')}`;
      let root: InstanceType<typeof THREEModule.Object3D>;
      if (format === 'fbx') {
        root = await new Promise<InstanceType<typeof THREEModule.Group>>((res, rej) => new FBXLoader().load(fileUrl, res, undefined, rej));
      } else if (format === 'obj') {
        root = await new Promise<InstanceType<typeof THREEModule.Group>>((res, rej) => new OBJLoader().load(fileUrl, res, undefined, rej));
      } else {
        const gltf = await new Promise<any>((res, rej) => new GLTFLoader().load(fileUrl, res, undefined, rej));
        root = gltf.scene;
      }

      // Collect child meshes in depth-first order
      const meshes: InstanceType<typeof THREEModule.Mesh>[] = [];
      root.traverse((child: any) => {
        if (child.isMesh) meshes.push(child);
      });

      // Collect ALL unique materials across all meshes, including multi-material arrays.
      // Each unique THREE.Material reference becomes its own slot.
      interface MatRef { meshIndex: number; materialIndex: number; }
      const matToRefs = new Map<any, MatRef[]>();
      for (let i = 0; i < meshes.length; i++) {
        const rawMat = meshes[i].material;
        const mats: any[] = Array.isArray(rawMat) ? rawMat : [rawMat];
        for (let j = 0; j < mats.length; j++) {
          const m = mats[j];
          if (!matToRefs.has(m)) matToRefs.set(m, []);
          matToRefs.get(m)!.push({ meshIndex: i, materialIndex: j });
        }
      }

      // Derive paths
      const dir = importedPath.substring(0, importedPath.lastIndexOf('/'));
      const baseName = importedPath.substring(importedPath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');

      // Textures subdirectory (created lazily only if textures are found)
      const texturesDir = `${dir}/${baseName}_textures`;
      let texturesDirCreated = false;

      // Track already-saved textures to avoid saving the same texture twice
      const savedTextureCache = new Map<InstanceType<typeof THREEModule.Texture>, string>();

      const slots: FluxMeshMaterialSlot[] = [];
      const usedFileNames = new Set<string>();
      let slotIdx = 0;

      for (const [mat, refs] of matToRefs) {
        const slotName = mat.name || `Material_${slotIdx}`;
        // Build a unique safe filename (append index if name collides)
        let safeName = slotName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const candidateFileName = `${baseName}_${safeName}.fluxmat`;
        if (usedFileNames.has(candidateFileName)) {
          safeName = `${safeName}_${slotIdx}`;
        }
        usedFileNames.add(`${baseName}_${safeName}.fluxmat`);

        const fluxmatPath = `${dir}/${baseName}_${safeName}.fluxmat`;

        // Extract PBR properties from the THREE material
        const matJson = extractFluxMatFromMaterial(mat);

        // --- Extract and save textures from the material ---
        const texRefs = getTextureRefsFromMaterial(mat);
        for (const texRef of texRefs) {
          // Save UV transform from original texture if non-default
          const srcTex = texRef.texture;
          if (srcTex.repeat.x !== 1 || srcTex.repeat.y !== 1 ||
              srcTex.offset.x !== 0 || srcTex.offset.y !== 0 ||
              srcTex.rotation !== 0) {
            if (!matJson.uvTransforms) matJson.uvTransforms = {};
            const t: Record<string, number | number[]> = {};
            if (srcTex.repeat.x !== 1 || srcTex.repeat.y !== 1) t.repeat = [srcTex.repeat.x, srcTex.repeat.y];
            if (srcTex.offset.x !== 0 || srcTex.offset.y !== 0) t.offset = [srcTex.offset.x, srcTex.offset.y];
            if (srcTex.rotation !== 0) t.rotation = srcTex.rotation;
            matJson.uvTransforms[texRef.fluxmatKey] = t;
          }

          // Check if this texture was already saved (shared across materials)
          const cachedPath = savedTextureCache.get(texRef.texture);
          if (cachedPath) {
            matJson[texRef.fluxmatKey] = cachedPath;
            continue;
          }

          // Ensure textures directory exists
          if (!texturesDirCreated) {
            try { await _fs.mkdir(texturesDir); } catch { /* may already exist */ }
            texturesDirCreated = true;
          }

          const texFileName = `${baseName}_${safeName}_${texRef.label}.png`;
          const texSavePath = `${texturesDir}/${texFileName}`;

          const saved = await saveTextureToFile(
            texRef.texture,
            texSavePath,
            (path, data) => _fs.writeBinary(path, data),
          );

          if (saved) {
            // Store relative path from .fluxmat location to the texture
            const relTexPath = `${baseName}_textures/${texFileName}`;
            matJson[texRef.fluxmatKey] = relTexPath;
            savedTextureCache.set(texRef.texture, relTexPath);

            // Write .fluxmeta for the extracted texture
            const texMeta = createAssetMeta('texture', texSavePath, '', '', 0);
            await writeAssetMeta(_fs, texSavePath, texMeta);
          }
        }

        // Write the .fluxmat file
        await _fs.writeFile(fluxmatPath, JSON.stringify(matJson, null, 2));

        // Write .fluxmeta for the .fluxmat
        const matMeta = createAssetMeta('material', fluxmatPath, '', '', 0);
        await writeAssetMeta(_fs, fluxmatPath, matMeta);

        // Build slot with both legacy indices and precise mappings
        const subMeshIndices = [...new Set(refs.map(r => r.meshIndex))];
        const subMeshMappings: FluxMeshSubMeshRef[] = refs.map(r => ({
          meshIndex: r.meshIndex,
          materialIndex: r.materialIndex,
        }));
        const fluxmatFileName = `${baseName}_${safeName}.fluxmat`;
        slots.push({
          name: slotName,
          subMeshIndices,
          subMeshMappings,
          defaultMaterial: fluxmatFileName,
        });
        slotIdx++;
      }

      // If model had no meshes, create a single default slot
      if (slots.length === 0) {
        const fluxmatPath = `${dir}/${baseName}_Default.fluxmat`;
        await _fs.writeFile(fluxmatPath, JSON.stringify({ type: 'standard', color: [0.8, 0.8, 0.8], roughness: 0.5, metalness: 0.0 }, null, 2));
        const matMeta = createAssetMeta('material', fluxmatPath, '', '', 0);
        await writeAssetMeta(_fs, fluxmatPath, matMeta);
        slots.push({ name: 'Default', subMeshIndices: [], defaultMaterial: `${baseName}_Default.fluxmat` });
      }

      // Write .fluxmesh
      const fluxmeshPath = `${dir}/${baseName}.fluxmesh`;
      const modelFileName = importedPath.substring(importedPath.lastIndexOf('/') + 1);
      const importScale = (meta.importSettings.scale as number | undefined) ?? 1;
      const fluxmeshData: FluxMeshData = {
        version: 1,
        sourceModel: modelFileName,
        materialSlots: slots,
        ...(importScale !== 1 ? { importScale } : {}),
      };
      await _fs.writeFile(fluxmeshPath, JSON.stringify(fluxmeshData, null, 2));

      // Write .fluxmeta for the .fluxmesh
      const meshMeta = createAssetMeta('mesh', fluxmeshPath, '', '', 0);
      await writeAssetMeta(_fs, fluxmeshPath, meshMeta);

      // Store .fluxmesh path in the model's meta
      meta.importSettings.fluxmeshPath = fluxmeshPath;

      console.log(`[AssetTypeRegistry] Generated .fluxmesh with ${slots.length} material slot(s), ${savedTextureCache.size} texture(s) extracted`);
    } catch (err) {
      console.warn('[AssetTypeRegistry] .fluxmesh generation failed, model imported without mesh data:', err);
    }

    // Write updated meta back
    const metaPath = importedPath + '.fluxmeta';
    await _fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  },
});

AssetTypeRegistry.register({
  type: 'mesh',
  displayName: 'Flux Mesh',
  icon: 'model',
  extensions: ['.fluxmesh'],
  category: 'Models',
  color: '#66bb6a',
  loader: async (fs, path) => {
    const text = await fs.readFile(path);
    return JSON.parse(text) as FluxMeshData;
  },
  serializable: false,
});

AssetTypeRegistry.register({
  type: 'audio',
  displayName: 'Audio',
  icon: 'audio',
  extensions: ['.ogg', '.mp3', '.wav', '.flac'],
  category: 'Audio',
  color: '#ffb74d',
  canImport: true,
  importFilters: [{ name: 'Audio Files', extensions: ['ogg', 'mp3', 'wav', 'flac'] }],
});

AssetTypeRegistry.register({
  type: 'font',
  displayName: 'Font',
  icon: 'text',
  extensions: ['.ttf', '.otf', '.woff', '.woff2'],
  category: 'Fonts',
  color: '#ce93d8',
  canImport: true,
  importFilters: [{ name: 'Font Files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
});

AssetTypeRegistry.register({
  type: 'scene',
  displayName: 'Scene',
  icon: 'scene',
  extensions: ['.fluxscene'],
  category: 'Scenes',
  color: '#ba68c8',
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fluxscene`;
    const emptyScene = JSON.stringify(
      { name: safeName, entities: [], editorCamera: null },
      null,
      2,
    );
    await fs.writeFile(filePath, emptyScene);
    return filePath;
  },
  serializable: false,
});

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'empty',
    name: 'Empty Script',
    description: 'Minimal class with no lifecycle methods',
    icon: '📄',
    generate: (cls) => `export default class ${cls} extends FluxionScript {\n\n}\n`,
  },
  {
    id: 'default',
    name: 'Default Script',
    description: 'Basic template with onStart, onUpdate and onDestroy',
    icon: '⚡',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  // Public fields appear as editable properties in the Inspector`,
      `  // speed = 5.0;`,
      ``,
      `  onStart() {`,
      `    this.log('${cls} started');`,
      `  }`,
      ``,
      `  onUpdate(dt) {`,
      `    // Called every frame — dt is delta time in seconds`,
      `  }`,
      ``,
      `  onDestroy() {}`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'movement',
    name: 'Movement Controller',
    description: 'WASD movement using Transform',
    icon: '🎮',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  speed = 5.0;`,
      ``,
      `  onUpdate(dt) {`,
      `    const tf = this.transform;`,
      `    if (!tf) return;`,
      ``,
      `    const move = new Vec3(`,
      `      this.input.getAxis('KeyA', 'KeyD'),`,
      `      0,`,
      `      this.input.getAxis('KeyW', 'KeyS'),`,
      `    );`,
      ``,
      `    if (move.lengthSq() > 0) {`,
      `      move.normalize().multiplyScalar(this.speed * dt);`,
      `      tf.position.add(move);`,
      `    }`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'rotator',
    name: 'Rotator',
    description: 'Continuously rotates an object',
    icon: '🔄',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  /** Degrees per second on each axis */`,
      `  speedX = 0;`,
      `  speedY = 45;`,
      `  speedZ = 0;`,
      ``,
      `  onUpdate(dt) {`,
      `    const tf = this.transform;`,
      `    if (!tf) return;`,
      `    tf.rotation.x += Mathf.Deg2Rad * this.speedX * dt;`,
      `    tf.rotation.y += Mathf.Deg2Rad * this.speedY * dt;`,
      `    tf.rotation.z += Mathf.Deg2Rad * this.speedZ * dt;`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'camera-follow',
    name: 'Camera Follow',
    description: 'Smoothly follows a target entity by name',
    icon: '📷',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  targetName = 'Player';`,
      `  offset = new Vec3(0, 5, -10);`,
      `  smoothSpeed = 5.0;`,
      ``,
      `  private _target = -1;`,
      ``,
      `  onStart() {`,
      `    const found = this.find(this.targetName);`,
      `    if (found !== undefined) this._target = found;`,
      `    else this.warn('Target "' + this.targetName + '" not found');`,
      `  }`,
      ``,
      `  onUpdate(dt) {`,
      `    if (this._target < 0) return;`,
      `    const targetTf = this.getComponentOf(this._target, 'Transform');`,
      `    const myTf = this.transform;`,
      `    if (!targetTf || !myTf) return;`,
      ``,
      `    const desired = targetTf.position.clone().add(this.offset);`,
      `    myTf.position.lerp(desired, Mathf.clamp01(this.smoothSpeed * dt));`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'physics-object',
    name: 'Physics Object',
    description: 'Applies forces via Rigidbody on input',
    icon: '🧱',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  forceMagnitude = 10.0;`,
      `  jumpForce = 5.0;`,
      ``,
      `  private _rb = null;`,
      ``,
      `  onStart() {`,
      `    this._rb = this.getComponent('Rigidbody');`,
      `    if (!this._rb) this.warn('No Rigidbody component found');`,
      `  }`,
      ``,
      `  onFixedUpdate(dt) {`,
      `    if (!this._rb) return;`,
      ``,
      `    const h = this.input.getAxis('KeyA', 'KeyD');`,
      `    const v = this.input.getAxis('KeyS', 'KeyW');`,
      ``,
      `    if (h !== 0 || v !== 0) {`,
      `      const force = new Vec3(h, 0, v).normalize().multiplyScalar(this.forceMagnitude);`,
      `      this._rb.applyForce?.(force.x, force.y, force.z);`,
      `    }`,
      ``,
      `    if (this.input.isKeyPressed('Space')) {`,
      `      this._rb.applyImpulse?.(0, this.jumpForce, 0);`,
      `    }`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'coroutine',
    name: 'Coroutine Example',
    description: 'Demonstrates generator-based coroutines',
    icon: '⏱️',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  onStart() {`,
      `    this.startCoroutine(this.introSequence());`,
      `  }`,
      ``,
      `  *introSequence() {`,
      `    this.log('Sequence started');`,
      `    yield { seconds: 1 };`,
      `    this.log('1 second passed');`,
      `    yield { seconds: 2 };`,
      `    this.log('3 seconds total — done');`,
      `  }`,
      ``,
      `  onUpdate(dt) {}`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'fui-hud-file',
    name: 'FUI HUD (file)',
    description: 'Loads a .fui file and updates labels each frame',
    icon: '🖥️',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  /** Path to the .fui file (project-relative) */`,
      `  fuiFile = 'UI/HUD.fui';`,
      ``,
      `  score = 0;`,
      `  health = 100;`,
      ``,
      `  onStart() {`,
      `    // Load the .fui document. The entity must have a FuiComponent.`,
      `    this.ui.load(this.fuiFile);`,
      ``,
      `    // React to the "restart" button click defined in the .fui`,
      `    this.ui.onButtonClick('restart_btn', () => {`,
      `      this.score = 0;`,
      `      this.health = 100;`,
      `      this.updateHUD();`,
      `    });`,
      `  }`,
      ``,
      `  onUpdate(dt) {`,
      `    // Example: accumulate score over time`,
      `    this.score += dt * 10;`,
      `    this.updateHUD();`,
      `  }`,
      ``,
      `  private updateHUD() {`,
      `    this.ui.setText('score_label', 'Score: ' + Math.floor(this.score));`,
      `    this.ui.setText('health_label', 'HP: ' + this.health);`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'fui-hud-code',
    name: 'FUI HUD (code)',
    description: 'Builds a HUD entirely in code using FuiBuilder',
    icon: '🎨',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  score = 0;`,
      `  health = 100;`,
      ``,
      `  onStart() {`,
      `    // Build the HUD document with the fluent builder.`,
      `    // No .fui file needed — the UI is defined in code.`,
      `    const doc = new FuiBuilder(400, 120)`,
      `      .panel('bg', 0, 0, 400, 120, { bg: '#00000099', radius: 10 })`,
      `      .label('score_label', 16, 12, 370, 40, 'Score: 0', {`,
      `        color: '#ffe066', fontSize: 28, parent: 'bg',`,
      `      })`,
      `      .label('health_label', 16, 60, 200, 32, 'HP: 100', {`,
      `        color: '#66ff99', fontSize: 22, parent: 'bg',`,
      `      })`,
      `      .button('restart_btn', 260, 56, 120, 36, 'Restart', {`,
      `        bg: '#3a86ff', radius: 6, fontSize: 16, parent: 'bg',`,
      `      })`,
      `      .build();`,
      ``,
      `    // Attach the document to the FuiComponent on this entity.`,
      `    this.ui.create(doc);`,
      ``,
      `    // Listen for button clicks`,
      `    this.ui.onButtonClick('restart_btn', () => {`,
      `      this.score = 0;`,
      `      this.health = 100;`,
      `    });`,
      `  }`,
      ``,
      `  onUpdate(dt) {`,
      `    this.score += dt * 10;`,
      `    this.ui.setText('score_label', 'Score: ' + Math.floor(this.score));`,
      `    this.ui.setText('health_label', 'HP: ' + this.health);`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'fps-character',
    name: 'FPS Character Controller',
    description: 'First-person character: WASD to move, Space to jump, Shift to run, click to capture mouse. Assign a Camera entity in the Inspector.',
    icon: '🧍',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  // ── Inspector properties ────────────────────────────────────`,
      `  /** Drag a Camera entity here in the Inspector. */`,
      `  camera = new EntityRef('Camera');`,
      ``,
      `  /** Mouse look sensitivity (degrees per pixel). */`,
      `  sensitivity = 0.15;`,
      `  /** Maximum look-up / look-down angle in degrees. */`,
      `  maxPitch = 85;`,
      `  /** Height offset from the character pivot to the camera eye. */`,
      `  headHeight = 1.6;`,
      ``,
      `  // ── Private state (not shown in Inspector) ───────────────────`,
      `  _yaw   = 0;   // horizontal look angle (degrees)`,
      `  _pitch = 0;   // vertical look angle (degrees)`,
      ``,
      `  onStart() {`,
      `    // Sync yaw from current character rotation so it doesn't snap`,
      `    const tf = this.transform;`,
      `    if (tf) this._yaw = tf.rotation.y * Mathf.Rad2Deg;`,
      ``,
      `    // Lock the pointer automatically on play`,
      `    this.input.lockPointer();`,
      `    this.log('FPS Character ready — click viewport to capture mouse, Escape to release.');`,
      `  }`,
      ``,
      `  onUpdate(dt) {`,
      `    // ── Pointer lock: click anywhere to re-lock ─────────────────`,
      `    if (this.input.isMousePressed(0) && !this.input.isPointerLocked()) {`,
      `      this.input.lockPointer();`,
      `    }`,
      ``,
      `    if (!this.input.isPointerLocked()) return; // ignore input when unlocked`,
      ``,
      `    // ── Mouse look ──────────────────────────────────────────────`,
      `    this._yaw   -= this.input.mouseDelta.x * this.sensitivity;`,
      `    this._pitch -= this.input.mouseDelta.y * this.sensitivity;`,
      `    this._pitch  = Mathf.clamp(this._pitch, -this.maxPitch, this.maxPitch);`,
      ``,
      `    // Rotate the character body horizontally (yaw only)`,
      `    const charTf = this.transform;`,
      `    if (charTf) {`,
      `      charTf.rotation.set(0, this._yaw * Mathf.Deg2Rad, 0, 'YXZ');`,
      `    }`,
      ``,
      `    // Rotate the camera entity vertically (pitch only)`,
      `    const camTf = this.getComponentOf(this.camera.entity, 'Transform');`,
      `    if (camTf) {`,
      `      camTf.rotation.set(this._pitch * Mathf.Deg2Rad, 0, 0, 'YXZ');`,
      `    }`,
      ``,
      `    // ── Run / Crouch toggles ─────────────────────────────────────`,
      `    const sprint = this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight');`,
      `    this.physics.setRunning(sprint);`,
      ``,
      `    const crouch = this.input.isKeyDown('ControlLeft') || this.input.isKeyDown('KeyC');`,
      `    this.physics.crouch(crouch);`,
      `  }`,
      ``,
      `  onFixedUpdate(dt) {`,
      `    // ── Movement (physics rate) ─────────────────────────────────`,
      `    const h = this.input.getAxis('KeyA', 'KeyD');   // strafe`,
      `    const v = this.input.getAxis('KeyS', 'KeyW');   // forward/back`,
      `    this.physics.move(h, -v); // note: -v because forward is -Z in Three.js`,
      ``,
      `    // ── Jump ────────────────────────────────────────────────────`,
      `    if (this.input.isKeyPressed('Space')) {`,
      `      this.physics.jump();`,
      `    }`,
      ``,
      `    // ── Camera position: follow character + eye height ──────────`,
      `    const charTf = this.transform;`,
      `    const camTf  = this.getComponentOf(this.camera.entity, 'Transform');`,
      `    if (charTf && camTf) {`,
      `      camTf.position.set(`,
      `        charTf.position.x,`,
      `        charTf.position.y + this.headHeight,`,
      `        charTf.position.z,`,
      `      );`,
      `    }`,
      `  }`,
      ``,
      `  onDestroy() {`,
      `    if (this.input.isPointerLocked()) this.input.unlockPointer();`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
  {
    id: 'flying-camera',
    name: 'Flying Camera',
    description: 'Free-fly camera: WASD + QE to move, right-click to look',
    icon: '🎥',
    generate: (cls) => [
      `export default class ${cls} extends FluxionScript {`,
      `  /** Movement speed in units/second */`,
      `  speed = 10.0;`,
      `  /** Sprint multiplier when holding Shift */`,
      `  sprintMultiplier = 3.0;`,
      `  /** Mouse look sensitivity (degrees per pixel) */`,
      `  sensitivity = 0.15;`,
      `  /** Maximum pitch angle in degrees */`,
      `  maxPitch = 89.0;`,
      ``,
      `  private _yaw = 0;`,
      `  private _pitch = 0;`,
      ``,
      `  onStart() {`,
      `    const tf = this.transform;`,
      `    if (tf) {`,
      `      // Initialise from current rotation so the camera doesn't snap`,
      `      this._yaw   = tf.rotation.y * Mathf.Rad2Deg;`,
      `      this._pitch = tf.rotation.x * Mathf.Rad2Deg;`,
      `    }`,
      `    this.log('FlyingCamera ready — right-click to capture mouse');`,
      `  }`,
      ``,
      `  onUpdate(dt) {`,
      `    const tf = this.transform;`,
      `    if (!tf) return;`,
      ``,
      `    // ── Pointer lock toggle (right mouse button) ──────────────`,
      `    if (this.input.isMousePressed(2)) {`,
      `      if (this.input.isPointerLocked()) {`,
      `        this.input.unlockPointer();`,
      `      } else {`,
      `        this.input.lockPointer();`,
      `      }`,
      `    }`,
      ``,
      `    // ── Mouse look (only while pointer is locked) ─────────────`,
      `    if (this.input.isPointerLocked()) {`,
      `      this._yaw   -= this.input.mouseDelta.x * this.sensitivity;`,
      `      this._pitch -= this.input.mouseDelta.y * this.sensitivity;`,
      `      this._pitch  = Mathf.clamp(this._pitch, -this.maxPitch, this.maxPitch);`,
      `      // YXZ order: yaw first, then pitch — prevents gimbal lock`,
      `      tf.rotation.set(`,
      `        this._pitch * Mathf.Deg2Rad,`,
      `        this._yaw   * Mathf.Deg2Rad,`,
      `        0,`,
      `        'YXZ',`,
      `      );`,
      `    }`,
      ``,
      `    // ── Keyboard movement ─────────────────────────────────────`,
      `    const sprint = this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight');`,
      `    const currentSpeed = this.speed * (sprint ? this.sprintMultiplier : 1.0);`,
      ``,
      `    const localMove = new Vec3(`,
      `      this.input.getAxis('KeyA', 'KeyD'),   // left / right`,
      `      this.input.getAxis('KeyQ', 'KeyE'),   // down / up (world Y)`,
      `      this.input.getAxis('KeyW', 'KeyS'),   // forward / back`,
      `    );`,
      ``,
      `    if (localMove.lengthSq() > 0) {`,
      `      localMove.normalize().multiplyScalar(currentSpeed * dt);`,
      `      // Rotate the XZ movement by the camera's yaw so "forward" always`,
      `      // points where the camera faces horizontally`,
      `      const yawQ = new Quat().setFromAxisAngle(`,
      `        new Vec3(0, 1, 0),`,
      `        this._yaw * Mathf.Deg2Rad,`,
      `      );`,
      `      const worldMove = new Vec3(localMove.x, 0, localMove.z).applyQuaternion(yawQ);`,
      `      worldMove.y += localMove.y; // vertical is always world-space`,
      `      tf.position.add(worldMove);`,
      `    }`,
      `  }`,
      ``,
      `  onDestroy() {`,
      `    if (this.input.isPointerLocked()) this.input.unlockPointer();`,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  },
];

AssetTypeRegistry.register({
  type: 'script',
  displayName: 'Script',
  icon: 'script',
  extensions: ['.ts', '.js'],
  category: 'Scripts',
  color: '#7986cb',
  serializable: false,
  templates: SCRIPT_TEMPLATES,
  createDefault: async (fs, dirPath, name, templateId) => {
    const className = name.replace(/[^a-zA-Z0-9_$]/g, '_');
    const template = SCRIPT_TEMPLATES.find((t) => t.id === templateId) ?? SCRIPT_TEMPLATES[1];
    const content = template.generate(className);
    const filePath = `${dirPath}/${name}.ts`;
    await fs.writeFile(filePath, content);
    return filePath;
  },
});

AssetTypeRegistry.register({
  type: 'material',
  displayName: 'Material',
  icon: 'material',
  extensions: ['.mat', '.fluxmat'],
  category: 'Materials',
  color: '#f06292',
  loader: async (fs, path) => {
    const text = await fs.readFile(path);
    return JSON.parse(text);
  },
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fluxmat`;
    const defaultMat = JSON.stringify(
      { type: 'standard', color: [1, 1, 1], roughness: 0.5, metalness: 0.0 },
      null,
      2,
    );
    await fs.writeFile(filePath, defaultMat);
    return filePath;
  },
  serializable: true,
});

AssetTypeRegistry.register({
  type: 'prefab',
  displayName: 'Prefab',
  icon: 'prefab',
  extensions: ['.fluxprefab'],
  category: 'Prefabs',
  color: '#4db6ac',
  serializable: true,
});

AssetTypeRegistry.register({
  type: 'shader',
  displayName: 'Shader',
  icon: 'shader',
  extensions: ['.glsl', '.vert', '.frag', '.wgsl'],
  category: 'Shaders',
  color: '#aed581',
});

AssetTypeRegistry.register({
  type: 'visual_material',
  displayName: 'Visual Material',
  icon: 'material',
  extensions: ['.fluxvismat'],
  category: 'Materials',
  color: '#e040fb',
  loader: async (fs, path) => {
    const text = await fs.readFile(path);
    return JSON.parse(text);
  },
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fluxvismat`;
    const { createDefaultGraph } = await import('../materials/VisualMaterialGraph');
    const defaultFile = JSON.stringify(
      { version: 1, name: safeName, graph: createDefaultGraph() },
      null,
      2,
    );
    await fs.writeFile(filePath, defaultFile);
    return filePath;
  },
  serializable: true,
});

AssetTypeRegistry.register({
  type: 'json',
  displayName: 'JSON Data',
  icon: 'json',
  extensions: ['.json'],
  category: 'Data',
});

AssetTypeRegistry.register({
  type: 'fui',
  displayName: 'UI (FUI)',
  icon: 'json',
  extensions: ['.fui'],
  category: 'UI',
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fui`;
    const defaultFui = JSON.stringify(
      {
        version: 1,
        mode: 'screen',
        canvas: { width: 800, height: 600 },
        root: {
          id: 'root',
          type: 'panel',
          rect: { x: 0, y: 0, w: 800, h: 600 },
          style: { backgroundColor: '#0b1020' },
          children: [
            {
              id: 'title',
              type: 'label',
              rect: { x: 20, y: 20, w: 760, h: 60 },
              text: 'Hello FUI',
              style: { color: '#ffffff', fontSize: 36, align: 'center' },
            },
            {
              id: 'btn1',
              type: 'button',
              rect: { x: 300, y: 140, w: 200, h: 60 },
              text: 'Click Me',
              style: {
                backgroundColor: '#2b3a67',
                borderColor: '#6b8cff',
                borderWidth: 2,
                radius: 10,
                textColor: '#ffffff',
                fontSize: 24,
                align: 'center',
                padding: 8,
              },
            },
          ],
        },
      },
      null,
      2,
    );
    await fs.writeFile(filePath, defaultFui);
    return filePath;
  },
});
