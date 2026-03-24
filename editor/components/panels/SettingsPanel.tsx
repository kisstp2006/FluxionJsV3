// ============================================================
// FluxionJS V3 — Settings Panel
// Full settings UI: category sidebar, settings list with
// per-setting reset button, hover descriptions, search.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SettingsRegistry,
  SettingDescriptor,
  SettingType,
} from '../../core/SettingsRegistry';
import {
  PropertyRow,
  Section,
  SearchInput,
  NumberInput,
  Checkbox,
  Select,
  Slider,
  ColorInput,
  TextInput,
  Tooltip,
  Icons,
} from '../../ui';

// ── Setting Input Widget ──

const SettingInput: React.FC<{
  descriptor: SettingDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ descriptor, value, onChange }) => {
  switch (descriptor.type as SettingType) {
    case 'boolean':
      return <Checkbox checked={value as boolean} onChange={onChange} />;

    case 'number':
      return (
        <NumberInput
          value={value as number}
          onChange={onChange}
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step ?? 1}
        />
      );

    case 'slider':
      return (
        <Slider
          value={value as number}
          onChange={onChange}
          min={descriptor.min ?? 0}
          max={descriptor.max ?? 1}
          step={descriptor.step ?? 0.01}
        />
      );

    case 'select':
      return (
        <Select
          value={String(value)}
          onChange={onChange}
          options={descriptor.options ?? []}
        />
      );

    case 'color':
      return (
        <ColorInput
          value={value as string}
          onChange={onChange}
        />
      );

    case 'string':
    default:
      return (
        <TextInput
          value={String(value ?? '')}
          onChange={onChange}
        />
      );
  }
};

// ── Reset Button ──

const ResetButton: React.FC<{
  settingKey: string;
  isModified: boolean;
}> = ({ settingKey, isModified }) => {
  if (!isModified) return null;

  return (
    <Tooltip text="Reset to default">
      <button
        onClick={() => SettingsRegistry.resetToDefault(settingKey)}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          color: 'var(--accent-yellow)',
          cursor: 'pointer',
          padding: '1px 5px',
          fontSize: '11px',
          lineHeight: '16px',
          flexShrink: 0,
          transition: 'all 150ms ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-yellow)';
          (e.currentTarget as HTMLElement).style.background = 'rgba(210, 153, 34, 0.1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          (e.currentTarget as HTMLElement).style.background = 'none';
        }}
      >
        ↺
      </button>
    </Tooltip>
  );
};

// ── Single Setting Row ──

