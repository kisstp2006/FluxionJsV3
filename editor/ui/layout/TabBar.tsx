import React from 'react';

export interface TabItem {
  label: string;
  icon?: React.ReactNode;
}

interface TabBarProps {
  /** Either plain string labels or `{ label, icon }` objects. */
  tabs: Array<string | TabItem>;
  activeTab: string;
  onTabChange: (label: string) => void;
}

function toItem(t: string | TabItem): TabItem {
  return typeof t === 'string' ? { label: t } : t;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange }) => (
  <div style={{
    display: 'flex',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
  }}>
    {tabs.map((t) => {
      const { label, icon } = toItem(t);
      const active = label === activeTab;
      return (
        <button
          key={label}
          onClick={() => onTabChange(label)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: active ? 'rgba(13, 17, 23, 0.8)' : 'var(--bg-secondary)',
            border: 'none',
            borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '6px 16px',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'all 150ms ease',
          }}
        >
          {icon}
          {label}
        </button>
      );
    })}
  </div>
);
