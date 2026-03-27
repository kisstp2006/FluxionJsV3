// ============================================================
// FluxionJS V3 — SvgIcon
// Renders a raw Feather SVG string as an inline React element.
// Size and stroke colour are patched directly into the SVG markup
// so no extra DOM wrappers affect layout or hit-testing.
// ============================================================

import React from 'react';

export interface SvgIconProps {
  /** Raw SVG string (imported via webpack asset/source). */
  svg: string;
  /** Width and height in pixels. Default: 14. */
  size?: number;
  /**
   * Stroke colour.  Use `'currentColor'` (default) to inherit from CSS.
   * Pass an explicit hex / rgb value for coloured icons.
   */
  color?: string;
  /** Extra inline styles applied to the wrapping <span>. */
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Renders a Feather SVG icon inline.
 * The SVG's `width`, `height`, and `stroke` attributes are patched at
 * render time so every icon respects the `size` and `color` props without
 * needing a separate CSS file or a class per icon.
 */
export const SvgIcon: React.FC<SvgIconProps> = ({
  svg,
  size = 14,
  color = 'currentColor',
  style,
  className,
}) => {
  // Patch width / height to the requested size.
  let html = svg
    .replace(/\swidth="[^"]*"/, ` width="${size}"`)
    .replace(/\sheight="[^"]*"/, ` height="${size}"`);

  // Patch stroke colour only when an explicit colour is given.
  if (color !== 'currentColor') {
    html = html.replace(/stroke="currentColor"/g, `stroke="${color}"`);
  }

  return (
    <span
      className={className}
      // line-height:0 prevents the <span> from adding phantom descender space.
      style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0, flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
