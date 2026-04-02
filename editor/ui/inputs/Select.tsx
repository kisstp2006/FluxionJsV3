import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<SelectOption>;
  style?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  style,
  placeholder = 'Select...',
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => o.value === value);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportHeight = window.innerHeight;
    const listMaxHeight = 220;
    const spaceBelow = viewportHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    const openUpward = spaceBelow < listMaxHeight && spaceAbove > spaceBelow;

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight: `${Math.min(listMaxHeight, openUpward ? spaceAbove : spaceBelow)}px`,
      ...(openUpward
        ? { bottom: viewportHeight - rect.top }
        : { top: rect.bottom + 1 }),
      zIndex: 9999,
    });

    const idx = options.findIndex((o) => o.value === value);
    setFocusedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [disabled, options, value]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === 'Escape') { closeDropdown(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0) {
        onChange(options[focusedIndex].value);
        closeDropdown();
      }
    }
  };

  useEffect(() => {
    if (!open || !listRef.current) return;
    const focused = listRef.current.children[focusedIndex] as HTMLElement;
    focused?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, open]);

  return (
    <div
      style={{ position: 'relative', flex: 1, minWidth: 0, ...style }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        tabIndex={disabled ? -1 : 0}
        onClick={() => open ? closeDropdown() : openDropdown()}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          width: '100%',
          height: 'var(--input-height)',
          padding: '0 6px',
          background: 'var(--bg-input)',
          border: `1px solid ${open ? 'var(--border-focus)' : hovered ? 'var(--text-muted)' : 'var(--border)'}`,
          borderRadius: 'var(--input-radius)',
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '11px',
          cursor: disabled ? 'default' : 'pointer',
          outline: 'none',
          userSelect: 'none',
          opacity: disabled ? 0.4 : 1,
          transition: 'border-color var(--transition)',
          overflow: 'hidden',
        }}
      >
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          {selected?.icon}
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="none"
          style={{
            flexShrink: 0,
            color: 'var(--text-muted)',
            transition: 'transform var(--transition)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {open && ReactDOM.createPortal(
        <div
          ref={listRef}
          style={{
            ...dropdownStyle,
            background: 'var(--bg-dropdown)',
            border: '1px solid var(--border-focus)',
            borderRadius: 'var(--input-radius)',
            overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            animation: 'dropdownFadeIn 80ms ease',
          }}
        >
          {options.map((opt, i) => (
            <div
              key={opt.value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                closeDropdown();
              }}
              onMouseEnter={() => setFocusedIndex(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 8px',
                height: '24px',
                fontSize: '11px',
                cursor: 'pointer',
                color: opt.value === value ? 'var(--accent)' : 'var(--text-primary)',
                background: i === focusedIndex
                  ? 'var(--bg-active)'
                  : opt.value === value ? 'rgba(77,158,255,0.08)' : 'transparent',
                transition: 'background var(--transition-fast)',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {opt.icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.8 }}>{opt.icon}</span>}
              {opt.value === value && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0, marginRight: '-2px' }}>
                  <polyline points="0.5,4 2.5,6 7,1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {opt.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};
