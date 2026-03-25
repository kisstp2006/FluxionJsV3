// ============================================================
// FluxionJS V3 — Visual Material Graph (Data Model)
// Node-based material graphs stored as .fluxvismat files.
// ============================================================

// ── Port types ──

export type PortType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D';

/** Automatic type coercion rules (source → target). */
export function canCoerce(from: PortType, to: PortType): boolean {
  if (from === to) return true;
  if (from === 'float') return to === 'vec2' || to === 'vec3' || to === 'vec4';
  if (from === 'vec2' && to === 'float') return true;
  if (from === 'vec3' && (to === 'float' || to === 'vec4')) return true;
  if (from === 'vec4' && (to === 'float' || to === 'vec3')) return true;
  return false;
}

/** Generate GLSL coercion expression. */
export function coerceGLSL(expr: string, from: PortType, to: PortType): string {
  if (from === to) return expr;
  // float → vecN
  if (from === 'float') {
    if (to === 'vec2') return `vec2(${expr})`;
    if (to === 'vec3') return `vec3(${expr})`;
    if (to === 'vec4') return `vec4(vec3(${expr}), 1.0)`;
  }
  // vecN → float (take x component)
  if (to === 'float') return `${expr}.x`;
  // vec3 → vec4
  if (from === 'vec3' && to === 'vec4') return `vec4(${expr}, 1.0)`;
  // vec4 → vec3
  if (from === 'vec4' && to === 'vec3') return `${expr}.xyz`;
  return expr;
}

/** Default GLSL literal for a port type. */
export function defaultLiteral(type: PortType, value?: number | number[]): string {
  if (value !== undefined) {
    if (typeof value === 'number') {
      if (type === 'float') return `${value.toFixed(4)}`;
      if (type === 'vec2') return `vec2(${value.toFixed(4)})`;
      if (type === 'vec3') return `vec3(${value.toFixed(4)})`;
      if (type === 'vec4') return `vec4(${value.toFixed(4)})`;
    } else if (Array.isArray(value)) {
      const v = value.map(n => n.toFixed(4));
      if (type === 'vec2') return `vec2(${v[0]}, ${v[1] ?? '0.0'})`;
      if (type === 'vec3') return `vec3(${v[0]}, ${v[1] ?? '0.0'}, ${v[2] ?? '0.0'})`;
      if (type === 'vec4') return `vec4(${v[0]}, ${v[1] ?? '0.0'}, ${v[2] ?? '0.0'}, ${v[3] ?? '1.0'})`;
    }
  }
  switch (type) {
    case 'float': return '0.0';
    case 'vec2': return 'vec2(0.0)';
    case 'vec3': return 'vec3(0.0)';
    case 'vec4': return 'vec4(0.0, 0.0, 0.0, 1.0)';
    case 'sampler2D': return 'vec4(0.0)';
  }
}

// ── Port/connection/node definitions ──

export interface PortDefinition {
  name: string;
  type: PortType;
  default?: number | number[];
}

export interface VisualMaterialNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  properties: Record<string, any>;
}

export interface VisualMaterialConnection {
  id: string;
  fromNode: string;
  fromOutput: string;
  toNode: string;
  toInput: string;
}

// ── Graph ──

export interface VisualMaterialGraph {
  nodes: VisualMaterialNode[];
  connections: VisualMaterialConnection[];
}

// ── File format ──

export interface VisualMaterialFile {
  version: 1;
  name: string;
  graph: VisualMaterialGraph;
}

// ── Graph utility functions ──

/** Find which connection feeds into a specific node input. */
export function findConnection(
  graph: VisualMaterialGraph,
  toNodeId: string,
  toInput: string,
): VisualMaterialConnection | undefined {
  return graph.connections.find(
    c => c.toNode === toNodeId && c.toInput === toInput,
  );
}

/** Find all connections originating from a node output. */
export function findOutputConnections(
  graph: VisualMaterialGraph,
  fromNodeId: string,
  fromOutput: string,
): VisualMaterialConnection[] {
  return graph.connections.filter(
    c => c.fromNode === fromNodeId && c.fromOutput === fromOutput,
  );
}

/** Find a node by id. */
export function findNode(
  graph: VisualMaterialGraph,
  nodeId: string,
): VisualMaterialNode | undefined {
  return graph.nodes.find(n => n.id === nodeId);
}

/**
 * Topological sort of nodes reachable from a root node (the output),
 * walking backwards through connections. Returns nodes in execution order.
 */
export function topologicalSort(
  graph: VisualMaterialGraph,
  rootNodeId: string,
): VisualMaterialNode[] {
  const visited = new Set<string>();
  const order: VisualMaterialNode[] = [];

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    // Find all connections that feed INTO this node
    const incoming = graph.connections.filter(c => c.toNode === nodeId);
    for (const conn of incoming) {
      visit(conn.fromNode);
    }

    const node = graph.nodes.find(n => n.id === nodeId);
    if (node) order.push(node);
  }

  visit(rootNodeId);
  return order;
}

/** Validate that a graph has exactly one PBROutput node. */
export function validateGraph(graph: VisualMaterialGraph): string[] {
  const errors: string[] = [];
  const outputNodes = graph.nodes.filter(n => n.type === 'PBROutput');
  if (outputNodes.length === 0) errors.push('No PBR Output node found');
  if (outputNodes.length > 1) errors.push('Multiple PBR Output nodes found (only 1 allowed)');
  return errors;
}

/** Create a new empty graph with just the PBR Output node. */
export function createDefaultGraph(): VisualMaterialGraph {
  return {
    nodes: [
      {
        id: 'output_1',
        type: 'PBROutput',
        position: { x: 600, y: 200 },
        properties: {},
      },
    ],
    connections: [],
  };
}

/** Generate a unique node id. */
let _nodeIdCounter = 0;
export function generateNodeId(type: string): string {
  return `${type}_${Date.now()}_${++_nodeIdCounter}`;
}

/** Generate a unique connection id. */
let _connIdCounter = 0;
export function generateConnectionId(): string {
  return `conn_${Date.now()}_${++_connIdCounter}`;
}
