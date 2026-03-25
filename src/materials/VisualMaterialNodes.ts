// ============================================================
// FluxionJS V3 — Visual Material Node Definitions
// Registry of all built-in node types with GLSL compile fns.
// ============================================================

import { PortDefinition, PortType } from './VisualMaterialGraph';

// ── Compile context ──

export interface CompileResult {
  /** GLSL code lines to insert (variable declarations + logic). */
  code: string;
  /** Map output port name → GLSL expression / variable name. */
  outputs: Record<string, string>;
  /** Additional uniforms this node requires. */
  uniforms?: Record<string, { type: string; value: any }>;
  /** Vertex shader code (for nodes that need varyings). */
  vertexCode?: string;
  /** Varying declarations (inserted in both vert & frag). */
  varyings?: string[];
}

export interface CompileContext {
  /** Resolved GLSL expressions for each input port. Already coerced to the expected type. */
  inputs: Record<string, string>;
  /** Unique variable prefix for this node instance (e.g. `n3_`). */
  prefix: string;
  /** Node properties. */
  properties: Record<string, any>;
  /** Node id. */
  nodeId: string;
}

// ── Node definition ──

export type NodeCategory =
  | 'Output'
  | 'Input'
  | 'Texture'
  | 'Math'
  | 'Vector'
  | 'Color'
  | 'Utility';

export interface PropertyDefinition {
  name: string;
  type: 'float' | 'int' | 'color' | 'string' | 'enum' | 'bool';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export interface NodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  properties?: PropertyDefinition[];
  compile: (ctx: CompileContext) => CompileResult;
}

// ── Node Registry ──

const _registry = new Map<string, NodeDefinition>();

export const NodeRegistry = {
  register(def: NodeDefinition): void {
    _registry.set(def.type, def);
  },
  get(type: string): NodeDefinition | undefined {
    return _registry.get(type);
  },
  getAll(): NodeDefinition[] {
    return [..._registry.values()];
  },
  getByCategory(category: NodeCategory): NodeDefinition[] {
    return [..._registry.values()].filter(d => d.category === category);
  },
};

// ================================================================
//  BUILT-IN NODE DEFINITIONS
// ================================================================

// ── PBR Output (the single mandatory sink) ──

NodeRegistry.register({
  type: 'PBROutput',
  label: 'PBR Output',
  category: 'Output',
  inputs: [
    { name: 'Albedo', type: 'vec3', default: [1, 1, 1] },
    { name: 'Metallic', type: 'float', default: 0 },
    { name: 'Roughness', type: 'float', default: 0.5 },
    { name: 'Normal', type: 'vec3' },
    { name: 'Emission', type: 'vec3', default: [0, 0, 0] },
    { name: 'Opacity', type: 'float', default: 1 },
    { name: 'AO', type: 'float', default: 1 },
  ],
  outputs: [],
  compile: (ctx) => ({
    code: [
      `vec3 ${ctx.prefix}albedo = ${ctx.inputs['Albedo']};`,
      `float ${ctx.prefix}metallic = ${ctx.inputs['Metallic']};`,
      `float ${ctx.prefix}roughness = ${ctx.inputs['Roughness']};`,
      `vec3 ${ctx.prefix}emission = ${ctx.inputs['Emission']};`,
      `float ${ctx.prefix}opacity = ${ctx.inputs['Opacity']};`,
      `float ${ctx.prefix}ao = ${ctx.inputs['AO']};`,
    ].join('\n'),
    outputs: {
      _albedo: `${ctx.prefix}albedo`,
      _metallic: `${ctx.prefix}metallic`,
      _roughness: `${ctx.prefix}roughness`,
      _normal: ctx.inputs['Normal'] || '',
      _emission: `${ctx.prefix}emission`,
      _opacity: `${ctx.prefix}opacity`,
      _ao: `${ctx.prefix}ao`,
    },
  }),
});

