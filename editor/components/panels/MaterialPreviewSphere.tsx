// ============================================================
// FluxionJS V3 — Material Preview Sphere
// Generic reusable sphere preview for any Three.js material.
// Accepts a `buildMaterial` callback — caller decides how to
// construct the material (FluxMat, VisualMat, etc.).
// Full-width, fixed height, mouse-drag orbit camera.
// Debounces rebuild 400 ms, shows error overlay on failure.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface MaterialPreviewSphereProps {
  buildMaterial: () => Promise<THREE.Material | null>;
  deps: unknown[];
  /** Canvas height in px. Width is always 100% of the container. Default 180. */
  height?: number;
}

export const MaterialPreviewSphere: React.FC<MaterialPreviewSphereProps> = ({
  buildMaterial,
  deps,
  height = 180,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const currentMaterialRef = useRef<THREE.Material | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildRef = useRef(buildMaterial);
  buildRef.current = buildMaterial;

  // Camera orbit state (radians)
  const orbitRef = useRef({ azimuth: 0, elevation: 0.3 });
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; wasDragging: boolean }>({
    active: false, lastX: 0, lastY: 0, wasDragging: false,
  });
  // Auto-rotate only when not being dragged
  const autoRotateRef = useRef(true);

  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  // ── Apply orbit angles to camera ───────────────────────────
  const applyOrbit = () => {
    const cam = cameraRef.current;
    if (!cam) return;
    const { azimuth, elevation } = orbitRef.current;
    const r = 2.6;
    cam.position.set(
      r * Math.cos(elevation) * Math.sin(azimuth),
      r * Math.sin(elevation),
      r * Math.cos(elevation) * Math.cos(azimuth),
    );
    cam.lookAt(0, 0, 0);
  };

  // ── Three.js scene setup ────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const container = containerRef.current;
    if (!mount || !container) return;

    const w = container.clientWidth || 300;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c1c2a);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmrem.dispose();

    scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc0d8ff, 0.4);
    fill.position.set(-4, 0, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.3);
    rim.position.set(0, -3, -4);
    scene.add(rim);

    const geo = new THREE.SphereGeometry(1, 64, 64);
    const defaultMat = new THREE.MeshPhysicalMaterial({ color: 0x888888, metalness: 0, roughness: 0.5 });
    const sphere = new THREE.Mesh(geo, defaultMat);
    scene.add(sphere);
    sphereRef.current = sphere;
    currentMaterialRef.current = defaultMat;

    const camera = new THREE.PerspectiveCamera(45, w / height, 0.1, 100);
    cameraRef.current = camera;
    applyOrbit();

    let stopped = false;
    const animate = () => {
      if (stopped) return;
      rafRef.current = requestAnimationFrame(animate);
      if (autoRotateRef.current) {
        orbitRef.current.azimuth += 0.005;
        applyOrbit();
      }
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer — keeps canvas full-width
    const ro = new ResizeObserver((entries) => {
      const newW = entries[0]?.contentRect.width ?? w;
      if (newW < 1) return;
      renderer.setSize(newW, height);
      camera.aspect = newW / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      stopped = true;
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      geo.dispose();
      currentMaterialRef.current?.dispose();
      envTexture.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      sphereRef.current = null;
      cameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // ── Mouse orbit handlers ────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, wasDragging: false };
    autoRotateRef.current = false;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragRef.current.wasDragging = true;
    orbitRef.current.azimuth -= dx * 0.01;
    orbitRef.current.elevation = Math.max(-1.4, Math.min(1.4, orbitRef.current.elevation + dy * 0.01));
    applyOrbit();
  };

  const onMouseUp = () => {
    dragRef.current.active = false;
  };

  // ── Rebuild on deps change (debounced 400 ms) ──────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const sphere = sphereRef.current;
      if (!sphere) return;

      setIsBuilding(true);
      setError(null);

      try {
        const mat = await buildRef.current();
        if (!mat) { setIsBuilding(false); return; }

        const old = currentMaterialRef.current;
        sphere.material = mat;
        currentMaterialRef.current = mat;
        setTimeout(() => old?.dispose(), 100);
        setError(null);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setIsBuilding(false);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height,
        flexShrink: 0,
        background: '#1c1c2a',
        borderBottom: '1px solid var(--border, #333)',
        overflow: 'hidden',
        cursor: dragRef.current.active ? 'grabbing' : 'grab',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height,
          filter: error ? 'blur(6px) brightness(0.4)' : 'none',
          transition: 'filter 0.25s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Building indicator */}
      {isBuilding && !error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          padding: '6px', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono, monospace)' }}>
            updating…
          </span>
        </div>
      )}

      {/* Drag hint */}
      {!isBuilding && !error && (
        <div style={{
          position: 'absolute', bottom: 6, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono, monospace)' }}>
            drag to orbit
          </span>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '12px', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef5350', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>
            ✕ Preview failed
          </div>
          <div style={{
            fontSize: '9px', color: '#ff8a80',
            fontFamily: 'var(--font-mono, monospace)',
            background: 'rgba(239,83,80,0.12)',
            border: '1px solid rgba(239,83,80,0.25)',
            borderRadius: 3, padding: '3px 6px',
            wordBreak: 'break-word', lineHeight: 1.4,
            maxWidth: '100%',
          }}>
            {error}
          </div>
        </div>
      )}
    </div>
  );
};
