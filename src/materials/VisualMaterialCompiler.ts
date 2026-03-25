// ============================================================
// FluxionJS V3 — Visual Material Compiler
// Compiles a VisualMaterialGraph into a Three.js material
// using MeshPhysicalMaterial + onBeforeCompile injection.
// ============================================================

import * as THREE from 'three';
import {
  VisualMaterialGraph,
  VisualMaterialNode,
  VisualMaterialFile,
  findConnection,
  findNode,
  topologicalSort,
  validateGraph,
  coerceGLSL,
  defaultLiteral,
  PortType,
} from './VisualMaterialGraph';
import { NodeRegistry, CompileResult, CompileContext } from './VisualMaterialNodes';

// ── Compiled representation ──

export interface CompiledVisualMaterial {
  /** Fragment shader code to inject (all node computations). */
  fragmentCode: string;
  /** Vertex shader code snippets (varyings etc.). */
  vertexCode: string;
  /** Varying declarations (shared between vert/frag). */
  varyings: string[];
  /** Uniform declarations (GLSL lines). */
  uniformDeclarations: string[];
  /** Uniform values to set on the shader. */
  uniforms: Record<string, { type: string; value: any }>;
  /** Output variable names for PBR properties. */
  pbrOutputs: {
    albedo: string;
    metallic: string;
    roughness: string;
    normal: string;
    emission: string;
    opacity: string;
    ao: string;
  };
  /** Texture paths that need loading (uniform name → path). */
  texturePaths: Record<string, string>;
  /** Whether the material needs time uniform updates. */
  needsTimeUpdate: boolean;
  /** Validation errors (if any). */
  errors: string[];
}

// ── Compiler ──

