// ============================================================
// FluxionJS V3 — Panel Registrations
// All built-in editor panels are registered here.
// Call registerBuiltInPanels() once before React renders.
// ============================================================

import { PanelRegistry } from '../../core/PanelRegistry';
import { Icons } from '../../ui/Icons';

// Panel components — imported lazily at module level so they are
// already bundled; React.lazy is not needed since the main bundle
// already includes all of them.
import { HierarchyPanel }    from '../panels/HierarchyPanel';
import { InspectorPanel }    from '../panels/InspectorPanel';
import { ConsolePanel }      from '../panels/ConsolePanel';
import { AssetBrowserPanel } from '../panels/AssetBrowserPanel';
import { ProfilerPanel }     from '../panels/ProfilerPanel';
import { UndoHistoryPanel }  from '../panels/UndoHistoryPanel';
import { EntityTimeline }    from '../panels/EntityTimeline';
import { BuildPanel }        from '../panels/BuildPanel';

export function registerBuiltInPanels(): void {
  PanelRegistry.register({
    id: 'hierarchy',
    title: 'Hierarchy',
    icon: Icons.prefab,
    component: HierarchyPanel,
    defaultZone: 'left',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: false,
  });

  PanelRegistry.register({
    id: 'inspector',
    title: 'Inspector',
    icon: Icons.settings,
    component: InspectorPanel,
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: false,
  });

  PanelRegistry.register({
    id: 'console',
    title: 'Console',
    icon: Icons.terminal,
    component: ConsolePanel,
    defaultZone: 'bottom',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: true,
  });

  PanelRegistry.register({
    id: 'assets',
    title: 'Assets',
    icon: Icons.folder,
    component: AssetBrowserPanel,
    defaultZone: 'bottom',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: false,
  });

  PanelRegistry.register({
    id: 'profiler',
    title: 'Profiler',
    icon: Icons.activity,
    component: ProfilerPanel,
    defaultZone: 'bottom',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: true,
  });

  PanelRegistry.register({
    id: 'history',
    title: 'History',
    icon: Icons.clock,
    component: UndoHistoryPanel,
    defaultZone: 'bottom',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: true,
  });

  PanelRegistry.register({
    id: 'timeline',
    title: 'Timeline',
    icon: Icons.activity,
    component: EntityTimeline,
    defaultZone: 'bottom',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: false,
  });

  PanelRegistry.register({
    id: 'build',
    title: 'Build',
    icon: Icons.download,
    component: BuildPanel,
    defaultZone: 'bottom',
    allowedZones: ['left', 'right', 'bottom'],
    canDetach: true,
  });
}
