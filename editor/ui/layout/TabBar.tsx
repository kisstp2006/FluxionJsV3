import React, { useState } from 'react';

export interface TabItem {
  label: string;
  icon?: React.ReactNode;
}

interface TabBarProps {
  tabs: Array<string | TabItem>;
  activeTab: string;
  onTabChange: (label: string) => void;
  compact?: boolean;
}

function toItem(t: string | TabItem): TabItem {
  return typeof t === 'string' ? { label: t } : t;
}

const TabButton: React.FC<{
  item: TabItem;
  active: boolean;
  compact: boolean;
  onClick: () => void;
}> = ({ item, active, compact, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: active
          ? 'var(--bg-panel)'
          : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        borderTop: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
        borderLeft: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
        borderRight: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
        color: active ? 'var(--text-primary)' : hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        padding: compact ? '0 10px' : '0 14px',
        height: compact ? '26px' : '30px',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: active ? 600 : 400,
        transition: 'color var(--transition), background var(--transition)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        position: 'relative',
        marginBottom: '-1px',
      }}
    >
      {item.icon && (
        <span style={{ display: 'flex', alignItems: 'center', opacity: active ? 1 : 0.7 }}>
          {item.icon}
        </span>
      )}
      {item.label}
    </button>
  );
};

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange, compact = false }) => (
  <div style={{
    display: 'flex',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    overflow: 'hidden',
  }}>
    {tabs.map((t) => {
      const item = toItem(t);
      return (
        <TabButton
          key={item.label}
          item={item}
          active={item.label === activeTab}
          compact={compact}
          onClick={() => onTabChange(item.label)}
        />
      );
    })}
  </div>
);