export function compileVisualMaterial(graph: VisualMaterialGraph): CompiledVisualMaterial {
  const result: CompiledVisualMaterial = {
    fragmentCode: '',
    vertexCode: '',
    varyings: [],
    uniformDeclarations: [],
    uniforms: {},
    pbrOutputs: {
      albedo: 'vec3(1.0)',
      metallic: '0.0',
      roughness: '0.5',
      normal: '',
      emission: 'vec3(0.0)',
      opacity: '1.0',
      ao: '1.0',
    },
    texturePaths: {},
    needsTimeUpdate: false,
    errors: [],
  };

  // Validate
  const errors = validateGraph(graph);
  if (errors.length > 0) {
    result.errors = errors;
    return result;
  }

  // Find the PBR Output node
  const outputNode = graph.nodes.find(n => n.type === 'PBROutput');
  if (!outputNode) {
    result.errors.push('No PBR Output node');
    return result;
  }

  // Topological sort from output
  const sorted = topologicalSort(graph, outputNode.id);

  // Compile each node in order
  const codeLines: string[] = [];
  const vertexLines: string[] = [];
  const varyingSet = new Set<string>();
  const allUniforms: Record<string, { type: string; value: any }> = {};
  const nodeOutputs = new Map<string, Record<string, string>>();

  let nodeIndex = 0;
  for (const node of sorted) {
    const def = NodeRegistry.get(node.type);
    if (!def) {
      result.errors.push(`Unknown node type: ${node.type}`);
      continue;
    }

    const prefix = `n${nodeIndex}_`;
    nodeIndex++;

    // Resolve input expressions
    const inputs: Record<string, string> = {};
    for (const inputPort of def.inputs) {
      const conn = findConnection(graph, node.id, inputPort.name);
      if (conn) {
        // Connected — use the source node's output variable
        const srcOutputs = nodeOutputs.get(conn.fromNode);
        const srcDef = NodeRegistry.get(findNode(graph, conn.fromNode)?.type ?? '');
        if (srcOutputs && srcOutputs[conn.fromOutput] !== undefined) {
          // Find source port type for coercion
          const srcPort = srcDef?.outputs.find(o => o.name === conn.fromOutput);
          const srcType: PortType = srcPort?.type ?? 'float';
          const targetType: PortType = inputPort.type;
          inputs[inputPort.name] = coerceGLSL(srcOutputs[conn.fromOutput], srcType, targetType);
        } else {
          inputs[inputPort.name] = defaultLiteral(inputPort.type, inputPort.default);
        }
      } else {
        // Not connected — use default
        inputs[inputPort.name] = defaultLiteral(inputPort.type, inputPort.default);
      }
    }

    const ctx: CompileContext = {
      inputs,
      prefix,
      properties: node.properties,
      nodeId: node.id.replace(/[^a-zA-Z0-9_]/g, '_'),
    };

    const compiled: CompileResult = def.compile(ctx);

    if (compiled.code) {
      codeLines.push(`// -- ${node.type} (${node.id}) --`);
      codeLines.push(compiled.code);
    }

    nodeOutputs.set(node.id, compiled.outputs);

    // Collect uniforms
    if (compiled.uniforms) {
      for (const [name, def] of Object.entries(compiled.uniforms)) {
        if (def.type === 'sampler2D' && def.value) {
          result.texturePaths[name] = def.value;
        }
        allUniforms[name] = def;
        if (name === 'u_time') {
          result.needsTimeUpdate = true;
        }
      }
    }

    // Collect varyings
    if (compiled.varyings) {
      for (const v of compiled.varyings) varyingSet.add(v);
    }

    // Collect vertex code
    if (compiled.vertexCode) {
      vertexLines.push(compiled.vertexCode);
    }
  }

  // Build PBR outputs from the output node's compile result
  const outputResults = nodeOutputs.get(outputNode.id);
  if (outputResults) {
    if (outputResults._albedo) result.pbrOutputs.albedo = outputResults._albedo;
    if (outputResults._metallic) result.pbrOutputs.metallic = outputResults._metallic;
    if (outputResults._roughness) result.pbrOutputs.roughness = outputResults._roughness;
    if (outputResults._normal) result.pbrOutputs.normal = outputResults._normal;
    if (outputResults._emission) result.pbrOutputs.emission = outputResults._emission;
    if (outputResults._opacity) result.pbrOutputs.opacity = outputResults._opacity;
    if (outputResults._ao) result.pbrOutputs.ao = outputResults._ao;
  }

  // Build uniform declarations
  const uniformLines: string[] = [];
  for (const [name, u] of Object.entries(allUniforms)) {
    if (u.type === 'sampler2D') {
      uniformLines.push(`uniform sampler2D ${name};`);
    } else if (u.type === 'float') {
      uniformLines.push(`uniform float ${name};`);
    } else if (u.type === 'vec2') {
      uniformLines.push(`uniform vec2 ${name};`);
    } else if (u.type === 'vec3') {
      uniformLines.push(`uniform vec3 ${name};`);
    } else if (u.type === 'vec4') {
      uniformLines.push(`uniform vec4 ${name};`);
    }
  }

  result.varyings = [...varyingSet];
  result.uniformDeclarations = uniformLines;
  result.uniforms = allUniforms;
  result.fragmentCode = codeLines.join('\n');
  result.vertexCode = vertexLines.join('\n');

  return result;
}

// ── Three.js Material Creation ──

export interface VisualMaterialOptions {
  transparent?: boolean;
  doubleSided?: boolean;
  alphaTest?: number;
}

/**
 * Build a Three.js MeshPhysicalMaterial from a compiled visual material.
 *
 * @param compiled  The compiled GLSL output from compileVisualMaterial
 * @param textures  Pre-loaded textures keyed by uniform name
 * @param options   Material options (transparency, side, etc.)
 */
