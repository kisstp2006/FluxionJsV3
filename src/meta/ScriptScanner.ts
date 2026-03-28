// ============================================================
// FluxionJS V3 — Script Scanner
// Static AST-based scanner for user script files.
// Extracts FluxionBehaviour subclasses and @component classes
// WITHOUT executing any code — uses TypeScript compiler API only.
// ============================================================

import * as ts from 'typescript';
import type { FieldDef } from './MetaTypes';

export interface ScannedClass {
  /** Class name (falls back to filename stem for anonymous default exports). */
  className: string;
  /** Name of the class this one extends. */
  baseClass: string;
  /** Extracted inspector fields. */
  fields: FieldDef[];
  /** Absolute path of the source file. */
  filePath: string;
  /** True when the class is the default export of the module. */
  isDefaultExport: boolean;
  /** Populated when a @component decorator is present. */
  componentMeta?: { typeId: string; displayName: string; category: string };
  /** Populated when @component({ deprecated: true }) is set. */
  deprecated?: boolean;
  /** Human-readable description extracted from TSDoc/JSDoc or Lua comments. */
  description?: string;
  /** Type parameter names when the class is generic (e.g. ['T'] for Pool<T>). */
  genericParams?: string[];
}

// ── Known behaviour base class names ──────────────────────────
const BEHAVIOUR_BASES = new Set(['FluxionBehaviour', 'FluxionScript']);

// ── Lua EmmyLua type → FieldDef type ────────────────────────
function luaTypeToFieldType(t: string): { type: string; itemType?: string } | null {
  const trimmed = t.trim();
  // T[] form
  const arrayBracket = trimmed.match(/^(\w+)\[\]$/);
  if (arrayBracket) {
    const inner = luaTypeToFieldType(arrayBracket[1]);
    return inner ? { type: 'array', itemType: inner.type } : { type: 'array' };
  }
  // table<K, V> — use V (value type) as itemType
  const tableGeneric = trimmed.match(/^table<\w+,\s*(\w+)>$/);
  if (tableGeneric) {
    const inner = luaTypeToFieldType(tableGeneric[1]);
    return inner ? { type: 'array', itemType: inner.type } : { type: 'array' };
  }
  if (trimmed === 'table') return { type: 'array' };
  if (trimmed === 'number') return { type: 'number' };
  if (trimmed === 'boolean') return { type: 'boolean' };
  if (trimmed === 'string') return { type: 'string' };
  if (trimmed === 'Vector3') return { type: 'vector3' };
  if (trimmed === 'Vector2') return { type: 'vector2' };
  if (trimmed === 'Color') return { type: 'color' };
  if (trimmed === 'Euler') return { type: 'euler' };
  if (trimmed === 'string|nil') return { type: 'asset' };
  return null;
}

export class ScriptScanner {
  /**
   * Scan a TypeScript or JavaScript source string for:
   * - Classes extending FluxionBehaviour / FluxionScript
   * - Classes decorated with @component
   *
   * Returns one `ScannedClass` per matching class declaration.
   * Never throws — errors are swallowed and an empty array is returned.
   */
  static scanSource(source: string, filePath: string): ScannedClass[] {
    let sf: ts.SourceFile;
    try {
      sf = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.ES2020,
        /* setParentNodes */ true,
      );
    } catch {
      return [];
    }

    const results: ScannedClass[] = [];
    const filenameStem = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Script';

    for (const stmt of sf.statements) {
      try {
        const result = this._processStatement(stmt, sf, filenameStem);
        if (result) results.push(result);
      } catch {
        // skip unparseable statements
      }
    }