// ── Input Nodes ──

NodeRegistry.register({
  type: 'UV',
  label: 'UV Coordinates',
  category: 'Input',
  inputs: [],
  outputs: [{ name: 'UV', type: 'vec2' }],
  compile: (ctx) => ({
    code: '',
    outputs: { UV: 'vUv' },
  }),
});

NodeRegistry.register({
  type: 'Time',
  label: 'Time',
  category: 'Input',
  inputs: [],
  outputs: [
    { name: 'Time', type: 'float' },
    { name: 'Sin', type: 'float' },
    { name: 'Cos', type: 'float' },
  ],
  compile: (ctx) => ({
    code: '',
    outputs: {
      Time: 'u_time',
      Sin: 'sin(u_time)',
      Cos: 'cos(u_time)',
    },
    uniforms: { u_time: { type: 'float', value: 0 } },
  }),
});

NodeRegistry.register({
  type: 'WorldNormal',
  label: 'World Normal',
  category: 'Input',
  inputs: [],
  outputs: [{ name: 'Normal', type: 'vec3' }],
  compile: (ctx) => ({
    code: '',
    outputs: { Normal: 'vNormal' },
  }),
});

NodeRegistry.register({
  type: 'WorldPosition',
  label: 'World Position',
  category: 'Input',
  inputs: [],
  outputs: [{ name: 'Position', type: 'vec3' }],
  compile: (ctx) => ({
    code: '',
    outputs: { Position: 'vWorldPosition' },
    varyings: ['varying vec3 vWorldPosition;'],
    vertexCode: 'vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
  }),
});

NodeRegistry.register({
  type: 'ViewDirection',
  label: 'View Direction',
  category: 'Input',
  inputs: [],
  outputs: [{ name: 'Direction', type: 'vec3' }],
  compile: (ctx) => ({
    code: `vec3 ${ctx.prefix}viewDir = normalize(cameraPosition - vWorldPosition);`,
    outputs: { Direction: `${ctx.prefix}viewDir` },
    varyings: ['varying vec3 vWorldPosition;'],
    vertexCode: 'vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
  }),
});

// ── Texture Nodes ──

NodeRegistry.register({
  type: 'TextureSample',
  label: 'Texture Sample',
  category: 'Texture',
  inputs: [{ name: 'UV', type: 'vec2' }],
  outputs: [
    { name: 'RGB', type: 'vec3' },
    { name: 'R', type: 'float' },
    { name: 'G', type: 'float' },
    { name: 'B', type: 'float' },
    { name: 'A', type: 'float' },
  ],
  properties: [
    { name: 'texturePath', type: 'string', default: '' },
  ],
  compile: (ctx) => {
    const uniformName = `u_tex_${ctx.nodeId}`;
    const uv = ctx.inputs['UV'] || 'vUv';
    const samp = `${ctx.prefix}sample`;
    return {
      code: `vec4 ${samp} = texture2D(${uniformName}, ${uv});`,
      outputs: {
        RGB: `${samp}.rgb`,
        R: `${samp}.r`,
        G: `${samp}.g`,
        B: `${samp}.b`,
        A: `${samp}.a`,
      },
      uniforms: {
        [uniformName]: { type: 'sampler2D', value: ctx.properties.texturePath || null },
      },
    };
  },
});

NodeRegistry.register({
  type: 'NormalMap',
  label: 'Normal Map',
  category: 'Texture',
  inputs: [
    { name: 'UV', type: 'vec2' },
    { name: 'Strength', type: 'float', default: 1 },
  ],
  outputs: [{ name: 'Normal', type: 'vec3' }],
  properties: [
    { name: 'texturePath', type: 'string', default: '' },
  ],
  compile: (ctx) => {
    const uniformName = `u_nrm_${ctx.nodeId}`;
    const uv = ctx.inputs['UV'] || 'vUv';
    const strength = ctx.inputs['Strength'] || '1.0';
    const p = ctx.prefix;
    return {
      code: [
        `vec3 ${p}nrmSample = texture2D(${uniformName}, ${uv}).rgb * 2.0 - 1.0;`,
        `${p}nrmSample.xy *= ${strength};`,
        `vec3 ${p}nrmResult = normalize(${p}nrmSample);`,
      ].join('\n'),
      outputs: { Normal: `${p}nrmResult` },
      uniforms: {
        [uniformName]: { type: 'sampler2D', value: ctx.properties.texturePath || null },
      },
    };
  },
});

