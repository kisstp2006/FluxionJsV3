// ============================================================
// FluxionJS V3 — Meta Registry
// Builds an EngineDef by reading existing @component/@field
// decorator metadata from ComponentRegistry, plus dynamically
// discovered user script classes via registerApi().
//
// Flow:
//   ComponentRegistry  ──┐
//   registerApi(dir)   ──┼──► build() ──► EngineDef ──► ApiEmitter
//   (_userDefs map)    ──┘
// ============================================================

import { ComponentRegistry } from '../core/ComponentRegistry';
import { DebugConsole } from '../core/DebugConsole';
import { getFileSystem } from '../filesystem';
import type { IFileSystem, DirEntry } from '../filesystem/FileSystem';
import type { EngineDef, ComponentDef, FieldDef } from './MetaTypes';
import { ScriptScanner, type ScannedClass } from './ScriptScanner';

const KNOWN_FIELD_TYPES = new Set([
  'number', 'slider', 'boolean', 'string', 'select',
  'color', 'vector3', 'vector2', 'euler', 'asset', 'array', 'union',
]);

export class MetaRegistry {
  private static _cached: EngineDef | null = null;
  /** User-discovered script / custom component definitions from registerApi(). */
  private static _userDefs: Map<string, ComponentDef> = new Map();

  /** Maps filePath → set of typeIds defined in that file (for incremental updates). */
  private static _fileToTypeIds: Map<string, Set<string>> = new Map();
  /** Maps filePath → absolute paths it imports. */
  private static _fileImports: Map<string, string[]> = new Map();
  /** Maps filePath → set of files that import it (reverse index). */
  private static _importedBy: Map<string, Set<string>> = new Map();
  /** Source cache used by refreshScriptFile (populated during registerApi). */
  private static _sourceCache: Map<string, string> = new Map();

  /** Warnings accumulated during the last build() call. */
  private static _buildWarnings: string[] = [];

  // ── Public API ────────────────────────────────────────────────

  /**
   * Build (or return cached) EngineDef from all registered components
   * merged with any user-discovered defs added via registerApi().
   */
  static build(force = false): EngineDef {
    if (this._cached && !force) return this._cached;

    if (force) this._buildWarnings = [];

    const components: ComponentDef[] = [];

    for (const reg of ComponentRegistry.getAll()) {
      const { meta, fields } = reg;

      const serializable = fields.filter(f => !f.noSerialize);

      const fieldDefs: FieldDef[] = serializable.map(f => ({
        key:          f.key,
        type:         f.type,
        label:        f.label ?? f.key,
        optional:     f.visibleIf !== undefined,
        defaultValue: f.defaultValue,
        min:          f.min,
        max:          f.max,
        step:         f.step,
        options:      f.options,
        assetType:    Array.isArray(f.assetType)
                        ? f.assetType[0]
                        : f.assetType,
        group:        f.group,
        description:  f.description,
        itemType:     f.itemType,
        unionTypes:   f.unionTypes,
        readOnly:     f.readOnly,
        tupleTypes:   f.tupleTypes,
      }));

      // Validate field types
      for (const fd of fieldDefs) {
        if (!KNOWN_FIELD_TYPES.has(fd.type)) {
          const msg = `[MetaRegistry] Unknown field type "${fd.type}" on ${meta.typeId}.${fd.key}`;
          DebugConsole.LogWarning(msg);
          this._buildWarnings.push(msg);
        }
      }

      if (meta.deprecated) {
        this._buildWarnings.push(`[MetaRegistry] ${meta.typeId} is deprecated.`);
      }

      components.push({
        typeId:      meta.typeId,
        displayName: meta.displayName,
        category:    meta.category ?? 'General',
        icon:        meta.icon,
        requires:    meta.requires ?? [],
        fields:      fieldDefs,
        deprecated:  meta.deprecated,
      });
    }

    // Merge user-discovered definitions — skip if typeId already present
    for (const def of this._userDefs.values()) {
      if (!components.some(c => c.typeId === def.typeId)) {
        // Validate user def field types too
        for (const fd of def.fields) {
          if (!KNOWN_FIELD_TYPES.has(fd.type)) {
            const msg = `[MetaRegistry] Unknown field type "${fd.type}" on ${def.typeId}.${fd.key}`;
            DebugConsole.LogWarning(msg);
            this._buildWarnings.push(msg);
          }
        }
        if (def.deprecated) {
          this._buildWarnings.push(`[MetaRegistry] ${def.typeId} is deprecated.`);
        }
        components.push(def);
      }
    }

    // Sort by category then displayName for deterministic output
    components.sort((a, b) =>
      a.category.localeCompare(b.category) ||
      a.displayName.localeCompare(b.displayName),
    );

    this._cached = { version: '3', components };
    return this._cached;
  }

