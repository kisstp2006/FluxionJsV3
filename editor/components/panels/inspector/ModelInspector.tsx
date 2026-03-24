// ============================================================
// FluxionJS V3 — Model Asset Inspector
// Vertex/triangle count, bounding box, basic metadata.
// ============================================================

import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem } from '../../../../src/filesystem';
import { AssetTypeRegistry } from '../../../../src/assets/AssetTypeRegistry';
import type { FileInfo } from '../../../../src/filesystem/FileSystem';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
  let vertices = 0;
  let triangles = 0;
  let meshCount = 0;
  const materials = new Set<string>();

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const geo = child.geometry;
      if (geo.index) {
        triangles += geo.index.count / 3;
      } else if (geo.attributes.position) {
        triangles += geo.attributes.position.count / 3;
      }
      if (geo.attributes.position) {
        vertices += geo.attributes.position.count;
      }
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => materials.add(m.uuid));
      else if (mat) materials.add(mat.uuid);
    }
  });

  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    vertices,
    triangles: Math.round(triangles),
    meshCount,
    materialCount: materials.size,
    animationCount: (group as any).animations?.length ?? 0,
    boundingBox: {
      x: size.x.toFixed(2),
      y: size.y.toFixed(2),
      z: size.z.toFixed(2),
    },
  };
}

export const ModelInspector: React.FC<AssetInspectorProps> = ({ assetPath }) => {
  const [fileStat, setFileStat] = useState<FileInfo | null>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() || '';
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  useEffect(() => {
    let cancelled = false;
    const fs = getFileSystem();

    fs.stat(assetPath).then((stat) => {
      if (!cancelled) setFileStat(stat);
    }).catch(() => {});

    // Try to load via AssetTypeRegistry loader or built-in
    const typeDef = AssetTypeRegistry.getByType('model');
    const loadModel = async () => {
      try {
        // Use dynamic import to access the AssetManager loader
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
        const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');

        const url = `file:///${assetPath.replace(/\\/g, '/')}`;

        let group: THREE.Group | null = null;

        if (ext === '.fbx') {
          const loader = new FBXLoader();
          group = await new Promise<THREE.Group>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
        } else if (ext === '.obj') {
          const loader = new OBJLoader();
          group = await new Promise<THREE.Group>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
        } else {
          const loader = new GLTFLoader();
          const gltf = await new Promise<any>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
          group = gltf.scene;
          if (gltf.animations?.length) {
            (group as any).animations = gltf.animations;
          }
        }

        if (!cancelled && group) {
          setStats(analyzeGroup(group));
          // Dispose loaded geometry to free memory
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry?.dispose();
              const mat = child.material;
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
              else if (mat) mat.dispose();
            }
          });
        }
      } catch (err: any) {
        if (!cancelled) setError('Failed to analyze model');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadModel();
    return () => { cancelled = true; };
  }, [assetPath, ext]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    fontSize: '11px',
  };

  return (
    <>
      <Section title="Model Info" defaultOpen>
        <PropertyRow label="File">
          <span style={labelStyle}>{fileName}</span>
        </PropertyRow>
        <PropertyRow label="Format">
          <span style={{ ...labelStyle, color: '#81c784' }}>{ext.replace('.', '').toUpperCase()}</span>
        </PropertyRow>
        {fileStat && (
          <PropertyRow label="Size">
            <span style={labelStyle}>{formatBytes(fileStat.size)}</span>
          </PropertyRow>
        )}
      </Section>

      <Section title="Geometry" defaultOpen>
        {loading && !error && (
          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>Analyzing model...</div>
        )}
        {error && (
          <div style={{ padding: '8px 12px', color: 'var(--accent-red)', fontSize: '11px' }}>{error}</div>
        )}
        {stats && (
          <>
            <PropertyRow label="Vertices">
              <span style={labelStyle}>{stats.vertices.toLocaleString()}</span>
            </PropertyRow>
            <PropertyRow label="Triangles">
              <span style={labelStyle}>{stats.triangles.toLocaleString()}</span>
            </PropertyRow>
            <PropertyRow label="Meshes">
              <span style={labelStyle}>{stats.meshCount}</span>
            </PropertyRow>
            <PropertyRow label="Materials">
              <span style={labelStyle}>{stats.materialCount}</span>
            </PropertyRow>
            {stats.animationCount > 0 && (
              <PropertyRow label="Animations">
                <span style={labelStyle}>{stats.animationCount}</span>
              </PropertyRow>
            )}
            <PropertyRow label="Bounding Box">
              <span style={labelStyle}>
                {stats.boundingBox.x} x {stats.boundingBox.y} x {stats.boundingBox.z}
              </span>
            </PropertyRow>
          </>
        )}
      </Section>
    </>
  );
};
