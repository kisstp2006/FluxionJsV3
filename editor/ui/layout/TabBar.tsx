import React from 'react';

interface TabBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange }) => (
  <div style={{
    display: 'flex',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
  }}>
    {tabs.map((tab) => (
      <button
        key={tab}
        onClick={() => onTabChange(tab)}
        style={{
          background: tab === activeTab ? 'rgba(13, 17, 23, 0.8)' : 'var(--bg-secondary)',
          border: 'none',
          borderBottom: `2px solid ${tab === activeTab ? 'var(--accent)' : 'transparent'}`,
          color: tab === activeTab ? 'var(--text-primary)' : 'var(--text-secondary)',
          padding: '6px 16px',
          cursor: 'pointer',
          fontSize: '12px',
          transition: 'all 150ms ease',
        }}
      >
        {tab}
      </button>
    ))}
  </div>
);
