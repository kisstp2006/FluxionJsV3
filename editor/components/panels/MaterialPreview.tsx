// ============================================================
// FluxionJS V3 — Material Preview
// Blender-style sphere preview for visual materials.
// - Three.js WebGLRenderer in a React-owned canvas
// - RoomEnvironment IBL for correct PBR shading
// - Auto-rotating sphere with slow Y rotation
// - On compile error: blurred canvas + red overlay
// ============================================================

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  compileVisualMaterial,
  buildVisualMaterial,
} from '../../../src/materials/VisualMaterialCompiler';
import {
  validateGraph,
  type VisualMaterialGraph,
} from '../../../src/materials/VisualMaterialGraph';

// ── Props ─────────────────────────────────────────────────────

interface MaterialPreviewProps {
  graph: VisualMaterialGraph;
  materialName: string;
  /** Absolute path to the .fluxvismat file (used to resolve texture paths) */
  filePath: string;
  /** Width in pixels — height will match (square canvas) */
  size?: number;
}

// ── Preview component ─────────────────────────────────────────

export const MaterialPreview: React.FC<MaterialPreviewProps> = ({
  graph,
  materialName,
  filePath,
  size = 220,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const currentMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const rafRef = useRef<number>(0);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  const [errors, setErrors] = useState<string[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);

  // Base directory for resolving texture paths
  const baseDir = useMemo(
    () => filePath.replace(/\\/g, '/').replace(/\/[^/]+$/, ''),
    [filePath],
  );

  // Texture loader — resolves paths relative to the material file directory
  const loadTexture = useCallback(
    (path: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        const p = path.replace(/\\/g, '/');
        const isAbsolute = p.startsWith('/') || /^[A-Za-z]:/.test(p);
        const url = isAbsolute
          ? `file:///${p.replace(/^\/+/, '')}`
          : `file:///${baseDir}/${p}`;
        loader.load(url, resolve, undefined, reject);
      }),
    [baseDir],
  );

  // ── Three.js setup (runs once on mount) ─────────────────────

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(size, size);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c1c2a);
    sceneRef.current = scene;

    // IBL via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmrem.dispose();

    // Lights (supplemental)
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
    key.position.set(3, 5, 4);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xc0d8ff, 0.4);
    fill.position.set(-4, 0, 2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd0a0, 0.3);
    rim.position.set(0, -3, -4);
    scene.add(rim);

    // Sphere
    const geo = new THREE.SphereGeometry(1, 64, 64);
    const defaultMat = new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      metalness: 0.0,
      roughness: 0.5,
    });
    const sphere = new THREE.Mesh(geo, defaultMat);
    scene.add(sphere);
    sphereRef.current = sphere;
    currentMaterialRef.current = defaultMat;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 2.6);
    camera.lookAt(0, 0, 0);

    // Animation loop
    let stopped = false;
    const animate = () => {
      if (stopped) return;
      rafRef.current = requestAnimationFrame(animate);
      sphere.rotation.y += 0.005;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      geo.dispose();
      currentMaterialRef.current?.dispose();
      envTexture.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      sphereRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ── Recompile on graph change (debounced 400 ms) ─────────────

  useEffect(() => {
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);

    updateTimerRef.current = setTimeout(async () => {
      const sphere = sphereRef.current;
      if (!sphere) return;

      // Quick synchronous validation first
      const validationErrors = validateGraph(graph);
      let compileErrors: string[] = [];
      let quickCompiled;
      try {
        quickCompiled = compileVisualMaterial(graph);
        compileErrors = quickCompiled.errors;
      } catch (e: any) {
        compileErrors = [String(e?.message ?? e)];
      }

      const allErrors = [...validationErrors, ...compileErrors];

      if (allErrors.length > 0) {
        // Keep current sphere material, just show error overlay
        setErrors(allErrors);
        setIsCompiling(false);
        return;
      }

      setIsCompiling(true);
      setErrors([]);

      try {
        const fileData = { version: 1 as const, name: materialName, graph };
        const { material } = await buildVisualMaterial(fileData, loadTexture);

        // Swap material on sphere
        const old = currentMaterialRef.current;
        sphere.material = material;
        currentMaterialRef.current = material;
        // Dispose old after swap to avoid mid-frame issues
        setTimeout(() => old?.dispose(), 100);
        setErrors([]);
      } catch (e: any) {
        setErrors([String(e?.message ?? e)]);
      } finally {
        setIsCompiling(false);
      }
    }, 400);

    return () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, [graph, materialName, loadTexture]);

  // ── Render ───────────────────────────────────────────────────

  const hasErrors = errors.length > 0;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        background: '#1c1c2a',
        borderBottom: '1px solid var(--border, #333)',
        overflow: 'hidden',
      }}
    >
      {/* Three.js canvas mount */}
      <div
        ref={mountRef}
        style={{
          width: size,
          height: size,
          filter: hasErrors ? 'blur(6px) brightness(0.4)' : 'none',
          transition: 'filter 0.25s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Compiling indicator */}
      {isCompiling && !hasErrors && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: '6px',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: '9px',
              color: 'rgba(255,255,255,0.45)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            compiling…
          </span>
        </div>
      )}

      {/* Error overlay */}
      {hasErrors && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '12px',
            pointerEvents: 'none',
          }}
        >
          {/* "Compile failed" heading */}
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#ef5350',
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '0.04em',
            }}
          >
            ✕ Compile failed
          </div>

          {/* Error messages */}
          <div
            style={{
              width: '100%',
              maxHeight: size * 0.6,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {errors.map((err, i) => (
              <div
                key={i}
                style={{
                  fontSize: '9px',
                  color: '#ff8a80',
                  fontFamily: 'var(--font-mono, monospace)',
                  background: 'rgba(239,83,80,0.12)',
                  border: '1px solid rgba(239,83,80,0.25)',
                  borderRadius: 3,
                  padding: '3px 6px',
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                }}
              >
                {err}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
