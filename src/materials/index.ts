// ============================================================
// FluxionJS V3 — Visual Material System (barrel exports)
// ============================================================

export {
  PortType,
  PortDefinition,
  VisualMaterialNode,
  VisualMaterialConnection,
  VisualMaterialGraph,
  VisualMaterialFile,
  canCoerce,
  coerceGLSL,
  defaultLiteral,
  findConnection,
  findOutputConnections,
  findNode,
  topologicalSort,
  validateGraph,
  createDefaultGraph,
  generateNodeId,
  generateConnectionId,
} from './VisualMaterialGraph';

export {
  NodeRegistry,
  NodeDefinition,
  NodeCategory,
  PropertyDefinition,
  CompileResult,
  CompileContext,
} from './VisualMaterialNodes';

export {
  CompiledVisualMaterial,
  VisualMaterialOptions,
  compileVisualMaterial,
  createThreeMaterial,
  updateVisualMaterialTime,
  buildVisualMaterial,
} from './VisualMaterialCompiler';