  /** Warnings accumulated during the most recent forced build(). */
  static getLastBuildWarnings(): readonly string[] {
    return this._buildWarnings;
  }

  /**
   * Scan a project directory for user script files, extract class/field
   * definitions via static AST analysis (no code execution), and store
   * them in _userDefs for inclusion in the next build() call.
   *
   * Inspired by the Welder Engine's MetaDatabase::AddLibrary() pattern —
   * instead of registering a C++ type library, we scan a scripts directory.
   *
   * @param dirPath  Absolute path to scan (e.g. projectDir + '/Assets/Scripts')
   */
  static async registerApi(dirPath: string): Promise<void> {
    const fs = getFileSystem();

    let files: string[];
    try {
      files = await this._collectScriptFiles(fs, dirPath);
    } catch (err) {
      DebugConsole.LogWarning(`[MetaRegistry] Cannot scan "${dirPath}": ${err}`);
      return;
    }

    const newDefs = new Map<string, ComponentDef>();
    const allClasses: ScannedClass[] = [];
    const sourceByFile = new Map<string, string>();

    for (const filePath of files) {
      let source: string;
      try {
        source = await fs.readFile(filePath);
      } catch {
        continue;
      }
      sourceByFile.set(filePath, source);

      let classes: ScannedClass[];
      try {
        classes = filePath.endsWith('.lua')
          ? ScriptScanner.scanLuaSource(source, filePath)
          : ScriptScanner.scanSource(source, filePath);
      } catch (err) {
        DebugConsole.LogWarning(`[MetaRegistry] Failed to scan "${filePath}": ${err}`);
        continue;
      }

      allClasses.push(...classes);
    }

    // Detect class name collisions — qualify with parent dir stem when needed
    const classNameCount = new Map<string, number>();
    for (const cls of allClasses) {
      classNameCount.set(cls.className, (classNameCount.get(cls.className) ?? 0) + 1);
    }

    for (const cls of allClasses) {
      const def = this._classToComponentDef(cls, classNameCount);
      newDefs.set(def.typeId, def);
    }

    this._userDefs = newDefs;
    this._cached = null;

    // Build incremental tracking indexes
    this._rebuildImportIndex(files, allClasses, sourceByFile);

    DebugConsole.Log(
      `[MetaRegistry] Registered ${newDefs.size} user-defined script(s) from "${dirPath}"`,
    );
  }

