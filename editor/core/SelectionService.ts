// ============================================================
// FluxionJS V2 — Selection Service
// Centralized selection management
// ============================================================

import { EntityId } from '../../src/core/ECS';
import { EditorAction } from './EditorState';

/** Select an entity via dispatch. */
export function selectEntity(
  dispatch: React.Dispatch<EditorAction>,
  entity: EntityId | null,
): void {
  dispatch({ type: 'SELECT_ENTITY', entity });
}

/** Copy entity to clipboard via dispatch. */
export function copyToClipboard(
  dispatch: React.Dispatch<EditorAction>,
  entity: EntityId | null,
): void {
  dispatch({ type: 'SET_CLIPBOARD', entity });
}
