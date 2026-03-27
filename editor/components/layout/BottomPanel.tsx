// ============================================================
// FluxionJS V2 — Bottom Panel Container
// Tabbed panel: Console / Assets / Profiler
// ============================================================

import React from 'react';
import { TabBar, Icons } from '../../ui';
import type { TabItem } from '../../ui/layout/TabBar';
import { useEditor, BottomTab } from '../../core/EditorContext';
import { ConsolePanel } from '../panels/ConsolePanel';
import { AssetBrowserPanel } from '../panels/AssetBrowserPanel';
import { ProfilerPanel } from '../panels/ProfilerPanel';
import { UndoHistoryPanel } from '../panels/UndoHistoryPanel';

export const BottomPanel: React.FC = () => {
  const { state, dispatch } = useEditor();

  const panels: Record<BottomTab, React.ReactNode> = {
    console: <ConsolePanel />,
    assets: <AssetBrowserPanel />,
    profiler: <ProfilerPanel />,
    history: <UndoHistoryPanel />,
  };

  const TAB_LABELS: Record<BottomTab, string> = {
    console: 'Console',
    assets: 'Assets',
    profiler: 'Profiler',
    history: 'History',
  };

  const TABS: TabItem[] = [
    { label: 'Console',  icon: Icons.terminal },
    { label: 'Assets',   icon: Icons.folder },
    { label: 'Profiler', icon: Icons.activity },
    { label: 'History',  icon: Icons.clock },
  ];

  return (
    <div style={{
      height: '100%',
      background: 'var(--bg-panel)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <TabBar
        tabs={TABS}
        activeTab={TAB_LABELS[state.bottomTab]}
        onTabChange={(tab) => dispatch({
          type: 'SET_BOTTOM_TAB',
          tab: tab.toLowerCase() as BottomTab,
        })}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {panels[state.bottomTab]}
      </div>
    </div>
  );
};
