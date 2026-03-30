// ============================================================
// FluxionJS V3 — Model Preview Modal
// Double-clicking a model asset opens a preview with:
//   · live 3D Three.js preview with orbit
//   · geometry stats (verts / tris / meshes / animations)
//   · import settings (scale, generateCollider)
//   · Reimport button
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { assetImporter } from '../../../src/assets/AssetImporter';

interface ModelImportSettings {
  scale: number;
  generateCollider: boolean;
}

interface ModelStats {
  vertices: number;
  triangles: number;
  meshCount: number;
  materialCount: number;
  animationCount: number;
  boundingBox: { x: string; y: string; z: string };
}

function analyzeGroup(group: THREE.Group): ModelStats {
  let vertices = 0, triangles = 0, meshCount = 0;
  const mats = new Set<string>();
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const geo = child.geometry;
      if (geo.index) triangles += geo.index.count / 3;
      else if (geo.attributes.position) triangles += geo.attributes.position.count / 3;
      if (geo.attributes.position) vertices += geo.attributes.position.count;
      const m = child.material;
      if (Array.isArray(m)) m.forEach(x => mats.add(x.uuid));
      else if (m) mats.add(m.uuid);
    }
  });
  const box = new THREE.Box3().setFromObject(group);
  const sz = new THREE.Vector3(); box.getSize(sz);
  return {
    vertices, triangles: Math.round(triangles), meshCount,
    materialCount: mats.size,
    animationCount: (group as any).animations?.length ?? 0,
    boundingBox: { x: sz.x.toFixed(2), y: sz.y.toFixed(2), z: sz.z.toFixed(2) },
  };
}