    return results;
  }

  /**
   * Scan a Lua source file for FluxionBehaviour subclasses declared via EmmyLua annotations.
   * Detects: `--- @class ClassName : FluxionBehaviour` and `--- @field name type [desc]`
   * Never throws — errors are swallowed and an empty array is returned.
   */
  static scanLuaSource(source: string, filePath: string): ScannedClass[] {
    try {
      const results: ScannedClass[] = [];
      const lines = source.split(/\r?\n/);
      const filenameStem = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Script';

      let current: ScannedClass | null = null;
      let pendingDeprecated = false;
      let pendingDescription: string | undefined;

      const commitCurrent = () => {
        if (current) results.push(current);
        current = null;
        pendingDeprecated = false;
        pendingDescription = undefined;
      };

      for (const raw of lines) {
        const line = raw.trim();

        // Class declaration
        const classMatch = line.match(/^---\s*@class\s+(\w+)\s*:\s*(\w+)/);
        if (classMatch) {
          commitCurrent();
          const baseClass = classMatch[2];
          if (BEHAVIOUR_BASES.has(baseClass)) {
            current = {
              className: classMatch[1],
              baseClass,
              fields: [],
              filePath,
              isDefaultExport: false,
              deprecated: pendingDeprecated || undefined,
              description: pendingDescription,
            };
          }
          pendingDeprecated = false;
          pendingDescription = undefined;
          continue;
        }

        // Deprecated marker (must precede @class)
        if (line === '--- @deprecated') {
          pendingDeprecated = true;
          continue;
        }

        // Description comment before @class or @field
        const descMatch = line.match(/^---\s+(?!@)(.+)/);
        if (descMatch && !current) {
          pendingDescription = descMatch[1].trim();
          continue;
        }

        // Field declaration — only when inside a class block
        if (current) {
          // Match: --- @field name[?] type Description...
          const fieldMatch = line.match(/^---\s*@field\s+(\w+)(\?)?\s+(\S+)(.*)?/);
          if (fieldMatch) {
            const key = fieldMatch[1];
            const isOptional = fieldMatch[2] === '?';
            if (!key.startsWith('_')) {
              const rawType = (fieldMatch[3] ?? '').trim();
              const rest = (fieldMatch[4] ?? '').trim();
              const mapped = luaTypeToFieldType(rawType);
              if (mapped) {
                current.fields.push({
                  key,
                  type: mapped.type,
                  label: key,
                  optional: isOptional,
                  defaultValue: undefined,
                  itemType: mapped.itemType,
                  description: rest || undefined,
                });
              }
            }
            continue;
          }
          // Non-annotation, non-comment line (but NOT blank) ends the block
          if (line !== '' && !line.startsWith('---') && !line.startsWith('--')) {
            commitCurrent();
          }
          // Blank lines are allowed inside a class block; do not commit
        }
      }

      commitCurrent();

      // Fall back to filename stem for anonymous classes
      for (const r of results) {
        if (!r.className) r.className = filenameStem;
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Extract absolute paths of files imported by the given source.
   * Only resolves relative specifiers (./foo, ../bar) — skips package imports.
   * Returns [] on any error.
   */
  static extractImports(source: string, filePath: string): string[] {
    try {
      const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2020, true);
      const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      const results: string[] = [];

      for (const stmt of sf.statements) {
        let specifier: string | null = null;

        // import ... from '...'
        if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
          specifier = stmt.moduleSpecifier.text;
        }
        // const x = require('...')
        if (ts.isVariableStatement(stmt)) {
          for (const decl of stmt.declarationList.declarations) {
            if (
              decl.initializer &&
              ts.isCallExpression(decl.initializer) &&
              ts.isIdentifier(decl.initializer.expression) &&
              decl.initializer.expression.text === 'require' &&
              decl.initializer.arguments.length === 1 &&
              ts.isStringLiteral(decl.initializer.arguments[0])
            ) {
              specifier = (decl.initializer.arguments[0] as ts.StringLiteral).text;
            }
          }
        }

        if (!specifier || (!specifier.startsWith('./') && !specifier.startsWith('../'))) continue;

        // Resolve relative specifier to absolute path
        const parts = `${dir}/${specifier}`.split('/');
        const resolved: string[] = [];
        for (const p of parts) {
          if (p === '..') resolved.pop();
          else if (p !== '.') resolved.push(p);
        }
        let abs = resolved.join('/');

        // Add extension if missing
        if (!/\.[^/]+$/.test(abs)) {
          // prefer .ts, fall back to .js
          abs = `${abs}.ts`;
        }

        results.push(abs);
      }

      return results;
    } catch {
      return [];
    }
  }

  // ── Internal ─────────────────────────────────────────────────

  private static _processStatement(
    stmt: ts.Statement,
    sf: ts.SourceFile,
    fallbackName: string,
  ): ScannedClass | null {
    let classDecl: ts.ClassDeclaration | null = null;
    let isDefaultExport = false;

    if (ts.isClassDeclaration(stmt)) {
      classDecl = stmt;
      const mods = stmt.modifiers ?? ([] as readonly ts.ModifierLike[]);
      isDefaultExport =
        mods.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) &&
        mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    }

    if (!classDecl) return null;

    const className = classDecl.name?.getText(sf) ?? fallbackName;

    // Find extends clause
    const extendsClause = classDecl.heritageClauses?.find(
      h => h.token === ts.SyntaxKind.ExtendsKeyword,
    );
    if (!extendsClause || extendsClause.types.length === 0) return null;

    const baseClass = this._getExprText(extendsClause.types[0].expression, sf);
    const hasComponentDec = this._hasDecorator(classDecl, 'component');
    const isBehaviour = BEHAVIOUR_BASES.has(baseClass);

    if (!isBehaviour && !hasComponentDec) return null;

    const componentMeta = hasComponentDec
      ? this._extractComponentMeta(classDecl, sf, className)
      : undefined;

    const deprecated = componentMeta?.deprecated as boolean | undefined;

    const fields = this._extractFields(classDecl, sf);
    const description = this._extractLeadingDoc(classDecl, sf);

    // Detect generic type parameters (e.g. class Pool<T>)
    const genericParams = classDecl.typeParameters && classDecl.typeParameters.length > 0
      ? classDecl.typeParameters.map(tp => tp.name.text)
      : undefined;

    if (genericParams?.length) {
      try {
        const { DebugConsole } = require('../core/DebugConsole');
        DebugConsole.LogWarning(
          `[ScriptScanner] ${className}<${genericParams.join(', ')}>: generic type params stripped from API output`,
        );
      } catch { /* DebugConsole unavailable at scan time */ }
    }

    return {
      className,
      baseClass,
      fields,
      filePath: sf.fileName,
      isDefaultExport,
      componentMeta: componentMeta
        ? { typeId: componentMeta.typeId, displayName: componentMeta.displayName, category: componentMeta.category }
        : undefined,
      deprecated,
      description,
      genericParams,
    };
  }

  // ── Decorator helpers ────────────────────────────────────────

  private static _hasDecorator(node: ts.ClassDeclaration, name: string): boolean {
    for (const mod of node.modifiers ?? []) {
      if (!ts.isDecorator(mod)) continue;
      if (this._getCallName(mod.expression) === name) return true;
    }
    return false;
  }

  private static _getCallName(expr: ts.Expression): string | null {
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
      return expr.expression.text;
    }
    if (ts.isIdentifier(expr)) return expr.text;
    return null;
  }

  private static _getExprText(expr: ts.Expression, sf: ts.SourceFile): string {
    try { return expr.getText(sf); } catch { return ''; }
  }

  // ── @component metadata extraction ───────────────────────────

  private static _extractComponentMeta(
    node: ts.ClassDeclaration,
    sf: ts.SourceFile,
    fallbackName: string,
  ): { typeId: string; displayName: string; category: string; deprecated?: boolean } {
    for (const mod of node.modifiers ?? []) {
      if (!ts.isDecorator(mod)) continue;
      if (this._getCallName(mod.expression) !== 'component') continue;
      const call = mod.expression as ts.CallExpression;
      if (call.arguments.length === 0) break;
      const arg = call.arguments[0];
      if (!ts.isObjectLiteralExpression(arg)) break;

      const obj = this._parseObjectLiteral(arg, sf);

      return {
        typeId: String(obj.typeId ?? fallbackName),
        displayName: String(obj.displayName ?? fallbackName),
        category: String(obj.category ?? 'Custom'),
        deprecated: obj.deprecated === true,
      };
    }

    return { typeId: fallbackName, displayName: fallbackName, category: 'Custom' };
  }

  // ── Field extraction ─────────────────────────────────────────

  private static _extractFields(node: ts.ClassDeclaration, sf: ts.SourceFile): FieldDef[] {
    const fields: FieldDef[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;

      const key = member.name?.getText(sf) ?? '';
      if (!key || key.startsWith('_') || key.startsWith('"') || key.startsWith("'")) continue;

      // Check for @field decorator
      const fieldDec = this._findDecorator(member, 'field');
      if (fieldDec) {
        const fd = this._parseFieldDecorator(fieldDec, sf, key, member);
        if (fd) { fields.push(fd); continue; }
      }

      // Fallback: infer from type annotation or initializer
      const inferred = this._inferField(member, sf, key);
      if (inferred) fields.push(inferred);
    }

    return fields;
  }

  private static _findDecorator(
    member: ts.PropertyDeclaration,
    name: string,
  ): ts.Decorator | null {
    for (const mod of member.modifiers ?? []) {
      if (ts.isDecorator(mod) && this._getCallName(mod.expression) === name) return mod;
    }
    return null;
  }

  private static _parseFieldDecorator(
    dec: ts.Decorator,
    sf: ts.SourceFile,
    key: string,
    member: ts.PropertyDeclaration,
  ): FieldDef | null {
    const call = dec.expression;
    if (!ts.isCallExpression(call) || call.arguments.length === 0) {
      return this._inferField(member, sf, key);
    }
    const arg = call.arguments[0];
    if (!ts.isObjectLiteralExpression(arg)) return null;

    const opts = this._parseObjectLiteral(arg, sf);

    return {
      key,
      type: (opts.type as any) ?? 'string',
      label: String(opts.label ?? key),
      optional: false,
      defaultValue: opts.default,
      min: typeof opts.min === 'number' ? opts.min : undefined,
      max: typeof opts.max === 'number' ? opts.max : undefined,
      step: typeof opts.step === 'number' ? opts.step : undefined,
      options: Array.isArray(opts.options) ? opts.options as any : undefined,
      assetType: typeof opts.assetType === 'string' ? opts.assetType : undefined,
      group: typeof opts.group === 'string' ? opts.group : undefined,
      description: typeof opts.description === 'string' ? opts.description : undefined,
    };
  }

  private static _inferField(
    member: ts.PropertyDeclaration,
    sf: ts.SourceFile,
    key: string,
  ): FieldDef | null {
    let partial: Pick<FieldDef, 'type' | 'itemType' | 'unionTypes' | 'readOnly' | 'tupleTypes'> | null = null;

    // Try type annotation first (supports array/union/readonly/tuple)
    if (member.type) {
      const t = member.type.getText(sf).trim();
      partial = this._typeStringToFieldDef(t);
    }

    // Fallback to initializer (simple types only)
    if (!partial && member.initializer) {
      const simpleType = this._inferFromInitializer(member.initializer, sf);
      if (simpleType) partial = { type: simpleType };
    }

    if (!partial) return null;

    // Extract leading TSDoc/JSDoc description
    const description = this._extractLeadingDoc(member, sf);

    return {
      key,
      type: partial.type,
      label: key,
      optional: false,
      defaultValue: undefined,
      itemType: partial.itemType,
      unionTypes: partial.unionTypes,
      readOnly: partial.readOnly,
      tupleTypes: partial.tupleTypes,
      description,
    };
  }

  /** Extract text from the leading `/** ... *\/` comment of a node, if any. */
  private static _extractLeadingDoc(node: ts.Node, sf: ts.SourceFile): string | undefined {
    const fullText = sf.getFullText();
    const nodeStart = node.getFullStart();
    const trivia = fullText.slice(nodeStart, node.getStart(sf));
    const match = trivia.match(/\/\*\*([\s\S]*?)\*\//);
    if (!match) return undefined;
    const text = match[1]
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .join(' ');
    return text || undefined;
  }

  private static _typeStringToFieldType(t: string): FieldDef['type'] | null {
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    if (t === 'string') return 'string';
    if (t === 'Vector3' || t === 'Vec3' || t.startsWith('THREE.Vector3')) return 'vector3';
    if (t === 'Vector2' || t === 'Vec2' || t.startsWith('THREE.Vector2')) return 'vector2';
    if (t === 'Color' || t.startsWith('THREE.Color')) return 'color';
    if (t === 'Euler' || t.startsWith('THREE.Euler')) return 'euler';
    if (t === 'EntityRef') return 'asset';
    return null;
  }

  /**
   * Like _typeStringToFieldType but also handles array, union, readonly, and tuple forms.
   * Returns { type, itemType?, unionTypes?, readOnly?, tupleTypes? } or null if not serializable.
   */
  private static _typeStringToFieldDef(
    t: string,
  ): Pick<FieldDef, 'type' | 'itemType' | 'unionTypes' | 'readOnly' | 'tupleTypes'> | null {
    let trimmed = t.trim();
    let readOnly = false;

    // Strip leading 'readonly '
    if (trimmed.startsWith('readonly ')) {
      readOnly = true;
      trimmed = trimmed.slice('readonly '.length).trim();
    }

    // ReadonlyArray<T>
    const readonlyArray = trimmed.match(/^ReadonlyArray<(.+)>$/);
    if (readonlyArray) {
      const inner = this._typeStringToFieldType(readonlyArray[1].trim());
      return { type: 'array', itemType: inner ?? undefined, readOnly: true };
    }

    // Readonly<T[]> wrapper
    const readonlyWrapper = trimmed.match(/^Readonly<(.+)>$/);
    if (readonlyWrapper) {
      const inner = this._typeStringToFieldDef(readonlyWrapper[1].trim());
      return inner ? { ...inner, readOnly: true } : null;
    }

    // Tuple: [T, U, V]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1);
      const branches = inner.split(',').map(b => b.trim());
      const mapped = branches.map(b => this._typeStringToFieldType(b));
      if (mapped.every(m => m !== null) && mapped.length >= 2) {
        return { type: 'array', tupleTypes: mapped as string[], readOnly: readOnly || undefined };
      }
      return null;
    }

    // Array: T[] or Array<T>
    const arrayBracket = trimmed.match(/^(.+)\[\]$/);
    if (arrayBracket) {
      const inner = this._typeStringToFieldType(arrayBracket[1].trim());
      return { type: 'array', itemType: inner ?? undefined, readOnly: readOnly || undefined };
    }
    const arrayGeneric = trimmed.match(/^Array<(.+)>$/);
    if (arrayGeneric) {
      const inner = this._typeStringToFieldType(arrayGeneric[1].trim());
      return { type: 'array', itemType: inner ?? undefined, readOnly: readOnly || undefined };
    }

    // Union: A | B (only if all branches are known types)
    if (trimmed.includes('|')) {
      const branches = trimmed.split('|').map(b => b.trim());
      const mapped = branches.map(b => this._typeStringToFieldType(b));
      if (mapped.every(m => m !== null) && mapped.length >= 2) {
        return { type: 'union', unionTypes: mapped as string[] };
      }
      return null;
    }

    const simple = this._typeStringToFieldType(trimmed);
    return simple ? { type: simple, readOnly: readOnly || undefined } : null;
  }

  private static _inferFromInitializer(
    init: ts.Expression,
    sf: ts.SourceFile,
  ): FieldDef['type'] | null {
    if (ts.isNumericLiteral(init)) return 'number';
    if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
    if (ts.isStringLiteral(init)) return 'string';
    if (ts.isNewExpression(init) && ts.isIdentifier(init.expression)) {
      const name = init.expression.text;
      if (name === 'Vector3' || name === 'Vec3') return 'vector3';
      if (name === 'Vector2' || name === 'Vec2') return 'vector2';
      if (name === 'Color') return 'color';
      if (name === 'Euler') return 'euler';
      if (name === 'EntityRef') return 'asset';
    }
    return null;
  }

  // ── Object literal parser ─────────────────────────────────────

  /** Shallow parse of an ObjectLiteralExpression into a plain Record. */
  private static _parseObjectLiteral(
    obj: ts.ObjectLiteralExpression,
    sf: ts.SourceFile,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const k = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
      const v = prop.initializer;

      if (ts.isStringLiteral(v)) result[k] = v.text;
      else if (ts.isNumericLiteral(v)) result[k] = Number(v.text);
      else if (v.kind === ts.SyntaxKind.TrueKeyword) result[k] = true;
      else if (v.kind === ts.SyntaxKind.FalseKeyword) result[k] = false;
      else if (v.kind === ts.SyntaxKind.NullKeyword) result[k] = null;
      else if (ts.isArrayLiteralExpression(v)) {
        result[k] = v.elements
          .filter(ts.isObjectLiteralExpression)
          .map(el => this._parseObjectLiteral(el, sf));
      } else if (ts.isObjectLiteralExpression(v)) {
        result[k] = this._parseObjectLiteral(v, sf);
      }
    }

    return result;
  }
}
