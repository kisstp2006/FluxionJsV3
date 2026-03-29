// ============================================================
// FluxionJS V3 — Registry Reporter
// Generates a structured report of all registered components
// and fields. Written to .fluxion/api/registry-report.json.
// ============================================================

import type { EngineDef, ComponentDef, FieldDef } from './MetaTypes';

export interface FieldReport {
  key: string;
  type: string;
  optional: boolean;
  readOnly?: boolean;
  itemType?: string;
  tupleTypes?: string[];
  unionTypes?: string[];
  hasDescription: boolean;
}

export interface ComponentReport {
  typeId: string;
  displayName: string;
  category: string;
  deprecated: boolean;
  fieldCount: number;
  /** True for user scripts (category === 'Scripts') */
  isScript: boolean;
  fields: FieldReport[];
}

export interface RegistryReport {
  /** ISO 8601 timestamp of generation */
  generatedAt: string;
  engineVersion: string;
  summary: {
    totalComponents: number;
    totalFields: number;
    componentsByCategory: Record<string, number>;
    deprecatedComponents: number;
    userScripts: number;
    arrayFields: number;
    unionFields: number;
    tupleFields: number;
    readOnlyFields: number;
    warningCount: number;
  };
  components: ComponentReport[];
  warnings: string[];
}

export class RegistryReporter {
  static generate(def: EngineDef, warnings: readonly string[]): RegistryReport {
    const componentsByCategory: Record<string, number> = {};
    let totalFields = 0;
    let deprecatedComponents = 0;
    let userScripts = 0;
    let arrayFields = 0;
    let unionFields = 0;
    let tupleFields = 0;
    let readOnlyFields = 0;

    const components: ComponentReport[] = def.components.map((c: ComponentDef) => {
      componentsByCategory[c.category] = (componentsByCategory[c.category] ?? 0) + 1;
      if (c.deprecated) deprecatedComponents++;
      if (c.category === 'Scripts') userScripts++;
      totalFields += c.fields.length;

      const fields: FieldReport[] = c.fields.map((f: FieldDef) => {
        if (f.type === 'array') arrayFields++;
        if (f.type === 'union') unionFields++;
        if (f.tupleTypes?.length) tupleFields++;
        if (f.readOnly) readOnlyFields++;

        return {
          key:            f.key,
          type:           f.type,
          optional:       f.optional,
          readOnly:       f.readOnly,
          itemType:       f.itemType,
          tupleTypes:     f.tupleTypes,
          unionTypes:     f.unionTypes,
          hasDescription: Boolean(f.description),
        };
      });

      return {
        typeId:      c.typeId,
        displayName: c.displayName,
        category:    c.category,
        deprecated:  Boolean(c.deprecated),
        fieldCount:  c.fields.length,
        isScript:    c.category === 'Scripts',
        fields,
      };
    });

    return {
      generatedAt:  new Date().toISOString(),
      engineVersion: def.version,
      summary: {
        totalComponents:    def.components.length,
        totalFields,
        componentsByCategory,
        deprecatedComponents,
        userScripts,
        arrayFields,
        unionFields,
        tupleFields,
        readOnlyFields,
        warningCount: warnings.length,
      },
      components,
      warnings: [...warnings],
    };
  }
}