// ── Constant Nodes ──

NodeRegistry.register({
  type: 'Float',
  label: 'Float',
  category: 'Math',
  inputs: [],
  outputs: [{ name: 'Value', type: 'float' }],
  properties: [
    { name: 'value', type: 'float', default: 0, min: -100, max: 100, step: 0.01 },
  ],
  compile: (ctx) => ({
    code: '',
    outputs: { Value: `${(ctx.properties.value ?? 0).toFixed(4)}` },
  }),
});

NodeRegistry.register({
  type: 'Color',
  label: 'Color',
  category: 'Color',
  inputs: [],
  outputs: [
    { name: 'RGB', type: 'vec3' },
    { name: 'R', type: 'float' },
    { name: 'G', type: 'float' },
    { name: 'B', type: 'float' },
  ],
  properties: [
    { name: 'color', type: 'color', default: '#ffffff' },
  ],
  compile: (ctx) => {
    const hex = ctx.properties.color ?? '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    // sRGB → linear conversion inline
    const p = ctx.prefix;
    return {
      code: `vec3 ${p}col = pow(vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}), vec3(2.2));`,
      outputs: {
        RGB: `${p}col`,
        R: `${p}col.r`,
        G: `${p}col.g`,
        B: `${p}col.b`,
      },
    };
  },
});

NodeRegistry.register({
  type: 'Vec2',
  label: 'Vector 2',
  category: 'Vector',
  inputs: [],
  outputs: [
    { name: 'Vector', type: 'vec2' },
    { name: 'X', type: 'float' },
    { name: 'Y', type: 'float' },
  ],
  properties: [
    { name: 'x', type: 'float', default: 0, min: -100, max: 100, step: 0.01 },
    { name: 'y', type: 'float', default: 0, min: -100, max: 100, step: 0.01 },
  ],
  compile: (ctx) => {
    const x = (ctx.properties.x ?? 0).toFixed(4);
    const y = (ctx.properties.y ?? 0).toFixed(4);
    return {
      code: '',
      outputs: { Vector: `vec2(${x}, ${y})`, X: x, Y: y },
    };
  },
});

NodeRegistry.register({
  type: 'Vec3',
  label: 'Vector 3',
  category: 'Vector',
  inputs: [],
  outputs: [
    { name: 'Vector', type: 'vec3' },
    { name: 'X', type: 'float' },
    { name: 'Y', type: 'float' },
    { name: 'Z', type: 'float' },
  ],
  properties: [
    { name: 'x', type: 'float', default: 0, min: -100, max: 100, step: 0.01 },
    { name: 'y', type: 'float', default: 0, min: -100, max: 100, step: 0.01 },
    { name: 'z', type: 'float', default: 0, min: -100, max: 100, step: 0.01 },
  ],
  compile: (ctx) => {
    const x = (ctx.properties.x ?? 0).toFixed(4);
    const y = (ctx.properties.y ?? 0).toFixed(4);
    const z = (ctx.properties.z ?? 0).toFixed(4);
    return {
      code: '',
      outputs: { Vector: `vec3(${x}, ${y}, ${z})`, X: x, Y: y, Z: z },
    };
  },
});

// ── Math Nodes ──

