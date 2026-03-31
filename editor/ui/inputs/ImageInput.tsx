// ============================================================
// FluxionJS V3 — ImageInput
// Dedicated image/texture asset picker for inspector panels.
// Wraps AssetInput with assetType="texture" and exposes a
// typed ImageValue interface for use in FUI inspector and
// anywhere an image path is needed.
// ============================================================

import React from 'react';
import { AssetInput } from './AssetInput';

export interface ImageValue {
  /** Project-relative path to the image/texture file. */
  path: string;
}

export interface ImageInputProps {
  /** Current image path (project-relative) or null/empty. */
  value: string | null | undefined;
  /** Called with project-relative path, or '' to clear. */
  onChange: (value: string) => void;
  /** Placeholder text when no image is selected. */
  placeholder?: string;
}

export const ImageInput: React.FC<ImageInputProps> = ({
  value,
  onChange,
  placeholder = 'Select image…',
}) => (
  <AssetInput
    value={value ?? null}
    assetType="texture"
    placeholder={placeholder}
    onChange={onChange}
  />
);
