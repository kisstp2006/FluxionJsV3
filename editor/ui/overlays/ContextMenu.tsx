import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  separator?: boolean;
  disabled?: boolean;
  /** Nested items — renders a ► arrow; hover opens sub-menu instead of calling onClick. */
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
  /** Internal: used by sub-menu instances to skip the global mousedown listener. */
  _isSubmenu?: boolean;
}

const MARGIN = 4;
const SUBMENU_DELAY_MS = 150;

// ── Clamp a rectangle to stay within the viewport ────────────
function clampPos(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (x + w > vw - MARGIN) x = vw - w - MARGIN;
  if (y + h > vh - MARGIN) y = vh - h - MARGIN;
  if (x < MARGIN) x = MARGIN;
  if (y < MARGIN) y = MARGIN;
  return { x, y };
}

// ── Single row with optional sub-menu ────────────────────────
const MenuRow: React.FC<{
  item: ContextMenuItem;
  onClose: () => void;
}> = ({ item, onClose }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [subPos, setSubPos] = useState<{ x: number; y: number } | null>(null);

  const hasChildren = (item.children?.length ?? 0) > 0;

  const openSub = useCallback(() => {
    if (!rowRef.current || !hasChildren) return;
    const rect = rowRef.current.getBoundingClientRect();
    // Try right side first; if it would overflow clamp will fix it
    setSubPos({ x: rect.right, y: rect.top });
  }, [hasChildren]);

  const handleMouseEnter = () => {
    if (hasChildren) {
      timerRef.current = setTimeout(openSub, SUBMENU_DELAY_MS);
    }
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!hasChildren) return;
    // The submenu is a DOM child of rowRef (even though position:fixed), so
    // relatedTarget will be inside rowRef when the cursor slides into the submenu.
    const related = e.relatedTarget as Node | null;
    if (rowRef.current && related && rowRef.current.contains(related)) return;
    // Cursor left both the row and the submenu — close it.
    setSubPos(null);
  };

  const handleClick = () => {
    if (item.disabled || hasChildren) return;
    item.onClick();
    onClose();
  };

  return (
    <div
      ref={rowRef}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        height: '24px',
        cursor: item.disabled ? 'default' : 'pointer',
        color: item.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        fontSize: '11px',
        userSelect: 'none',
        position: 'relative',
        background: subPos ? 'var(--bg-active)' : 'transparent',
        transition: 'background var(--transition-fast)',
      }}
      onMouseOver={(e) => {
        if (!item.disabled) (e.currentTarget as HTMLElement).style.background = subPos ? 'var(--bg-active)' : 'var(--bg-hover)';
      }}
      onMouseOut={(e) => {
        if (!subPos) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {item.icon && <span style={{ marginRight: '8px', opacity: 0.7, display: 'inline-flex' }}>{item.icon}</span>}
        {item.label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {item.shortcut && !hasChildren && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            {item.shortcut}
          </span>
        )}
        {hasChildren && (
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1 }}>▶</span>
        )}
      </span>

      {/* Sub-menu portal */}
      {subPos && hasChildren && (
        <ContextMenu
          items={item.children!}
          position={subPos}
          onClose={() => {
            setSubPos(null);
            onClose();
          }}
          _isSubmenu
        />
      )}
    </div>
  );
};

// ── Main ContextMenu ──────────────────────────────────────────
export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose, _isSubmenu }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null);

  // Clamp position so the menu stays fully inside the window
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAdjusted(clampPos(position.x, position.y, rect.width, rect.height));
  }, [position]);

  // Close on outside click — only for root menus (submenus cascade close via onClose prop)
  useEffect(() => {
    if (_isSubmenu) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, _isSubmenu]);

  const pos = adjusted ?? position;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 10000,
        background: 'var(--bg-dropdown)',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        padding: '3px 0',
        minWidth: '170px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
        animation: 'dropdownFadeIn 80ms ease',
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
        ) : (
          <MenuRow key={i} item={item} onClose={onClose} />
        )
      )}
    </div>
  );
};