  /**
   * Re-scan a single script file and update _userDefs incrementally.
   * Also rescans all files that transitively import the changed file.
   * Used by hot reload instead of a full registerApi() call.
   */
  static async refreshScriptFile(filePath: string): Promise<void> {
    const fs = getFileSystem();
    const norm = (p: string) => p.replace(/\\/g, '/');
    const normPath = norm(filePath);

    // Collect all files to rescan (changed file + transitive importers)
    const toRescan = this._transitiveDependents(normPath);

    let rescannedCount = 0;

    for (const fp of toRescan) {
      let source: string;
      try {
        source = await fs.readFile(fp);
      } catch {
        // File no longer exists — remove its entries
        this._removeFileEntries(fp);
        continue;
      }

      // Remove old typeIds for this file
      const oldTypeIds = this._fileToTypeIds.get(fp) ?? new Set();
      for (const typeId of oldTypeIds) {
        this._userDefs.delete(typeId);
      }

      // Re-scan
      let classes: ScannedClass[];
      try {
        classes = fp.endsWith('.lua')
          ? ScriptScanner.scanLuaSource(source, fp)
          : ScriptScanner.scanSource(source, fp);
      } catch {
        classes = [];
      }

      // Rebuild typeId set for this file
      const newTypeIds = new Set<string>();
      // Build collision map from existing defs + new classes (simple: no collision recalc across files)
      for (const cls of classes) {
        const def = this._classToComponentDef(cls);
        this._userDefs.set(def.typeId, def);
        newTypeIds.add(def.typeId);
      }
      this._fileToTypeIds.set(fp, newTypeIds);

      // Update import index for this file
      this._updateFileImports(fp, source);
      this._sourceCache.set(fp, source);
      rescannedCount++;
    }

    this._cached = null;

    DebugConsole.Log(
      `[MetaRegistry] Partial refresh: ${rescannedCount} file(s) rescanned`,
    );
  }

  /**
   * Remove a deleted script file from the registry.
   * Cascades to files that depended on it (removes stale defs).
   */
  static removeScriptFile(filePath: string): void {
    const norm = (p: string) => p.replace(/\\/g, '/');
    const normPath = norm(filePath);

    // Also remove dependents that imported the deleted file
    const dependents = this._transitiveDependents(normPath);
    for (const fp of dependents) {
      this._removeFileEntries(fp);
    }
    this._removeFileEntries(normPath);

    this._cached = null;
    DebugConsole.Log(`[MetaRegistry] Removed script: "${filePath}"`);
  }

  /** Clear user-discovered definitions — call on project close. */
  static clearUserDefs(): void {
    this._userDefs.clear();
    this._fileToTypeIds.clear();
    this._fileImports.clear();
    this._importedBy.clear();
    this._sourceCache.clear();
    this._cached = null;
  }

  /** Invalidate cache — next build() / get() will rebuild. */
  static invalidate(): void {
    this._cached = null;
    DebugConsole.Log('[MetaRegistry] Cache invalidated — will rebuild on next build() call.');
  }

  /**
   * Return cached EngineDef (builds first time).
   * Prefer this over build() in generator/emit pipelines.
   */
  static get(): EngineDef {
    return this._cached ?? this.build();
  }

  // ── Private helpers ──────────────────────────────────────────

  /** Recursively collect .ts, .js, and .lua file paths under dirPath. */
  private static async _collectScriptFiles(
    fs: IFileSystem,
    dirPath: string,
  ): Promise<string[]> {
    const results: string[] = [];

    let entries: DirEntry[];
    try {
      entries = await fs.readDir(dirPath);
    } catch {
      return results; // directory doesn't exist — return empty
    }

    for (const entry of entries) {
      if (entry.isDirectory) {
        const sub = await this._collectScriptFiles(fs, entry.path);
        results.push(...sub);
      } else if (
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.js') ||
        entry.name.endsWith('.lua')
      ) {
        results.push(entry.path);
      }
    }

    return results;
  }

  /** Build import indexes from a full scan result. */
  private static _rebuildImportIndex(
    files: string[],
    allClasses: ScannedClass[],
    sourceByFile: Map<string, string>,
  ): void {
    this._fileToTypeIds.clear();
    this._fileImports.clear();
    this._importedBy.clear();
    this._sourceCache.clear();

    // Build _fileToTypeIds from scanned classes
    for (const cls of allClasses) {
      const fp = cls.filePath.replace(/\\/g, '/');
      if (!this._fileToTypeIds.has(fp)) this._fileToTypeIds.set(fp, new Set());
      const typeId = cls.componentMeta?.typeId ?? `Script:${cls.className}`;
      this._fileToTypeIds.get(fp)!.add(typeId);
    }

    // Build import index for each file
    for (const filePath of files) {
      const source = sourceByFile.get(filePath) ?? '';
      this._updateFileImports(filePath, source);
      this._sourceCache.set(filePath, source);
    }
  }