function registerBinaryMathNode(
  type: string,
  label: string,
  op: string,
  fnStyle = false,
): void {
  NodeRegistry.register({
    type,
    label,
    category: 'Math',
    inputs: [
      { name: 'A', type: 'float', default: 0 },
      { name: 'B', type: 'float', default: 0 },
    ],
    outputs: [{ name: 'Result', type: 'float' }],
    compile: (ctx) => {
      const a = ctx.inputs['A'];
      const b = ctx.inputs['B'];
      const expr = fnStyle ? `${op}(${a}, ${b})` : `(${a} ${op} ${b})`;
      return {
        code: `float ${ctx.prefix}result = ${expr};`,
        outputs: { Result: `${ctx.prefix}result` },
      };
    },
  });
}

registerBinaryMathNode('Add', 'Add', '+');
registerBinaryMathNode('Subtract', 'Subtract', '-');
registerBinaryMathNode('Multiply', 'Multiply', '*');
registerBinaryMathNode('Divide', 'Divide', '/');
registerBinaryMathNode('Power', 'Power', 'pow', true);
registerBinaryMathNode('Min', 'Min', 'min', true);
registerBinaryMathNode('Max', 'Max', 'max', true);
registerBinaryMathNode('Step', 'Step', 'step', true);

// ── Vec3 Math Nodes ──

function registerVec3BinaryNode(type: string, label: string, op: string): void {
  NodeRegistry.register({
    type,
    label,
    category: 'Vector',
    inputs: [
      { name: 'A', type: 'vec3', default: [0, 0, 0] },
      { name: 'B', type: 'vec3', default: [0, 0, 0] },
    ],
    outputs: [{ name: 'Result', type: 'vec3' }],
    compile: (ctx) => ({
      code: `vec3 ${ctx.prefix}result = ${ctx.inputs['A']} ${op} ${ctx.inputs['B']};`,
      outputs: { Result: `${ctx.prefix}result` },
    }),
  });
}

registerVec3BinaryNode('Vec3Add', 'Vec3 Add', '+');
registerVec3BinaryNode('Vec3Subtract', 'Vec3 Subtract', '-');
registerVec3BinaryNode('Vec3Multiply', 'Vec3 Multiply', '*');

// ── Unary Math Nodes ──

