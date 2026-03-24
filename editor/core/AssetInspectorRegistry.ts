// ============================================================
// FluxionJS V3 — Asset Inspector Registry
// Pluggable registry: asset type → React inspector component.
// Inspired by Stride IAssetEditor and ezEngine DocumentManager.
// ============================================================

import React from 'react';

/** Props passed to every asset inspector component. */
export interface AssetInspectorProps {
  /** Absolute path to the asset file. */
  assetPath: string;
  /** Resolved asset type id (e.g. 'texture', 'audio', 'material'). */
  assetType: string;
}

class AssetInspectorRegistryImpl {
  private inspectors = new Map<string, React.FC<AssetInspectorProps>>();

  /** Register a custom inspector component for an asset type. */
  register(assetType: string, component: React.FC<AssetInspectorProps>): void {
    this.inspectors.set(assetType, component);
  }

  /** Get the inspector component for a given asset type (or undefined for fallback). */
  get(assetType: string): React.FC<AssetInspectorProps> | undefined {
    return this.inspectors.get(assetType);
  }

  /** Check whether a custom inspector exists for the type. */
  has(assetType: string): boolean {
    return this.inspectors.has(assetType);
  }
}

export const AssetInspectorRegistry = new AssetInspectorRegistryImpl();