  /** Update import entries for a single file (call after rescan). */
  private static _updateFileImports(filePath: string, source: string): void {
    const fp = filePath.replace(/\\/g, '/');

    // Remove stale reverse-index entries for this file
    const oldImports = this._fileImports.get(fp) ?? [];
    for (const imp of oldImports) {
      this._importedBy.get(imp)?.delete(fp);
    }

    if (filePath.endsWith('.lua')) {
      // Lua files don't have TS imports
      this._fileImports.set(fp, []);
      return;
    }

    const imports = ScriptScanner.extractImports(source, fp);
    this._fileImports.set(fp, imports);

    for (const imp of imports) {
      if (!this._importedBy.has(imp)) this._importedBy.set(imp, new Set());
      this._importedBy.get(imp)!.add(fp);
    }
  }

  /**
   * Return the set of files that transitively depend on `start` (including `start` itself).
   * Cycle-safe via visited set.
   */
  private static _transitiveDependents(
    start: string,
    visited: Set<string> = new Set(),
  ): Set<string> {
    if (visited.has(start)) return visited;
    visited.add(start);
    for (const importer of this._importedBy.get(start) ?? []) {
      this._transitiveDependents(importer, visited);
    }
    return visited;
  }

  /** Remove all registry entries associated with a file. */
  private static _removeFileEntries(filePath: string): void {
    const fp = filePath.replace(/\\/g, '/');

    // Remove userDefs
    const typeIds = this._fileToTypeIds.get(fp) ?? new Set();
    for (const typeId of typeIds) {
      this._userDefs.delete(typeId);
    }

    // Remove from _fileToTypeIds
    this._fileToTypeIds.delete(fp);

    // Remove from import index
    const imports = this._fileImports.get(fp) ?? [];
    for (const imp of imports) {
      this._importedBy.get(imp)?.delete(fp);
    }
    this._fileImports.delete(fp);

    // Remove as an importer in _importedBy
    this._importedBy.delete(fp);
    this._sourceCache.delete(fp);
  }

  /** Convert a ScannedClass into a ComponentDef for the registry. */
  private static _classToComponentDef(
    cls: ScannedClass,
    classNameCount?: Map<string, number>,
  ): ComponentDef {
    if (cls.componentMeta) {
      // @component decorated class — use its declared metadata
      return {
        typeId:      cls.componentMeta.typeId,
        displayName: cls.componentMeta.displayName,
        category:    cls.componentMeta.category,
        requires:    [],
        fields:      cls.fields,
        deprecated:  cls.deprecated,
        filePath:    cls.filePath,
        description: cls.description,
      };
    }

    // Resolve namespace collision — qualify with parent dir stem when needed
    const isCollision = classNameCount && (classNameCount.get(cls.className) ?? 0) > 1;
    let typeId: string;
    let displayName: string;
    let namespace: string | undefined;

    if (isCollision) {
      const dirStem = cls.filePath.replace(/\\/g, '/').split('/').slice(-2, -1)[0] ?? '';
      if (dirStem) {
        typeId = `Script:${dirStem}_${cls.className}`;
        displayName = `${dirStem}/${cls.className}`;
        namespace = dirStem;
      } else {
        DebugConsole.LogWarning(
          `[MetaRegistry] Class name collision: "${cls.className}" — cannot qualify (no parent dir)`,
        );
        typeId = `Script:${cls.className}`;
        displayName = cls.className;
      }
    } else {
      typeId = `Script:${cls.className}`;
      displayName = cls.className;
    }

    // FluxionBehaviour / FluxionScript subclass
    return {
      typeId,
      displayName,
      namespace,
      category:    'Scripts',
      requires:    [],
      fields:      cls.fields,
      deprecated:  cls.deprecated,
      filePath:    cls.filePath,
      description: cls.description,
    };
  }
}
