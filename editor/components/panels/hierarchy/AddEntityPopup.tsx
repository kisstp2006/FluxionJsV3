// ============================================================
// FluxionJS V3 — Add Entity Popup
// Categorized, searchable entity creator.
// Hardcoded categories (entity templates, not registry-driven).
// ============================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { SearchInput, Icons } from '../../../ui';

export interface EntityTemplate {
  type: string;
  label: string;
  icon: React.ReactNode;
}

export interface EntityCategory {
  label: string;
  items: EntityTemplate[];
}

// ── Template definitions (static — defined once at module level, never recreated) ──
const ENTITY_CATEGORIES: EntityCategory[] = [
  {
    label: 'Primitives',
    items: [
      { type: 'empty',    label: 'Empty',    icon: Icons.entity   },
      { type: 'cube',     label: 'Cube',     icon: Icons.cube     },
      { type: 'sphere',   label: 'Sphere',   icon: Icons.sphere   },
      { type: 'cylinder', label: 'Cylinder', icon: Icons.cube     },
      { type: 'cone',     label: 'Cone',     icon: Icons.cone     },
      { type: 'plane',    label: 'Plane',    icon: Icons.plane    },
      { type: 'capsule',  label: 'Capsule',  icon: Icons.capsule  },
      { type: 'torus',    label: 'Torus',    icon: Icons.torus    },
    ],
  },
  {
    label: 'Lights',
    items: [
      { type: 'directional', label: 'Directional Light', icon: Icons.light      },
      { type: 'point',       label: 'Point Light',       icon: Icons.pointLight },
      { type: 'spot',        label: 'Spot Light',        icon: Icons.light      },
      { type: 'ambient',     label: 'Ambient Light',     icon: Icons.light      },
    ],
  },
  {
    label: '3D',
    items: [
      { type: 'camera',   label: 'Camera',          icon: Icons.camera   },
      { type: 'particle', label: 'Particle System', icon: Icons.particle },
      { type: 'text3d',   label: '3D Text',         icon: '𝐓'            },
      { type: 'sprite',   label: 'Sprite',          icon: '🖼'            },
    ],
  },
  {
    label: 'Physics',
    items: [
      { type: 'physics_box',    label: 'Physics Box',    icon: Icons.physics },
      { type: 'physics_sphere', label: 'Physics Sphere', icon: Icons.physics },
    ],
  },
];

interface AddEntityPopupProps {
  position: { x: number; y: number };
  onClose: () => void;
  onAdd: (category: string, type: string) => void;
}

export const AddEntityPopup: React.FC<AddEntityPopupProps> = ({
  position,
  onClose,
  onAdd,
}) => {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Filter categories/items — recomputed only when query changes
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ENTITY_CATEGORIES;

    const result: EntityCategory[] = [];
    for (const cat of ENTITY_CATEGORIES) {
      const catMatch = cat.label.toLowerCase().includes(q);
      const items = catMatch
        ? cat.items
        : cat.items.filter(item => item.label.toLowerCase().includes(q));
      if (items.length > 0) result.push({ label: cat.label, items });
    }
    return result;
  }, [query]);

  const handleAdd = useCallback((cat: string, type: string) => {
    onAdd(cat, type);
    onClose();
  }, [onAdd, onClose]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10000,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        width: '220px',
        maxHeight: '380px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Search bar */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search..."
          autoFocus
        />
      </div>

      {/* Category list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '12px',
            fontStyle: 'italic',
          }}>
            No results
          </div>
        ) : (
          filtered.map((cat, ci) => (
            <div key={cat.label}>
              {/* Divider between categories */}
              {ci > 0 && (
                <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
              )}

              {/* Category header */}
              <div style={{
                padding: '5px 10px 2px',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
              }}>
                {cat.label}
              </div>

              {/* Items */}
              {cat.items.map(item => (
                <EntityItem
                  key={item.type}
                  item={item}
                  category={cat.label}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ── Isolated item row — memo prevents re-render when siblings change ──
interface EntityItemProps {
  item: EntityTemplate;
  category: string;
  onAdd: (category: string, type: string) => void;
}

const EntityItem = React.memo<EntityItemProps>(({ item, category, onAdd }) => {
  const handleClick = useCallback(() => {
    onAdd(category, item.type);
  }, [onAdd, category, item.type]);

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '5px 12px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-primary)',
        fontSize: '12px',
        textAlign: 'left',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <span style={{ width: '16px', textAlign: 'center', opacity: 0.7, flexShrink: 0 }}>
        {item.icon}
      </span>
      {item.label}
    </button>
  );
});
