// ============================================================
// FluxionJS V3 — Visual Material Editor (Node Graph)
// Full-screen overlay with React Flow for editing .fluxvismat.
// ============================================================

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
  ConnectionLineType,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  VisualMaterialFile,
  VisualMaterialGraph,
  VisualMaterialNode as VMNode,
  VisualMaterialConnection,
  PortDefinition,
  PortType,
  canCoerce,
  generateNodeId,
  generateConnectionId,
  validateGraph,
} from '../../../src/materials/VisualMaterialGraph';
import {
  NodeRegistry,
  NodeDefinition,
  NodeCategory,
} from '../../../src/materials/VisualMaterialNodes';
import { compileVisualMaterial } from '../../../src/materials/VisualMaterialCompiler';
import { getFileSystem } from '../../../src/filesystem';

// ── Port Color Map ──

const PORT_COLORS: Record<PortType, string> = {
  float: '#7ec850',
  vec2: '#4fc3f7',
  vec3: '#ce93d8',
  vec4: '#f48fb1',
  sampler2D: '#64b5f6',
};

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  Output: '#ef5350',
  Input: '#66bb6a',
  Texture: '#42a5f5',
  Math: '#7ec850',
  Vector: '#ce93d8',
  Color: '#ffb74d',
  Utility: '#4db6ac',
};

// ── Convert between our graph format ↔ React Flow ──

interface FlowNodeData {
  vmNode: VMNode;
  definition: NodeDefinition;
  [key: string]: unknown;
}

function vmGraphToFlow(graph: VisualMaterialGraph): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const vmNode of graph.nodes) {
    const def = NodeRegistry.get(vmNode.type);
    if (!def) continue;
    nodes.push({
      id: vmNode.id,
      type: 'materialNode',
      position: vmNode.position,
      data: { vmNode, definition: def } as FlowNodeData,
      deletable: vmNode.type !== 'PBROutput',
    });
  }

  for (const conn of graph.connections) {
    edges.push({
      id: conn.id,
      source: conn.fromNode,
      sourceHandle: `out-${conn.fromOutput}`,
      target: conn.toNode,
      targetHandle: `in-${conn.toInput}`,
      style: { stroke: '#888', strokeWidth: 2 },
      animated: false,
    });
  }

  return { nodes, edges };
}

function flowToVmGraph(
  nodes: Node[],
  edges: Edge[],
): VisualMaterialGraph {
  const vmNodes: VMNode[] = nodes.map((n) => ({
    id: n.id,
    type: (n.data as FlowNodeData).vmNode.type,
    position: n.position,
    properties: { ...(n.data as FlowNodeData).vmNode.properties },
  }));

  const connections: VisualMaterialConnection[] = edges
    .filter((e) => e.sourceHandle && e.targetHandle)
    .map((e) => ({
      id: e.id,
      fromNode: e.source,
      fromOutput: e.sourceHandle!.replace('out-', ''),
      toNode: e.target,
      toInput: e.targetHandle!.replace('in-', ''),
    }));

  return { nodes: vmNodes, connections };
}

// ── Custom Material Node Component ──

const MaterialNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const { vmNode, definition } = data as FlowNodeData;
  const catColor = CATEGORY_COLORS[definition.category] || '#888';

  return (
    <div
      style={{
        background: 'var(--bg-primary, #1e1e2e)',
        border: `2px solid ${selected ? 'var(--accent, #7c3aed)' : 'var(--border, #333)'}`,
        borderRadius: '6px',
        minWidth: '180px',
        fontFamily: 'var(--font-sans, system-ui)',
        fontSize: '11px',
        boxShadow: selected ? '0 0 12px rgba(124, 58, 237, 0.3)' : '0 2px 8px rgba(0,0,0,0.3)',
        overflow: 'visible',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: catColor,
          color: '#fff',
          padding: '4px 10px',
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '0.3px',
          borderRadius: '4px 4px 0 0',
        }}
      >
        {definition.label}
      </div>

      {/* Body */}
      <div style={{ padding: '6px 0' }}>
        {/* Inputs */}
        {definition.inputs.map((port, i) => (
          <div
            key={`in-${port.name}`}
            style={{
              position: 'relative',
              padding: '3px 10px 3px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`in-${port.name}`}
              className="vme-handle"
              style={{
                width: 10,
                height: 10,
                background: PORT_COLORS[port.type],
                border: '2px solid #222',
                borderRadius: '50%',
                left: -5,
              }}
            />
            <span style={{ color: 'var(--text-muted, #aaa)' }}>
              {port.name}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                color: PORT_COLORS[port.type],
                fontSize: '9px',
                opacity: 0.7,
              }}
            >
              {port.type}
            </span>
          </div>
        ))}

        {/* Properties (inline) */}
        {definition.properties?.map((prop) => (
          <div
            key={`prop-${prop.name}`}
            style={{
              padding: '3px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
            }}
          >
            <span style={{ color: 'var(--text-muted, #aaa)', fontSize: '10px' }}>
              {prop.name}
            </span>
            <span
              style={{
                color: 'var(--text-primary, #ddd)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono, monospace)',
                maxWidth: '80px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {String(vmNode.properties[prop.name] ?? prop.default)}
            </span>
          </div>
        ))}

        {/* Outputs */}
        {definition.outputs.map((port, i) => (
          <div
            key={`out-${port.name}`}
            style={{
              position: 'relative',
              padding: '3px 16px 3px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '6px',
            }}
          >
            <span
              style={{
                marginRight: 'auto',
                color: PORT_COLORS[port.type],
                fontSize: '9px',
                opacity: 0.7,
              }}
            >
              {port.type}
            </span>
            <span style={{ color: 'var(--text-muted, #aaa)' }}>
              {port.name}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`out-${port.name}`}
              className="vme-handle"
              style={{
                width: 10,
                height: 10,
                background: PORT_COLORS[port.type],
                border: '2px solid #222',
                borderRadius: '50%',
                right: -5,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  materialNode: MaterialNodeComponent,
};

// ── Node Palette (Add Node Menu) ──

const NodePalette: React.FC<{
  onAddNode: (type: string, position: { x: number; y: number }) => void;
  position: { x: number; y: number } | null;
  onClose: () => void;
}> = ({ onAddNode, position, onClose }) => {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [position]);

  useEffect(() => {
    setSearch('');
    setExpandedCategories(new Set());
  }, [position]);

  if (!position) return null;

  const allDefs = NodeRegistry.getAll().filter((d) => d.type !== 'PBROutput');
  const filtered = search
    ? allDefs.filter(
        (d) =>
          d.label.toLowerCase().includes(search.toLowerCase()) ||
          d.type.toLowerCase().includes(search.toLowerCase()),
      )
    : allDefs;

  const grouped = new Map<string, NodeDefinition[]>();
  for (const def of filtered) {
    const list = grouped.get(def.category) || [];
    list.push(def);
    grouped.set(def.category, list);
  }

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 1000,
          width: '220px',
          maxHeight: '360px',
          background: 'var(--bg-primary, #1e1e2e)',
          border: '1px solid var(--border, #333)',
          borderRadius: '6px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Search */}
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border, #333)' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '1px solid var(--border, #444)',
              borderRadius: '3px',
              background: 'var(--bg-input, #2a2a3e)',
              color: 'var(--text-primary, #ddd)',
              fontSize: '11px',
              outline: 'none',
              fontFamily: 'var(--font-sans, system-ui)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>

        {/* Category list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {[...grouped.entries()].map(([category, defs]) => (
            <div key={category}>
              <div
                onClick={() => toggleCategory(category)}
                style={{
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '11px',
                  color: CATEGORY_COLORS[category as NodeCategory] || '#aaa',
                  background: expandedCategories.has(category) || search
                    ? 'rgba(255,255,255,0.03)'
                    : 'transparent',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '8px' }}>
                  {expandedCategories.has(category) || search ? '▼' : '►'}
                </span>
                {category} ({defs.length})
              </div>
              {(expandedCategories.has(category) || search) &&
                defs.map((def) => (
                  <div
                    key={def.type}
                    onClick={() => {
                      onAddNode(def.type, position);
                      onClose();
                    }}
                    style={{
                      padding: '3px 10px 3px 24px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--text-primary, #ddd)',
                    }}
                    onMouseEnter={(e) =>
                      ((e.target as HTMLDivElement).style.background =
                        'rgba(255,255,255,0.06)')
                    }
                    onMouseLeave={(e) =>
                      ((e.target as HTMLDivElement).style.background = 'transparent')
                    }
                  >
                    {def.label}
                  </div>
                ))}
            </div>
          ))}
          {grouped.size === 0 && (
            <div
              style={{
                padding: '12px',
                color: 'var(--text-muted, #888)',
                fontSize: '11px',
                textAlign: 'center',
              }}
            >
              No nodes found
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Properties Panel (right sidebar inside the editor) ──

const NodePropertiesPanel: React.FC<{
  selectedNode: Node | null;
  onPropertyChange: (nodeId: string, propName: string, value: any) => void;
}> = ({ selectedNode, onPropertyChange }) => {
  if (!selectedNode) {
    return (
      <div
        style={{
          padding: '16px',
          color: 'var(--text-muted, #888)',
          fontSize: '11px',
          textAlign: 'center',
        }}
      >
        Select a node to edit properties
      </div>
    );
  }

  const { vmNode, definition } = selectedNode.data as FlowNodeData;
  if (!definition.properties || definition.properties.length === 0) {
    return (
      <div
        style={{
          padding: '16px',
          color: 'var(--text-muted, #888)',
          fontSize: '11px',
          textAlign: 'center',
        }}
      >
        {definition.label} — no editable properties
      </div>
    );
  }

  return (
    <div style={{ padding: '8px' }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: '12px',
          color: 'var(--text-primary, #ddd)',
          marginBottom: '8px',
          paddingBottom: '4px',
          borderBottom: '1px solid var(--border, #333)',
        }}
      >
        {definition.label}
      </div>
      {definition.properties.map((prop) => {
        const val = vmNode.properties[prop.name] ?? prop.default;
        return (
          <div
            key={prop.name}
            style={{
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <label
              style={{
                fontSize: '10px',
                color: 'var(--text-muted, #aaa)',
                whiteSpace: 'nowrap',
              }}
            >
              {prop.name}
            </label>
            {prop.type === 'float' || prop.type === 'int' ? (
              <input
                type="number"
                value={val}
                step={prop.step ?? (prop.type === 'int' ? 1 : 0.01)}
                min={prop.min}
                max={prop.max}
                onChange={(e) =>
                  onPropertyChange(
                    selectedNode.id,
                    prop.name,
                    parseFloat(e.target.value) || 0,
                  )
                }
                style={{
                  width: '70px',
                  padding: '2px 6px',
                  border: '1px solid var(--border, #444)',
                  borderRadius: '3px',
                  background: 'var(--bg-input, #2a2a3e)',
                  color: 'var(--text-primary, #ddd)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
            ) : prop.type === 'color' ? (
              <input
                type="color"
                value={val}
                onChange={(e) =>
                  onPropertyChange(selectedNode.id, prop.name, e.target.value)
                }
                style={{
                  width: '40px',
                  height: '22px',
                  border: '1px solid var(--border, #444)',
                  borderRadius: '3px',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ) : prop.type === 'string' ? (
              <input
                type="text"
                value={val}
                onChange={(e) =>
                  onPropertyChange(selectedNode.id, prop.name, e.target.value)
                }
                style={{
                  width: '110px',
                  padding: '2px 6px',
                  border: '1px solid var(--border, #444)',
                  borderRadius: '3px',
                  background: 'var(--bg-input, #2a2a3e)',
                  color: 'var(--text-primary, #ddd)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
            ) : prop.type === 'bool' ? (
              <input
                type="checkbox"
                checked={!!val}
                onChange={(e) =>
                  onPropertyChange(selectedNode.id, prop.name, e.target.checked)
                }
              />
            ) : prop.type === 'enum' ? (
              <select
                value={val}
                onChange={(e) =>
                  onPropertyChange(selectedNode.id, prop.name, e.target.value)
                }
                style={{
                  padding: '2px 6px',
                  border: '1px solid var(--border, #444)',
                  borderRadius: '3px',
                  background: 'var(--bg-input, #2a2a3e)',
                  color: 'var(--text-primary, #ddd)',
                  fontSize: '10px',
                }}
              >
                {prop.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

// ── Compilation Info Panel ──

const CompilationInfo: React.FC<{
  graph: VisualMaterialGraph;
}> = ({ graph }) => {
  const compiled = useMemo(() => compileVisualMaterial(graph), [graph]);
  const validation = useMemo(() => validateGraph(graph), [graph]);

  const hasErrors = compiled.errors.length > 0 || validation.length > 0;

  return (
    <div
      style={{
        padding: '8px',
        fontSize: '10px',
        fontFamily: 'var(--font-mono, monospace)',
        borderTop: '1px solid var(--border, #333)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '11px',
          color: hasErrors ? '#ef5350' : '#66bb6a',
          marginBottom: '4px',
        }}
      >
        {hasErrors ? '⚠ Compilation Errors' : '✓ Compiled OK'}
      </div>
      {[...validation, ...compiled.errors].map((err, i) => (
        <div key={i} style={{ color: '#ef5350', marginBottom: '2px' }}>
          {err}
        </div>
      ))}
      {!hasErrors && (
        <>
          <div style={{ color: 'var(--text-muted, #888)' }}>
            Uniforms: {Object.keys(compiled.uniforms).length}
          </div>
          <div style={{ color: 'var(--text-muted, #888)' }}>
            Textures: {Object.keys(compiled.texturePaths).length}
          </div>
          <div style={{ color: 'var(--text-muted, #888)' }}>
            Uses Time: {compiled.needsTimeUpdate ? 'Yes' : 'No'}
          </div>
        </>
      )}
    </div>
  );
};

// ── Main Editor Component ──

interface VisualMaterialEditorProps {
  filePath: string;
  onClose: () => void;
}

export const VisualMaterialEditor: React.FC<VisualMaterialEditorProps> = (props) => (
  <ReactFlowProvider>
    <VisualMaterialEditorInner {...props} />
  </ReactFlowProvider>
);

const VisualMaterialEditorInner: React.FC<VisualMaterialEditorProps> = ({
  filePath,
  onClose,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);
  const [materialName, setMaterialName] = useState('');
  const [palettePos, setPalettePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const rfInstance = useReactFlow();

  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || '';

  // Load file
  useEffect(() => {
    let cancelled = false;
    getFileSystem()
      .readFile(filePath)
      .then((text) => {
        if (cancelled) return;
        const file: VisualMaterialFile = JSON.parse(text);
        setMaterialName(file.name);
        const { nodes: flowNodes, edges: flowEdges } = vmGraphToFlow(file.graph);
        setNodes(flowNodes);
        setEdges(flowEdges);
      })
      .catch((err) => {
        console.error('[VisualMaterialEditor] Failed to load:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Auto-save (debounced)
  const saveGraph = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      const graph = flowToVmGraph(nodes, edges);
      const file: VisualMaterialFile = {
        version: 1,
        name: materialName || 'Untitled',
        graph,
      };
      getFileSystem()
        .writeFile(filePath, JSON.stringify(file, null, 2))
        .then(() => {
          window.dispatchEvent(
            new CustomEvent('fluxion:material-changed', {
              detail: { path: filePath },
            }),
          );
          // Notify main editor window via IPC (cross-window sync)
          window.fluxionAPI?.notifyMaterialChanged?.(filePath);
        })
        .catch((err) =>
          console.error('[VisualMaterialEditor] Save failed:', err),
        );
    }, 500);
  }, [nodes, edges, materialName, filePath]);

  useEffect(() => {
    saveGraph();
  }, [nodes, edges]);

  // Connection handler with type validation
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.sourceHandle || !params.targetHandle) return;

      const sourcePortName = params.sourceHandle.replace('out-', '');
      const targetPortName = params.targetHandle.replace('in-', '');

      // Find port types
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (!sourceNode || !targetNode) return;

      const sourceDef = (sourceNode.data as FlowNodeData).definition;
      const targetDef = (targetNode.data as FlowNodeData).definition;

      const sourcePort = sourceDef.outputs.find(
        (p) => p.name === sourcePortName,
      );
      const targetPort = targetDef.inputs.find(
        (p) => p.name === targetPortName,
      );
      if (!sourcePort || !targetPort) return;

      // Type check
      if (!canCoerce(sourcePort.type, targetPort.type)) {
        console.warn(
          `[VisualMaterialEditor] Cannot connect ${sourcePort.type} → ${targetPort.type}`,
        );
        return;
      }

      // Remove existing connection to this input (one-to-one)
      setEdges((eds) => {
        const filtered = eds.filter(
          (e) =>
            !(
              e.target === params.target &&
              e.targetHandle === params.targetHandle
            ),
        );
        return addEdge(
          {
            ...params,
            id: generateConnectionId(),
            style: { stroke: PORT_COLORS[sourcePort.type], strokeWidth: 2 },
          },
          filtered,
        );
      });
    },
    [nodes],
  );

  // Right-click to open palette
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setPalettePos({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  // Add node
  const handleAddNode = useCallback(
    (type: string, screenPos: { x: number; y: number }) => {
      const def = NodeRegistry.get(type);
      if (!def) return;

      // Convert screen position to flow position
      let position = { x: screenPos.x - 300, y: screenPos.y - 100 };
      if (rfInstance) {
        position = rfInstance.screenToFlowPosition(screenPos);
      }

      const nodeId = generateNodeId(type);
      const defaultProps: Record<string, any> = {};
      for (const prop of def.properties || []) {
        defaultProps[prop.name] = prop.default;
      }

      const newNode: Node = {
        id: nodeId,
        type: 'materialNode',
        position,
        data: {
          vmNode: { id: nodeId, type, position, properties: defaultProps },
          definition: def,
        } as FlowNodeData,
        deletable: true,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [],
  );

  // Node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Property change handler
  const handlePropertyChange = useCallback(
    (nodeId: string, propName: string, value: any) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as FlowNodeData;
          const updated = {
            ...d,
            vmNode: {
              ...d.vmNode,
              properties: { ...d.vmNode.properties, [propName]: value },
            },
          };
          return { ...n, data: updated };
        }),
      );
    },
    [],
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const currentGraph = useMemo(
    () => flowToVmGraph(nodes, edges),
    [nodes, edges],
  );

  // Close on Escape + keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle shortcuts when palette is open or typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (palettePos) setPalettePos(null);
        else onClose();
        return;
      }

      const selected = nodes.filter((n) => n.selected);
      const selectedIds = new Set(selected.map((n) => n.id));

      // Delete / Backspace — delete selected nodes (except PBROutput)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.length === 0) return;
        const toRemove = selected.filter((n) => (n.data as FlowNodeData).vmNode.type !== 'PBROutput');
        if (toRemove.length === 0) return;
        const removeIds = new Set(toRemove.map((n) => n.id));
        setNodes((nds) => nds.filter((n) => !removeIds.has(n.id)));
        setEdges((eds) => eds.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)));
        setSelectedNodeId(null);
        return;
      }

      // Ctrl+C — copy selected nodes
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        if (selected.length === 0) return;
        const copiedEdges = edges.filter((ed) => selectedIds.has(ed.source) && selectedIds.has(ed.target));
        clipboardRef.current = { nodes: selected, edges: copiedEdges };
        return;
      }

      // Ctrl+V — paste copied nodes
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return;
        e.preventDefault();
        const idMap = new Map<string, string>();
        const offset = { x: 40, y: 40 };
        const newNodes: Node[] = clipboardRef.current.nodes
          .filter((n) => (n.data as FlowNodeData).vmNode.type !== 'PBROutput')
          .map((n) => {
            const d = n.data as FlowNodeData;
            const newId = generateNodeId(d.vmNode.type);
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
              selected: true,
              data: {
                ...d,
                vmNode: { ...d.vmNode, id: newId, position: { x: n.position.x + offset.x, y: n.position.y + offset.y }, properties: { ...d.vmNode.properties } },
              },
            };
          });
        const newEdges: Edge[] = clipboardRef.current.edges
          .filter((ed) => idMap.has(ed.source) && idMap.has(ed.target))
          .map((ed) => ({
            ...ed,
            id: generateConnectionId(),
            source: idMap.get(ed.source)!,
            target: idMap.get(ed.target)!,
          }));
        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
        setEdges((eds) => [...eds, ...newEdges]);
        // Shift clipboard offset so repeated paste doesn't overlap
        clipboardRef.current = { nodes: newNodes, edges: newEdges };
        return;
      }

      // Ctrl+D — duplicate selected nodes in-place
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (selected.length === 0) return;
        const idMap = new Map<string, string>();
        const offset = { x: 40, y: 40 };
        const duped: Node[] = selected
          .filter((n) => (n.data as FlowNodeData).vmNode.type !== 'PBROutput')
          .map((n) => {
            const d = n.data as FlowNodeData;
            const newId = generateNodeId(d.vmNode.type);
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
              selected: true,
              data: {
                ...d,
                vmNode: { ...d.vmNode, id: newId, position: { x: n.position.x + offset.x, y: n.position.y + offset.y }, properties: { ...d.vmNode.properties } },
              },
            };
          });
        const dupedEdges: Edge[] = edges
          .filter((ed) => idMap.has(ed.source) && idMap.has(ed.target))
          .map((ed) => ({
            ...ed,
            id: generateConnectionId(),
            source: idMap.get(ed.source)!,
            target: idMap.get(ed.target)!,
          }));
        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...duped]);
        setEdges((eds) => [...eds, ...dupedEdges]);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, palettePos, nodes, edges]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary, #1e1e2e)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border, #333)',
          background: 'var(--bg-secondary, #181825)',
          height: '36px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              color: '#e040fb',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            ◈ Visual Material
          </span>
          <span
            style={{
              color: 'var(--text-muted, #888)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {fileName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              color: 'var(--text-muted, #888)',
              fontSize: '10px',
            }}
          >
            Right-click to add nodes
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '3px 12px',
              border: '1px solid var(--border, #444)',
              borderRadius: '4px',
              background: 'var(--bg-input, #2a2a3e)',
              color: 'var(--text-primary, #ddd)',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: 'var(--font-sans, system-ui)',
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* React Flow Canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onContextMenu={onPaneContextMenu}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{
              style: { strokeWidth: 2 },
              animated: false,
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{ stroke: '#e040fb', strokeWidth: 2, strokeDasharray: '6 3' }}
            proOptions={{ hideAttribution: true }}
            style={{ background: '#11111b' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
            <Controls
              style={{
                background: 'var(--bg-secondary, #181825)',
                border: '1px solid var(--border, #333)',
                borderRadius: '4px',
              }}
            />
            <MiniMap
              nodeColor={(node) => {
                const d = node.data as FlowNodeData;
                return CATEGORY_COLORS[d.definition.category] || '#888';
              }}
              style={{
                background: '#11111b',
                border: '1px solid var(--border, #333)',
                borderRadius: '4px',
              }}
              maskColor="rgba(0,0,0,0.3)"
            />
          </ReactFlow>
        </div>

        {/* Right sidebar: properties + compile info */}
        <div
          style={{
            width: '220px',
            borderLeft: '1px solid var(--border, #333)',
            background: 'var(--bg-secondary, #181825)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--border, #333)',
              fontWeight: 700,
              fontSize: '11px',
              color: 'var(--text-primary, #ddd)',
            }}
          >
            Properties
          </div>
          <NodePropertiesPanel
            selectedNode={selectedNode}
            onPropertyChange={handlePropertyChange}
          />
          <CompilationInfo graph={currentGraph} />
        </div>
      </div>

      {/* Node palette (context menu) */}
      <NodePalette
        onAddNode={handleAddNode}
        position={palettePos}
        onClose={() => setPalettePos(null)}
      />
    </div>
  );
};
