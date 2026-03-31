// ============================================================
// FluxionJS V3 — Built-in Menu Registrations
// Migrates all hardcoded File / Edit / View items into the
// MenuRegistry. Call registerBuiltInMenus() before React renders.
// ============================================================

import { MenuRegistry } from '../../core/MenuRegistry';
import { Icons } from '../../ui/Icons';
import { undoManager, DuplicateEntityCommand, DeleteEntityCommand } from '../../core/UndoService';

export function registerBuiltInMenus(): void {

  // ── File ───────────────────────────────────────────────────
  MenuRegistry.register({
    menu: 'File', id: 'file.new', label: 'New Scene',
    icon: Icons.file, shortcut: 'Ctrl+N', order: 100,
    onClick: (ctx) => ctx.onNewScene?.(),
  });

  MenuRegistry.register({
    menu: 'File', id: 'file.open', label: 'Open Scene...',
    icon: Icons.folderOpen, shortcut: 'Ctrl+O', order: 200,
    onClick: (ctx) => ctx.onOpenScene?.(),
  });

  MenuRegistry.register({
    menu: 'File', id: 'file.save', label: 'Save Scene',
    icon: Icons.save, shortcut: 'Ctrl+S', order: 300,
    onClick: (ctx) => ctx.onSaveScene?.(),
  });

  MenuRegistry.register({
    menu: 'File', id: 'file.sep1', label: '', order: 400, separator: true,
    onClick: () => {},
  });

  MenuRegistry.register({
    menu: 'File', id: 'file.closeProject', label: 'Close Project',
    icon: Icons.folder, order: 500,
    onClick: (ctx) => ctx.onCloseProject?.(),
  });

  MenuRegistry.register({
    menu: 'File', id: 'file.sep2', label: '', order: 600, separator: true,
    onClick: () => {},
  });

  MenuRegistry.register({
    menu: 'File', id: 'file.exit', label: 'Exit',
    icon: Icons.close, shortcut: 'Alt+F4', order: 700,
    onClick: () => { window.fluxionAPI?.close(); },
  });

  // ── Edit ───────────────────────────────────────────────────
  MenuRegistry.register({
    menu: 'Edit', id: 'edit.undo',
    label: (ctx) => `Undo${undoManager.undoLabel ? ` ${undoManager.undoLabel}` : ''}`,
    icon: Icons.undo, shortcut: 'Ctrl+Z', order: 100,
    disabled: () => !undoManager.canUndo(),
    onClick: ({ log }) => {
      const cmd = undoManager.undo();
      if (cmd) log(`Undo: ${cmd.label}`, 'info');
    },
  });

  MenuRegistry.register({
    menu: 'Edit', id: 'edit.redo',
    label: (ctx) => `Redo${undoManager.redoLabel ? ` ${undoManager.redoLabel}` : ''}`,
    icon: Icons.redo, shortcut: 'Ctrl+Y', order: 200,
    disabled: () => !undoManager.canRedo(),
    onClick: ({ log }) => {
      const cmd = undoManager.redo();
      if (cmd) log(`Redo: ${cmd.label}`, 'info');
    },
  });

  MenuRegistry.register({
    menu: 'Edit', id: 'edit.sep1', label: '', order: 300, separator: true,
    onClick: () => {},
  });

  MenuRegistry.register({
    menu: 'Edit', id: 'edit.duplicate', label: 'Duplicate',
    icon: Icons.copy, shortcut: 'Ctrl+D', order: 400,
    disabled: ({ state }) => state.selectedEntity === null,
    onClick: ({ state, dispatch, log, engine }) => {
      if (!engine || state.selectedEntity === null) return;
      const ecs = engine.engine.ecs;
      undoManager.execute(new DuplicateEntityCommand(
        () => engine.scene.cloneEntity(state.selectedEntity!),
        ecs,
        (clone) => {
          log(`Duplicated: ${ecs.getEntityName(clone)}`, 'info');
          dispatch({ type: 'SELECT_ENTITY', entity: clone });
          dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
        },
      ));
    },
  });

  MenuRegistry.register({
    menu: 'Edit', id: 'edit.delete', label: 'Delete',
    icon: Icons.trash, shortcut: 'Del', order: 500,
    disabled: ({ state }) => state.selectedEntity === null,
    onClick: ({ state, dispatch, log, engine }) => {
      if (!engine || state.selectedEntity === null) return;
      const target = state.selectedEntity;
      const name = engine.engine.ecs.getEntityName(target);
      undoManager.execute(new DeleteEntityCommand(
        target, engine.engine.ecs, engine.engine,
        (newId) => {
          dispatch({ type: 'SELECT_ENTITY', entity: newId });
          dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
        },
      ));
      dispatch({ type: 'SELECT_ENTITY', entity: null });
      dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
      log(`Deleted entity: ${name}`, 'warn');
    },
  });

  // ── View ───────────────────────────────────────────────────
  MenuRegistry.register({
    menu: 'View', id: 'view.grid', label: 'Toggle Grid',
    icon: Icons.grid, order: 100,
    onClick: ({ dispatch }) => dispatch({ type: 'TOGGLE_GRID' }),
  });

  MenuRegistry.register({
    menu: 'View', id: 'view.wireframe', label: 'Toggle Wireframe',
    icon: Icons.eye, order: 200,
    onClick: ({ dispatch, state }) =>
      dispatch({ type: 'SET_VIEWPORT_SHADING', mode: state.viewportShading === 'wireframe' ? 'lit' : 'wireframe' }),
  });

  MenuRegistry.register({
    menu: 'View', id: 'view.sep1', label: '', order: 300, separator: true,
    onClick: () => {},
  });

  MenuRegistry.register({
    menu: 'View', id: 'view.settings', label: 'Settings',
    icon: Icons.settings, order: 400,
    onClick: (ctx) => ctx.onOpenSettings?.(),
  });

  MenuRegistry.register({
    menu: 'View', id: 'view.projectSettings', label: 'Project Settings',
    icon: Icons.clipboard, order: 500,
    onClick: (ctx) => ctx.onOpenProjectSettings?.(),
  });

  MenuRegistry.register({
    menu: 'View', id: 'view.sep2', label: '', order: 600, separator: true,
    onClick: () => {},
  });

  MenuRegistry.register({
    menu: 'View', id: 'view.resetLayout', label: 'Reset Layout',
    icon: Icons.refresh, order: 700,
    onClick: ({ log, resetPanelLayout }) => {
      resetPanelLayout?.();
      log('Layout reset', 'info');
    },
  });
}