const SettingRow: React.FC<{
  descriptor: SettingDescriptor;
  value: unknown;
  isModified: boolean;
}> = ({ descriptor, value, isModified }) => {
  const [hovered, setHovered] = useState(false);

  const handleChange = useCallback((v: unknown) => {
    SettingsRegistry.set(descriptor.key, v);
  }, [descriptor.key]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '3px 0',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <div style={{ flex: 1 }}>
          <PropertyRow label={descriptor.label} labelWidth={140}>
            <SettingInput
              descriptor={descriptor}
              value={value}
              onChange={handleChange}
            />
          </PropertyRow>
        </div>
        <ResetButton settingKey={descriptor.key} isModified={isModified} />
      </div>

      {/* Description tooltip on hover */}
      {hovered && descriptor.description && (
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '100%',
          marginBottom: '2px',
          background: 'var(--bg-tertiary, #1c2129)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {descriptor.description}
          {isModified && (
            <span style={{ color: 'var(--accent-yellow)', marginLeft: '6px' }}>
              (modified)
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Settings Panel ──

export const SettingsPanel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  // Subscribe to registry changes for live updates
  useEffect(() => {
    const unsub = SettingsRegistry.on(() => {
      forceUpdate((n) => n + 1);
    });
    return unsub;
  }, []);

  // Get categories
  const categories = useMemo(() => SettingsRegistry.getCategoryNames(), []);
  const byCategory = useMemo(() => SettingsRegistry.getByCategory(), []);

  // Set default active category
  useEffect(() => {
    if (!activeCategory && categories.length > 0) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  // Filter settings by search query
  const filteredByCategory = useMemo(() => {
    if (!searchQuery.trim()) return byCategory;

    const q = searchQuery.toLowerCase();
    const filtered = new Map<string, SettingDescriptor[]>();

    for (const [cat, settings] of byCategory) {
      const matched = settings.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.key.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
      );
      if (matched.length > 0) {
        filtered.set(cat, matched);
      }
    }
    return filtered;
  }, [searchQuery, byCategory]);

  const displayCategories = useMemo(() => {
    return categories.filter((c) => filteredByCategory.has(c));
  }, [categories, filteredByCategory]);

  // When searching, show all categories
  const showAll = searchQuery.trim().length > 0;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{
        width: '740px',
        maxWidth: '90vw',
        height: '520px',
        maxHeight: '80vh',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}>
          <span style={{
            fontWeight: 700,
            fontSize: '13px',
            color: 'var(--text-primary)',
          }}>
            {Icons.settings} Settings
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Tooltip text="Reset all settings to defaults">
              <button
                onClick={() => {
                  if (confirm('Reset ALL settings to their defaults?')) {
                    SettingsRegistry.resetAll();
                  }
                }}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--accent-red)',
                  cursor: 'pointer',
                  padding: '3px 8px',
                  fontSize: '11px',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(248, 81, 73, 0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'none';
                }}
              >
                ↺ Reset All
              </button>
            </Tooltip>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 6px',
                borderRadius: '4px',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'none';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              {Icons.close}
            </button>
          </div>
        </div>

        {/* Search */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search settings..."
        />

        {/* Body: Category sidebar + Settings list */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}>
          {/* Category Sidebar */}
          <div style={{
            width: '180px',
            minWidth: '180px',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            background: 'var(--bg-secondary)',
          }}>
            {displayCategories.map((cat) => {
              const info = SettingsRegistry.getCategoryInfo(cat);
              const isActive = activeCategory === cat;
              // Count modified settings in this category
              const settings = filteredByCategory.get(cat) ?? [];
              const modifiedCount = settings.filter(
                (s) => SettingsRegistry.isModified(s.key)
              ).length;

              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '7px 12px',
                    background: isActive ? 'rgba(88, 166, 255, 0.08)' : 'transparent',
                    border: 'none',
                    borderLeft: isActive
                      ? '2px solid var(--accent)'
                      : '2px solid transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textAlign: 'left',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }
                  }}
                >
                  <span>
                    {info?.icon && `${info.icon} `}
                    {cat.includes('/') ? cat.split('/').pop() : cat}
                  </span>
                  {modifiedCount > 0 && (
                    <span style={{
                      background: 'var(--accent-yellow)',
                      color: '#000',
                      borderRadius: '8px',
                      padding: '0 5px',
                      fontSize: '10px',
                      fontWeight: 700,
                      lineHeight: '16px',
                    }}>
                      {modifiedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Settings Content */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 0',
          }}>
            {showAll ? (
              // Search mode: show all matching categories
              displayCategories.map((cat) => {
                const settings = filteredByCategory.get(cat) ?? [];
                return (
                  <Section key={cat} title={cat} icon={SettingsRegistry.getCategoryInfo(cat)?.icon}>
                    {settings.map((desc) => (
                      <SettingRow
                        key={desc.key}
                        descriptor={desc}
                        value={SettingsRegistry.get(desc.key)}
                        isModified={SettingsRegistry.isModified(desc.key)}
                      />
                    ))}
                  </Section>
                );
              })
            ) : (
              // Normal mode: show active category
              activeCategory && filteredByCategory.has(activeCategory) && (
                <div style={{ padding: '8px 12px' }}>
                  {(filteredByCategory.get(activeCategory) ?? []).map((desc) => (
                    <SettingRow
                      key={desc.key}
                      descriptor={desc}
                      value={SettingsRegistry.get(desc.key)}
                      isModified={SettingsRegistry.isModified(desc.key)}
                    />
                  ))}
                </div>
              )
            )}

            {filteredByCategory.size === 0 && (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '12px',
              }}>
                No settings match "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
