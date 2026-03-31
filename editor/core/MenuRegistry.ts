// ============================================================
// FluxionJS V3 — Menu Registry
// Central API for registering top-level menu items (File, Edit,
// View, or any custom menu). Mirrors the PanelRegistry pattern.
// ============================================================

import React from 'react';
import type { EditorState, EditorAction, ConsoleEntry } from './EditorState';
import type { EngineSubsystems } from './EditorEngine';
import type { ContextMenuItem } from '../ui/overlays/ContextMenu';

// ── Context passed to dynamic item callbacks at render time ──
export interface MenuContext {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  log: (text: string, type?: ConsoleEntry['type']) => void;
  engine: EngineSubsystems | null;
  // Optional scene / project lifecycle callbacks (provided by Titlebar)
  onNewScene?: () => void;
  onOpenScene?: () => void;
  onSaveScene?: () => void;
  onCloseProject?: () => void;
  onOpenSettings?: () => void;
  onOpenProjectSettings?: () => void;
  /** Resets all panel zone sizes to their defaults (calls PanelLayout.setPanelSize). */
  resetPanelLayout?: () => void;
}

// ── A single registered menu item ────────────────────────────
export interface MenuItemRegistration {
  /** Top-level menu name this item belongs to, e.g. 'File', 'Edit', 'View'. */
  menu: string;
  /** Unique identifier, e.g. 'file.save'. Last registration wins on conflict. */
  id: string;
  /** Display label. May be a function for dynamic labels (e.g. "Undo Move"). */
  label?: string | ((ctx: MenuContext) => string);
  icon?: React.ReactNode;
  shortcut?: string;
  /**
   * Rendering order within the menu — lower number = higher position.
   * Recommended to use multiples of 100 to leave space for insertions.
   */
  order?: number;
  /** If true, renders a separator line instead of a clickable item. */
  separator?: boolean;
  /** Disables the item. May be a function evaluated at render time. */
  disabled?: boolean | ((ctx: MenuContext) => boolean);
  /** Called when the item is clicked. Optional when `children` is provided. */
  onClick?: (ctx: MenuContext) => void;
  /**
   * Nested sub-menu items. When present, the item shows a ► arrow and opens
   * a sub-menu on hover instead of calling onClick.
   */
  children?: MenuItemRegistration[];
}

// ── Registry class ────────────────────────────────────────────
class MenuRegistryClass {
  private readonly items = new Map<string, MenuItemRegistration>();
  /** Ordered list of top-level menu names (insertion order). */
  private readonly menuOrder: string[] = [];

  /** Register a menu item. Safe to call multiple times — last id wins. */
  register(item: MenuItemRegistration): void {
    if (!this.menuOrder.includes(item.menu)) {
      this.menuOrder.push(item.menu);
    }
    this.items.set(item.id, item);
  }

  /** Remove a previously registered item by id. */
  unregister(id: string): void {
    this.items.delete(id);
  }

  /** Returns top-level menu names in registration order. */
  getMenuNames(): string[] {
    return [...this.menuOrder];
  }

  /**
   * Resolves all registered items for a given menu name into a flat
   * `ContextMenuItem[]` ready to pass to `<ContextMenu>`, with dynamic
   * label/disabled evaluated against the provided context.
   */
  resolveItems(menuName: string, ctx: MenuContext): ContextMenuItem[] {
    const raw = Array.from(this.items.values())
      .filter((i) => i.menu === menuName)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return raw.map((item) => this.resolveItem(item, ctx));
  }

  private resolveItem(item: MenuItemRegistration, ctx: MenuContext): ContextMenuItem {
    if (item.separator) {
      return { label: '', onClick: () => {}, separator: true };
    }
    const label = typeof item.label === 'function' ? item.label(ctx) : (item.label ?? '');
    const disabled =
      typeof item.disabled === 'function' ? item.disabled(ctx) : (item.disabled ?? false);
    const children = item.children?.map((c) => this.resolveItem(c, ctx));

    return {
      label,
      icon: item.icon,
      shortcut: item.shortcut,
      disabled,
      children,
      onClick: item.onClick ? () => item.onClick!(ctx) : () => {},
    };
  }
}

export const MenuRegistry = new MenuRegistryClass();