export function createThreeMaterial(
  compiled: CompiledVisualMaterial,
  textures: Record<string, THREE.Texture>,
  options?: VisualMaterialOptions,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.5,
    transparent: options?.transparent ?? false,
    alphaTest: options?.alphaTest ?? 0,
    side: options?.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });

  // Build the shader uniforms object with Three.js Uniform wrappers
  const shaderUniforms: Record<string, THREE.IUniform> = {};
  for (const [name, def] of Object.entries(compiled.uniforms)) {
    if (def.type === 'sampler2D') {
      shaderUniforms[name] = { value: textures[name] ?? null };
    } else if (def.type === 'float') {
      shaderUniforms[name] = { value: def.value ?? 0 };
    } else {
      shaderUniforms[name] = { value: def.value ?? null };
    }
  }

  // Varying/uniform declarations for both shaders
  const varyingBlock = compiled.varyings.join('\n');
  const uniformBlock = compiled.uniformDeclarations.join('\n');

  mat.onBeforeCompile = (shader) => {
    // Merge our uniforms into the shader
    Object.assign(shader.uniforms, shaderUniforms);

    // ── Vertex shader injection ──
    if (varyingBlock || compiled.vertexCode) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n${varyingBlock}\n`,
      );
      if (compiled.vertexCode) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\n${compiled.vertexCode}\n`,
        );
      }
    }

    // ── Fragment shader injection ──
    // Add uniforms and varyings
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${uniformBlock}\n${varyingBlock}\n`,
    );

    // Inject all node computation code before the map_fragment chunk
    // This ensures our variables are declared before usage
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `// ── Visual Material Computations ──\n${compiled.fragmentCode}\n#include <map_fragment>`,
    );

    // ── Override PBR properties with our computed values ──

    // Albedo (diffuseColor)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\ndiffuseColor.rgb = ${compiled.pbrOutputs.albedo};\n`,
    );

    // Roughness
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = ${compiled.pbrOutputs.roughness};\n`,
    );

    // Metalness
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `float metalnessFactor = ${compiled.pbrOutputs.metallic};\n`,
    );

    // Emission
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `totalEmissiveRadiance = ${compiled.pbrOutputs.emission};\n`,
    );

    // Opacity
    if (compiled.pbrOutputs.opacity !== '1.0') {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphamap_fragment>',
        `diffuseColor.a = ${compiled.pbrOutputs.opacity};\n`,
      );
    }

    // AO
    if (compiled.pbrOutputs.ao !== '1.0') {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <aomap_fragment>',
        `float ambientOcclusion = ${compiled.pbrOutputs.ao};\n` +
        `reflectedLight.indirectDiffuse *= ambientOcclusion;\n` +
        `#if defined( USE_ENVMAP ) && defined( STANDARD )\n` +
        `float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );\n` +
        `reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );\n` +
        `#endif\n`,
      );
    }

    // Normal map
    if (compiled.pbrOutputs.normal) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `normal = ${compiled.pbrOutputs.normal};\n`,
      );
    }
  };

  // Store the shader uniforms on the material for later updates (e.g. time uniform)
  (mat as any)._visualMatUniforms = shaderUniforms;
  (mat as any)._needsTimeUpdate = compiled.needsTimeUpdate;

  // Force material to regenerate its shader program
  mat.needsUpdate = true;

  return mat;
}

/**
 * Update the time uniform on a visual material (call each frame).
 */
export function updateVisualMaterialTime(mat: THREE.Material, time: number): void {
  const uniforms = (mat as any)?._visualMatUniforms;
  if (uniforms?.u_time) {
    uniforms.u_time.value = time;
  }
}

/**
 * End-to-end: parse a .fluxvismat file, compile, load textures, build material.
 *
 * @param fileData    Parsed VisualMaterialFile JSON
 * @param loadTexture Callback to load a texture from a relative path
 * @param options     Material creation options
 */
export async function buildVisualMaterial(
  fileData: VisualMaterialFile,
  loadTexture: (path: string) => Promise<THREE.Texture>,
  options?: VisualMaterialOptions,
): Promise<{ material: THREE.MeshPhysicalMaterial; compiled: CompiledVisualMaterial }> {
  const compiled = compileVisualMaterial(fileData.graph);

  if (compiled.errors.length > 0) {
    console.warn('[VisualMaterial] Compilation errors:', compiled.errors);
  }

  // Load all required textures in parallel
  const textures: Record<string, THREE.Texture> = {};
  const texPromises = Object.entries(compiled.texturePaths).map(async ([uniformName, path]) => {
    try {
      const tex = await loadTexture(path);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      textures[uniformName] = tex;
    } catch (e) {
      console.warn(`[VisualMaterial] Failed to load texture "${path}":`, e);
    }
  });
  await Promise.all(texPromises);

  const material = createThreeMaterial(compiled, textures, options);
  return { material, compiled };
}