NodeRegistry.register({
  type: 'OneMinus',
  label: 'One Minus',
  category: 'Math',
  inputs: [{ name: 'Value', type: 'float', default: 0 }],
  outputs: [{ name: 'Result', type: 'float' }],
  compile: (ctx) => ({
    code: `float ${ctx.prefix}result = 1.0 - ${ctx.inputs['Value']};`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

NodeRegistry.register({
  type: 'Abs',
  label: 'Absolute',
  category: 'Math',
  inputs: [{ name: 'Value', type: 'float', default: 0 }],
  outputs: [{ name: 'Result', type: 'float' }],
  compile: (ctx) => ({
    code: `float ${ctx.prefix}result = abs(${ctx.inputs['Value']});`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

NodeRegistry.register({
  type: 'Saturate',
  label: 'Saturate (Clamp 0-1)',
  category: 'Math',
  inputs: [{ name: 'Value', type: 'float', default: 0 }],
  outputs: [{ name: 'Result', type: 'float' }],
  compile: (ctx) => ({
    code: `float ${ctx.prefix}result = clamp(${ctx.inputs['Value']}, 0.0, 1.0);`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

NodeRegistry.register({
  type: 'Clamp',
  label: 'Clamp',
  category: 'Math',
  inputs: [
    { name: 'Value', type: 'float', default: 0 },
    { name: 'Min', type: 'float', default: 0 },
    { name: 'Max', type: 'float', default: 1 },
  ],
  outputs: [{ name: 'Result', type: 'float' }],
  compile: (ctx) => ({
    code: `float ${ctx.prefix}result = clamp(${ctx.inputs['Value']}, ${ctx.inputs['Min']}, ${ctx.inputs['Max']});`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

NodeRegistry.register({
  type: 'Lerp',
  label: 'Lerp (Mix)',
  category: 'Math',
  inputs: [
    { name: 'A', type: 'float', default: 0 },
    { name: 'B', type: 'float', default: 1 },
    { name: 'T', type: 'float', default: 0.5 },
  ],
  outputs: [{ name: 'Result', type: 'float' }],
  compile: (ctx) => ({
    code: `float ${ctx.prefix}result = mix(${ctx.inputs['A']}, ${ctx.inputs['B']}, ${ctx.inputs['T']});`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

NodeRegistry.register({
  type: 'Smoothstep',
  label: 'Smoothstep',
  category: 'Math',
  inputs: [
    { name: 'Edge0', type: 'float', default: 0 },
    { name: 'Edge1', type: 'float', default: 1 },
    { name: 'X', type: 'float', default: 0.5 },
  ],
  outputs: [{ name: 'Result', type: 'float' }],
  compile: (ctx) => ({
    code: `float ${ctx.prefix}result = smoothstep(${ctx.inputs['Edge0']}, ${ctx.inputs['Edge1']}, ${ctx.inputs['X']});`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

// ── Vec3 Mix ──

NodeRegistry.register({
  type: 'Vec3Lerp',
  label: 'Vec3 Mix',
  category: 'Vector',
  inputs: [
    { name: 'A', type: 'vec3', default: [0, 0, 0] },
    { name: 'B', type: 'vec3', default: [1, 1, 1] },
    { name: 'T', type: 'float', default: 0.5 },
  ],
  outputs: [{ name: 'Result', type: 'vec3' }],
  compile: (ctx) => ({
    code: `vec3 ${ctx.prefix}result = mix(${ctx.inputs['A']}, ${ctx.inputs['B']}, ${ctx.inputs['T']});`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

// ── Vec3 * Scalar ──

NodeRegistry.register({
  type: 'Vec3Scale',
  label: 'Vec3 × Scalar',
  category: 'Vector',
  inputs: [
    { name: 'Vector', type: 'vec3', default: [1, 1, 1] },
    { name: 'Scalar', type: 'float', default: 1 },
  ],
  outputs: [{ name: 'Result', type: 'vec3' }],
  compile: (ctx) => ({
    code: `vec3 ${ctx.prefix}result = ${ctx.inputs['Vector']} * ${ctx.inputs['Scalar']};`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

// ── Split / Combine ──

NodeRegistry.register({
  type: 'Split',
  label: 'Split Vec3',
  category: 'Vector',
  inputs: [{ name: 'Vector', type: 'vec3', default: [0, 0, 0] }],
  outputs: [
    { name: 'X', type: 'float' },
    { name: 'Y', type: 'float' },
    { name: 'Z', type: 'float' },
  ],
  compile: (ctx) => {
    const v = ctx.inputs['Vector'];
    return {
      code: '',
      outputs: { X: `${v}.x`, Y: `${v}.y`, Z: `${v}.z` },
    };
  },
});

NodeRegistry.register({
  type: 'Combine',
  label: 'Combine Vec3',
  category: 'Vector',
  inputs: [
    { name: 'X', type: 'float', default: 0 },
    { name: 'Y', type: 'float', default: 0 },
    { name: 'Z', type: 'float', default: 0 },
  ],
  outputs: [{ name: 'Vector', type: 'vec3' }],
  compile: (ctx) => ({
    code: `vec3 ${ctx.prefix}vec = vec3(${ctx.inputs['X']}, ${ctx.inputs['Y']}, ${ctx.inputs['Z']});`,
    outputs: { Vector: `${ctx.prefix}vec` },
  }),
});

NodeRegistry.register({
  type: 'DotProduct',
  label: 'Dot Product',
  category: 'Vector',
  inputs: [
    { name: 'A', type: 'vec3', default: [0, 0, 0] },
    { name: 'B', type: 'vec3', default: [0, 0, 0] },
  ],
  outputs: [{ name: 'Result', type: 'float' }],
  compile: (ctx) => ({
    code: `float ${ctx.prefix}dot = dot(${ctx.inputs['A']}, ${ctx.inputs['B']});`,
    outputs: { Result: `${ctx.prefix}dot` },
  }),
});

NodeRegistry.register({
  type: 'Normalize',
  label: 'Normalize',
  category: 'Vector',
  inputs: [{ name: 'Vector', type: 'vec3', default: [0, 1, 0] }],
  outputs: [{ name: 'Result', type: 'vec3' }],
  compile: (ctx) => ({
    code: `vec3 ${ctx.prefix}norm = normalize(${ctx.inputs['Vector']});`,
    outputs: { Result: `${ctx.prefix}norm` },
  }),
});

// ── UV Utility ──

NodeRegistry.register({
  type: 'TilingOffset',
  label: 'Tiling & Offset',
  category: 'Utility',
  inputs: [
    { name: 'UV', type: 'vec2' },
    { name: 'Tiling', type: 'vec2', default: [1, 1] },
    { name: 'Offset', type: 'vec2', default: [0, 0] },
  ],
  outputs: [{ name: 'UV', type: 'vec2' }],
  compile: (ctx) => {
    const uv = ctx.inputs['UV'] || 'vUv';
    return {
      code: `vec2 ${ctx.prefix}uv = ${uv} * ${ctx.inputs['Tiling']} + ${ctx.inputs['Offset']};`,
      outputs: { UV: `${ctx.prefix}uv` },
    };
  },
});

NodeRegistry.register({
  type: 'Panner',
  label: 'UV Panner',
  category: 'Utility',
  inputs: [
    { name: 'UV', type: 'vec2' },
    { name: 'Speed', type: 'vec2', default: [1, 0] },
  ],
  outputs: [{ name: 'UV', type: 'vec2' }],
  compile: (ctx) => {
    const uv = ctx.inputs['UV'] || 'vUv';
    return {
      code: `vec2 ${ctx.prefix}uv = ${uv} + ${ctx.inputs['Speed']} * u_time;`,
      outputs: { UV: `${ctx.prefix}uv` },
      uniforms: { u_time: { type: 'float', value: 0 } },
    };
  },
});

// ── Special Effect Nodes ──

NodeRegistry.register({
  type: 'Fresnel',
  label: 'Fresnel',
  category: 'Utility',
  inputs: [
    { name: 'Power', type: 'float', default: 3 },
  ],
  outputs: [{ name: 'Factor', type: 'float' }],
  compile: (ctx) => {
    const p = ctx.prefix;
    return {
      code: [
        `vec3 ${p}vDir = normalize(cameraPosition - vWorldPosition);`,
        `float ${p}fresnel = pow(1.0 - max(dot(vNormal, ${p}vDir), 0.0), ${ctx.inputs['Power']});`,
      ].join('\n'),
      outputs: { Factor: `${p}fresnel` },
      varyings: ['varying vec3 vWorldPosition;'],
      vertexCode: 'vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
    };
  },
});

NodeRegistry.register({
  type: 'Noise',
  label: 'Simple Noise',
  category: 'Utility',
  inputs: [
    { name: 'UV', type: 'vec2' },
    { name: 'Scale', type: 'float', default: 10 },
  ],
  outputs: [{ name: 'Value', type: 'float' }],
  compile: (ctx) => {
    const uv = ctx.inputs['UV'] || 'vUv';
    const p = ctx.prefix;
    // Inject a simple hash-based noise function (only once, deduplicated by compiler)
    return {
      code: [
        `vec2 ${p}nuv = ${uv} * ${ctx.inputs['Scale']};`,
        `float ${p}noise = fract(sin(dot(${p}nuv, vec2(12.9898, 78.233))) * 43758.5453);`,
      ].join('\n'),
      outputs: { Value: `${p}noise` },
    };
  },
});

NodeRegistry.register({
  type: 'Voronoi',
  label: 'Voronoi Noise',
  category: 'Utility',
  inputs: [
    { name: 'UV', type: 'vec2' },
    { name: 'Scale', type: 'float', default: 5 },
  ],
  outputs: [
    { name: 'Distance', type: 'float' },
    { name: 'CellID', type: 'float' },
  ],
  compile: (ctx) => {
    const uv = ctx.inputs['UV'] || 'vUv';
    const scale = ctx.inputs['Scale'];
    const p = ctx.prefix;
    return {
      code: [
        `vec2 ${p}vuv = ${uv} * ${scale};`,
        `vec2 ${p}vi = floor(${p}vuv);`,
        `vec2 ${p}vf = fract(${p}vuv);`,
        `float ${p}vMinDist = 1.0;`,
        `float ${p}vCellId = 0.0;`,
        `for (int j = -1; j <= 1; j++) {`,
        `  for (int i = -1; i <= 1; i++) {`,
        `    vec2 ${p}vn = vec2(float(i), float(j));`,
        `    vec2 ${p}vp = fract(sin(vec2(dot(${p}vi + ${p}vn, vec2(127.1, 311.7)), dot(${p}vi + ${p}vn, vec2(269.5, 183.3)))) * 43758.5453);`,
        `    float ${p}vd = length(${p}vn + ${p}vp - ${p}vf);`,
        `    if (${p}vd < ${p}vMinDist) { ${p}vMinDist = ${p}vd; ${p}vCellId = dot(${p}vi + ${p}vn, vec2(7.0, 157.0)); }`,
        `  }`,
        `}`,
      ].join('\n'),
      outputs: { Distance: `${p}vMinDist`, CellID: `fract(${p}vCellId * 0.0013)` },
    };
  },
});

// ── Color Utility ──

NodeRegistry.register({
  type: 'Desaturate',
  label: 'Desaturate',
  category: 'Color',
  inputs: [
    { name: 'Color', type: 'vec3', default: [1, 1, 1] },
    { name: 'Amount', type: 'float', default: 1 },
  ],
  outputs: [{ name: 'Result', type: 'vec3' }],
  compile: (ctx) => {
    const p = ctx.prefix;
    return {
      code: [
        `float ${p}gray = dot(${ctx.inputs['Color']}, vec3(0.2126, 0.7152, 0.0722));`,
        `vec3 ${p}desat = mix(${ctx.inputs['Color']}, vec3(${p}gray), ${ctx.inputs['Amount']});`,
      ].join('\n'),
      outputs: { Result: `${p}desat` },
    };
  },
});

NodeRegistry.register({
  type: 'Contrast',
  label: 'Contrast',
  category: 'Color',
  inputs: [
    { name: 'Color', type: 'vec3', default: [0.5, 0.5, 0.5] },
    { name: 'Contrast', type: 'float', default: 1 },
  ],
  outputs: [{ name: 'Result', type: 'vec3' }],
  compile: (ctx) => ({
    code: `vec3 ${ctx.prefix}result = (${ctx.inputs['Color']} - 0.5) * ${ctx.inputs['Contrast']} + 0.5;`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});

NodeRegistry.register({
  type: 'Posterize',
  label: 'Posterize',
  category: 'Color',
  inputs: [
    { name: 'Color', type: 'vec3', default: [0.5, 0.5, 0.5] },
    { name: 'Steps', type: 'float', default: 4 },
  ],
  outputs: [{ name: 'Result', type: 'vec3' }],
  compile: (ctx) => ({
    code: `vec3 ${ctx.prefix}result = floor(${ctx.inputs['Color']} * ${ctx.inputs['Steps']}) / ${ctx.inputs['Steps']};`,
    outputs: { Result: `${ctx.prefix}result` },
  }),
});