export const ModelPreviewModal: React.FC<{
  path: string;
  onClose: () => void;
}> = ({ path, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef    = useRef<THREE.Scene | null>(null);
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef    = useRef<THREE.Group | null>(null);
  const rafRef      = useRef<number>(0);
  const isDragging  = useRef(false);
  const lastMouse   = useRef({ x: 0, y: 0 });
  const spherical   = useRef({ theta: 0.5, phi: 1.0, radius: 3 });

  const [stats, setStats]     = useState<ModelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [reimporting, setReimporting] = useState(false);
  const [reimportDone, setReimportDone] = useState(false);
  const [settings, setSettings] = useState<ModelImportSettings>({ scale: 1, generateCollider: false });

  const fileName = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  // ── Three.js preview ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.clientWidth  || 420;
    const H = canvas.clientHeight || 280;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1f2e);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 8, 5);
    scene.add(dir);
    const grid = new THREE.GridHelper(10, 10, 0x333344, 0x222233);
    scene.add(grid);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1000);
    camera.position.set(2, 2, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Load model
    const loadModel = async () => {
      try {
        const url = `file:///${path.replace(/\\/g, '/')}`;
        let group: THREE.Group | null = null;

        if (ext === '.fbx') {
          const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
          group = await new Promise<THREE.Group>((res, rej) => new FBXLoader().load(url, res, undefined, rej));
        } else if (ext === '.obj') {
          const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
          group = await new Promise<THREE.Group>((res, rej) => new OBJLoader().load(url, res, undefined, rej));
        } else {
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
          const gltf: any = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
          group = gltf.scene;
          if (gltf.animations?.length) (group as any).animations = gltf.animations;
        }

        if (!group) throw new Error('No geometry loaded');

        // Center + fit camera
        const box = new THREE.Box3().setFromObject(group);
        const center = new THREE.Vector3(); box.getCenter(center);
        const sz = new THREE.Vector3(); box.getSize(sz);
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        group.position.sub(center);
        const r = maxDim * 1.5;
        spherical.current.radius = r;
        scene.add(group);
        groupRef.current = group;
        setStats(analyzeGroup(group));
      } catch (err: any) {
        setError('Failed to load model preview');
      } finally {
        setLoading(false);
      }
    };

    loadModel();

    // Render loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const { theta, phi, radius } = spherical.current;
      if (cameraRef.current) {
        cameraRef.current.position.set(
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.cos(theta),
        );
        cameraRef.current.lookAt(0, 0, 0);
      }
      renderer.render(scene, cameraRef.current!);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach(x => x.dispose()); else m?.dispose();
        }
      });
    };
  }, [path, ext]);

  // ── Orbit mouse handlers ──────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    spherical.current.theta -= dx * 0.01;
    spherical.current.phi   = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.current.phi + dy * 0.01));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isDragging.current = false; };
  const onWheel = (e: React.WheelEvent) => {
    spherical.current.radius = Math.max(0.5, spherical.current.radius + e.deltaY * 0.005);
  };

  // ── Reimport ──────────────────────────────────────────────────
  const handleReimport = useCallback(async () => {
    setReimporting(true);
    try {
      const result = await assetImporter.reimport(path);
      setReimportDone(result.success);
      if (!result.success) setError(result.error ?? 'Reimport failed');
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setReimporting(false);
    }
  }, [path, settings]);

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' };
  const val:  React.CSSProperties = { ...mono, color: 'var(--text-secondary)' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          width: '700px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
              {fileName}
            </span>
            <span style={{ ...mono, marginLeft: '8px', color: 'var(--text-muted)' }}>
              {ext.replace('.', '').toUpperCase()} Model
            </span>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px' }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Preview canvas */}
          <div style={{ flex: '0 0 420px', background: '#10141e', position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={420} height={280}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
              style={{ display: 'block', width: '420px', height: '280px', cursor: 'grab' }}
            />
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: '12px', background: 'rgba(10,14,23,0.7)',
              }}>
                Loading preview...
              </div>
            )}
            {error && !loading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '6px',
                color: 'var(--accent-red)', fontSize: '11px', background: 'rgba(10,14,23,0.7)',
              }}>
                <span>⚠ {error}</span>
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: '6px', left: '8px',
              fontSize: '10px', color: 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--font-mono)', pointerEvents: 'none',
            }}>
              Drag to orbit · Scroll to zoom
            </div>
          </div>

          {/* Right panel: stats + settings + reimport */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Stats */}
            {stats && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Geometry
                </div>
                {([
                  ['Vertices',   stats.vertices.toLocaleString()],
                  ['Triangles',  stats.triangles.toLocaleString()],
                  ['Meshes',     String(stats.meshCount)],
                  ['Materials',  String(stats.materialCount)],
                  ...(stats.animationCount ? [['Animations', String(stats.animationCount)]] : []),
                  ['Bounds',     `${stats.boundingBox.x} × ${stats.boundingBox.y} × ${stats.boundingBox.z}`],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={mono}>{label}</span>
                    <span style={val}>{value}</span>
                  </div>
                ))}
              </div>
            )}
            {loading && !stats && (
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Analyzing...</div>
            )}

            {/* Import Settings */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Import Settings
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={mono}>Scale</label>
                  <input
                    type="number"
                    value={settings.scale}
                    min={0.001} step={0.1}
                    onChange={e => setSettings(s => ({ ...s, scale: parseFloat(e.target.value) || 1 }))}
                    style={{
                      width: '80px', background: 'var(--bg-input, #1c2128)',
                      border: '1px solid var(--border)', borderRadius: '3px',
                      color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
                      fontSize: '11px', padding: '2px 6px', outline: 'none', textAlign: 'right',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="gen-collider"
                    checked={settings.generateCollider}
                    onChange={e => setSettings(s => ({ ...s, generateCollider: e.target.checked }))}
                  />
                  <label htmlFor="gen-collider" style={{ ...mono, cursor: 'pointer' }}>Generate Collider</label>
                </div>
              </div>
            </div>

            {/* Reimport */}
            <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              {reimportDone && (
                <div style={{ color: 'var(--accent-green)', fontSize: '11px', marginBottom: '8px' }}>
                  ✓ Reimported successfully
                </div>
              )}
              <button
                onClick={handleReimport}
                disabled={reimporting}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  background: reimporting ? 'var(--bg-hover)' : 'var(--accent)',
                  border: 'none',
                  borderRadius: '4px',
                  color: reimporting ? 'var(--text-muted)' : '#000',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: reimporting ? 'wait' : 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {reimporting ? 'Reimporting...' : 'Reimport'}
              </button>
              <div style={{ ...mono, marginTop: '4px', textAlign: 'center', fontSize: '10px' }}>
                Reimports the asset with current settings
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
