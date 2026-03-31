// ============================================================
// FluxionJS V3 — Panel Container
// Renders all panels for a given zone as tabs. ALL panels stay
// mounted; inactive ones are hidden via display:none so their
// React state (filters, scroll, etc.) is preserved on tab switch.
// Supports drag-and-drop reordering / moving between zones,
// plus a right-click context menu per tab.
// ============================================================

import React, { useRef, useState, useCallback } from 'react';
import { PanelRegistry, PanelZone } from '../../core/PanelRegistry';
import { usePanelLayout } from '../../core/PanelLayoutContext';
import { ContextMenu, ContextMenuItem } from '../../ui/overlays/ContextMenu';

// ── Drag state (module-level singleton is fine — only one drag at a time) ──
let dragPanelId: string | null = null;

interface PanelContainerProps {
  zone: PanelZone;
  /** Called by the parent to request a detach (passes control up so the
   *  parent can decide OS-window vs. floating based on the setting). */
  onDetachRequest: (id: string) => void;
}

export const PanelContainer: React.FC<PanelContainerProps> = ({ zone, onDetachRequest }) => {
  const { layout, setActiveTab, movePanel } = usePanelLayout();
  const panelIds = layout.zones[zone];
  const activeId = layout.activeTab[zone];

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; panelId: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // ── Tab drag ──
  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragPanelId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragPanelId = null;
    setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!dragPanelId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = dragPanelId ?? e.dataTransfer.getData('text/plain');
    if (!id) return;
    const reg = PanelRegistry.get(id);
    if (!reg) return;
    if (reg.allowedZones.includes(zone)) {
      movePanel(id, zone);
    }
    dragPanelId = null;
  }, [zone, movePanel]);

  // ── Context menu ──
  const handleTabContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, panelId: id });
  }, []);

  const buildContextMenuItems = (panelId: string): ContextMenuItem[] => {
    const reg = PanelRegistry.get(panelId);
    if (!reg) return [];

    const allZones: { zone: PanelZone; label: string }[] = [
      { zone: 'left',   label: 'Move to Left' },
      { zone: 'right',  label: 'Move to Right' },
      { zone: 'bottom', label: 'Move to Bottom' },
    ];

    const moveItems: ContextMenuItem[] = allZones
      .filter(({ zone: z }) => z !== zone && reg.allowedZones.includes(z))
      .map(({ zone: z, label }) => ({
        label,
        onClick: () => movePanel(panelId, z),
      }));

    const items: ContextMenuItem[] = [...moveItems];

    if (reg.canDetach) {
      if (items.length > 0) items.push({ label: '—', separator: true, onClick: () => {} });
      items.push({
        label: 'Detach',
        onClick: () => onDetachRequest(panelId),
      });
    }

    return items;
  };

  // ── Empty zone guard ──
  if (panelIds.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div
        ref={tabBarRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          flexShrink: 0,
          background: dragOver ? 'var(--bg-hover)' : 'var(--bg-secondary)',
          borderBottom: `1px solid ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        {/* Scrollable tabs section */}
        <div style={{ display: 'flex', overflowX: 'auto', flex: 1, minWidth: 0 }}>
          {panelIds.map((id) => {
            const reg = PanelRegistry.get(id);
            if (!reg) return null;
            const isActive = id === activeId;
            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => handleDragStart(e, id)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveTab(zone, id)}
                onContextMenu={(e) => handleTabContextMenu(e, id)}
                title={`${reg.title} — right-click for options`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(13,17,23,0.8)' : 'transparent',
                  borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  userSelect: 'none',
                  flexShrink: 0,
                  transition: 'all 100ms ease',
                }}
              >
                {reg.icon && <span style={{ opacity: 0.75, display: 'flex', alignItems: 'center' }}>{reg.icon}</span>}
                {reg.title}
              </div>
            );
          })}
        </div>

        {/* Active panel's context actions (right side) */}
        {(() => {
          const activeReg = PanelRegistry.get(activeId);
          if (!activeReg?.tabActions) return null;
          const TabActions = activeReg.tabActions;
          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 6px',
              flexShrink: 0,
              borderLeft: '1px solid var(--border)',
            }}>
              <TabActions />
            </div>
          );
        })()}
      </div>

      {/* Panel bodies — all mounted, only active shown */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {panelIds.map((id) => {
          const reg = PanelRegistry.get(id);
          if (!reg) return null;
          const Comp = reg.component;
          return (
            <div
              key={id}
              style={{
                display: id === activeId ? 'flex' : 'none',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
              }}
            >
              <Comp />
            </div>
          );
        })}
      </div>

      {/* Tab context menu */}
      {ctxMenu && (
        <ContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          items={buildContextMenuItems(ctxMenu.panelId)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
