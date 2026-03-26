// ============================================================
// FluxionJS V3 — Missing Asset Reference Scanner
// Scans .fluxscene and .fluxmat files for broken asset paths.
// ============================================================

import { type IFileSystem, pathJoin } from '../filesystem';

export interface MissingRef {
  /** Absolute path of the file containing the broken reference */
  sourceFile: string;
  /** Field name that holds the broken path (e.g. "materialPath", "albedoMap") */
  field: string;
  /** The stored path value as it appears in the file */
  referencedPath: string;
  /** The resolved absolute path that was checked */
  resolvedPath: string;
}

// ── Public API ─────────────────────────────────────────────

/**
 * Scan all .fluxscene and .fluxmat files under the project directory
 * and return every reference to an asset that does not exist on disk.
 */
export async function scanMissingRefs(
  fs: IFileSystem,
  projectDir: string,
): Promise<MissingRef[]> {
  const missing: MissingRef[] = [];

  // Collect all .fluxscene files (Scenes/ + Assets/ recursively)
  const sceneDirs = [pathJoin(projectDir, 'Scenes'), pathJoin(projectDir, 'Assets')];
  const sceneFiles: string[] = [];
  for (const dir of sceneDirs) {
    sceneFiles.push(...await findFiles(fs, dir, '.fluxscene'));
  }

  for (const f of sceneFiles) {
    await scanSceneFile(fs, f, projectDir, missing);
  }

  // Collect all .fluxmat files in Assets/
  const matFiles = await findFiles(fs, pathJoin(projectDir, 'Assets'), '.fluxmat');
  for (const f of matFiles) {
    await scanMatFile(fs, f, missing);
  }

  return missing;
}

// ── Private helpers ─────────────────────────────────────────

async function findFiles(fs: IFileSystem, dir: string, ext: string): Promise<string[]> {
  const out: string[] = [];
  const exists = await fs.exists(dir).catch(() => false);
  if (!exists) return out;
  const entries = await fs.readDir(dir).catch(() => [] as Array<{ name: string; isDirectory: boolean; path: string }>);
  for (const e of entries) {
    if (e.isDirectory) {
      out.push(...await findFiles(fs, e.path, ext));
    } else if (e.name.endsWith(ext)) {
      out.push(e.path);
    }
  }
  return out;
}

async function checkPath(
  fs: IFileSystem,
  resolvedPath: string,
  sourceFile: string,
  field: string,
  storedPath: string,
  out: MissingRef[],
): Promise<void> {
  if (!resolvedPath || !storedPath) return;
  const exists = await fs.exists(resolvedPath).catch(() => false);
  if (!exists) {
    out.push({ sourceFile, field, referencedPath: storedPath, resolvedPath });
  }
}

async function scanSceneFile(
  fs: IFileSystem,
  filePath: string,
  projectDir: string,
  out: MissingRef[],
): Promise<void> {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await fs.readFile(filePath)) as Record<string, unknown>;
  } catch {
    return;
  }

  const walkEntities = async (list: unknown[]): Promise<void> => {
    for (const entity of list) {
      if (!entity || typeof entity !== 'object') continue;
      const e = entity as Record<string, unknown>;
      const comps = (e.components ?? {}) as Record<string, Record<string, unknown>>;

      // MeshRenderer
      const mr = comps['MeshRenderer'];
      if (mr) {
        if (mr.modelPath) await checkPath(fs, pathJoin(projectDir, mr.modelPath as string), filePath, 'modelPath', mr.modelPath as string, out);
        if (mr.materialPath) await checkPath(fs, pathJoin(projectDir, mr.materialPath as string), filePath, 'materialPath', mr.materialPath as string, out);
        if (Array.isArray(mr.materialSlots)) {
          for (const slot of mr.materialSlots as Array<Record<string, unknown>>) {
            if (slot.materialPath) await checkPath(fs, pathJoin(projectDir, slot.materialPath as string), filePath, 'materialSlots.materialPath', slot.materialPath as string, out);
          }
        }
      }

      // AudioSource
      const audio = comps['AudioSource'];
      if (audio?.clip) await checkPath(fs, pathJoin(projectDir, audio.clip as string), filePath, 'clip', audio.clip as string, out);

      // Sprite
      const sprite = comps['Sprite'];
      if (sprite?.texturePath) await checkPath(fs, pathJoin(projectDir, sprite.texturePath as string), filePath, 'texturePath', sprite.texturePath as string, out);

      // TextRenderer
      const text = comps['TextRenderer'];
      if (text?.fontPath) await checkPath(fs, pathJoin(projectDir, text.fontPath as string), filePath, 'fontPath', text.fontPath as string, out);

      // ParticleEmitter
      const particles = comps['ParticleEmitter'];
      if (particles?.texture) await checkPath(fs, pathJoin(projectDir, particles.texture as string), filePath, 'texture', particles.texture as string, out);

      // Light (cookie texture)
      const light = comps['Light'];
      if (light?.cookieTexturePath) await checkPath(fs, pathJoin(projectDir, light.cookieTexturePath as string), filePath, 'cookieTexturePath', light.cookieTexturePath as string, out);

      // Environment
      const env = comps['Environment'];
      if (env) {
        if (env.skyboxPath) await checkPath(fs, pathJoin(projectDir, env.skyboxPath as string), filePath, 'skyboxPath', env.skyboxPath as string, out);
        if (env.skyboxFaces && typeof env.skyboxFaces === 'object') {
          for (const [face, p] of Object.entries(env.skyboxFaces as Record<string, string>)) {
            if (p) await checkPath(fs, pathJoin(projectDir, p), filePath, `skyboxFaces.${face}`, p, out);
          }
        }
      }

      // CSGBrush
      const csg = comps['CSGBrush'];
      if (csg?.materialPath) await checkPath(fs, pathJoin(projectDir, csg.materialPath as string), filePath, 'materialPath', csg.materialPath as string, out);

      // Recurse children
      if (Array.isArray(e.children) && e.children.length > 0) {
        await walkEntities(e.children as unknown[]);
      }
    }
  };

  await walkEntities((json.entities ?? []) as unknown[]);
}

async function scanMatFile(
  fs: IFileSystem,
  filePath: string,
  out: MissingRef[],
): Promise<void> {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await fs.readFile(filePath)) as Record<string, unknown>;
  } catch {
    return;
  }

  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  const texFields = ['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

  for (const field of texFields) {
    const p = json[field] as string | undefined;
    if (p) {
      await checkPath(fs, pathJoin(dir, p), filePath, field, p, out);
    }
  }
}
