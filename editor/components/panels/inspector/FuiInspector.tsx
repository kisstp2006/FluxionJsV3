import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelHeader, Section, PropertyRow, TextInput, NumberInput, ColorInput, Select } from '../../../ui';
import { useEditor } from '../../../core/EditorContext';
import { getFileSystem } from '../../../../src/filesystem';
import type { FuiDocument, FuiNode } from '../../../../src/ui/FuiTypes';
import { parseFuiJson } from '../../../../src/ui/FuiParser';
import { renderFuiToCanvas } from '../../../../src/ui/FuiRenderer';

type SelectedNode = { node: FuiNode; path: number[] } | null;

function getNodeAtPath(root: any, path: number[]): any {
  let cur = root;
  for (const idx of path) {
    if (!cur?.children) return null;
    cur = cur.children[idx];
  }
  return cur;
}

function updateNodeAtPath(root: any, path: number[], updater: (node: any) => void): any {
  const copy = JSON.parse(JSON.stringify(root));
  if (path.length === 0) {
    updater(copy);
    return copy;
  }
  let cur = copy;
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    cur = cur.children?.[idx];
    if (!cur) return copy;
    if (i === path.length - 1) updater(cur);
  }
  return copy;
}

function walkNodes(root: FuiNode): Array<{ node: FuiNode; depth: number; path: number[] }> {
  const out: Array<{ node: FuiNode; depth: number; path: number[] }> = [];
  const rec = (n: FuiNode, depth: number, path: number[]) => {
    out.push({ node: n, depth, path });
    if ((n as any).children) {
      ((n as any).children as FuiNode[]).forEach((c, i) => rec(c, depth + 1, [...path, i]));
    }
  };
  rec(root, 0, []);
  return out;
}

const FuiPreview: React.FC<{ doc: FuiDocument; scale: number }> = ({ doc, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = Math.max(1, Math.round(doc.canvas.width * scale));
    const h = Math.max(1, Math.round(doc.canvas.height * scale));
    canvas.width = w;
    canvas.height = h;

    renderFuiToCanvas(doc, ctx, { scaleX: scale, scaleY: scale });
  }, [doc, scale]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${doc.canvas.width * scale}px`,
        height: `${doc.canvas.height * scale}px`,
        border: '1px solid var(--border)',
        borderRadius: '6px',
        background: '#0b1020',
      }}
    />
  );
};

export const FuiInspector: React.FC<{ assetPath: string; assetType: string }> = ({ assetPath }) => {
  const { log } = useEditor();
  const fs = getFileSystem();

  const [text, setText] = useState<string>('');
  const [doc, setDoc] = useState<FuiDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [selected, setSelected] = useState<SelectedNode>(null);

  const [previewScale, setPreviewScale] = useState(0.25);

  // Load file
  useEffect(() => {
    let cancelled = false;
    fs.readFile(assetPath)
      .then((t) => {
        if (cancelled) return;
        setText(t);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [assetPath, fs]);

  // Parse whenever text changes
  useEffect(() => {
    try {
      const parsed = parseFuiJson(text);
      setDoc(parsed);
      setError(null);
      if (!selected) {
        // Default selection to root.
        setSelected({ node: parsed.root, path: [] });
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setDoc(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const nodesFlat = useMemo(() => {
    if (!doc) return [];
    return walkNodes(doc.root);
  }, [doc]);

  const selectedNode: FuiNode | null = useMemo(() => {
    if (!doc || !selected) return null;
    const n = getNodeAtPath(doc.root, selected.path);
    return n as FuiNode | null;
  }, [doc, selected]);

  const updateSelected = useCallback(
    (updater: (node: any) => void) => {
      if (!doc || !selected) return;
      const newRoot = updateNodeAtPath(doc.root, selected.path, updater);
      const next: FuiDocument = { ...doc, root: newRoot };
      setDoc(next);
      setText(JSON.stringify(next, null, 2));
    },
    [doc, selected],
  );

  const handleSave = useCallback(async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    try {
      await fs.writeFile(assetPath, text);
      log(`Saved ${assetPath}`, 'system');
    } catch (e: any) {
      log(`Failed to save ${assetPath}: ${e?.message ?? String(e)}`, 'error');
    } finally {
      setSaveBusy(false);
    }
  }, [assetPath, fs, log, saveBusy, text]);

  const previewDoc = doc ?? {
    version: 1,
    mode: 'screen' as const,
    canvas: { width: 800, height: 600 },
    root: {
      id: 'root',
      type: 'panel',
      rect: { x: 0, y: 0, w: 800, h: 600 },
      style: { backgroundColor: '#0b1020' },
      children: [],
    },
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
      <PanelHeader
        title="UI Editor (.fui)"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={saveBusy}
              onClick={handleSave}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                cursor: 'pointer',
                opacity: saveBusy ? 0.6 : 1,
              }}
              title="Save .fui"
            >
              Save
            </button>
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Left: preview + tree */}
        <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Preview scale: {Math.round(previewScale * 100)}%
            </div>
            <Select
              value={String(previewScale)}
              options={[
                { value: '0.15', label: '15%' },
                { value: '0.25', label: '25%' },
                { value: '0.35', label: '35%' },
                { value: '0.5', label: '50%' },
              ]}
              onChange={(v) => setPreviewScale(parseFloat(v))}
            />
          </div>

          <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>
            <FuiPreview doc={previewDoc} scale={previewScale} />
          </div>

          <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            <Section title="Elements" defaultOpen>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {nodesFlat.map((n, i) => {
                  const isSel = selected?.path && selected.path.length === n.path.length && selected.path.every((v, idx) => v === n.path[idx]);
                  return (
                    <div
                      key={`${n.node.id}_${i}`}
                      onClick={() => setSelected({ node: n.node, path: n.path })}
                      style={{
                        cursor: 'pointer',
                        padding: '4px 6px',
                        borderRadius: 4,
                        background: isSel ? 'var(--bg-active)' : 'transparent',
                        color: isSel ? 'var(--accent)' : 'var(--text-secondary)',
                        marginLeft: n.depth * 10,
                        fontSize: 12,
                        userSelect: 'none',
                      }}
                      title={n.node.type}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{n.node.id}</span>
                      <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 10 }}>({n.node.type})</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        </div>

        {/* Right: properties */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          <Section title="Properties" defaultOpen>
            {error && (
              <div style={{ color: '#d73a49', fontSize: 12, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                {error}
              </div>
            )}

            {!selectedNode && !error && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Select an element.</div>}

            {selectedNode && (
              <>
                <PropertyRow label="ID">
                  <TextInput
                    value={selectedNode.id}
                    onChange={(v) => {
                      updateSelected((n) => {
                        n.id = v;
                      });
                    }}
                  />
                </PropertyRow>

                <PropertyRow label="Type">
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 12 }}>
                    {selectedNode.type}
                  </span>
                </PropertyRow>

                <PropertyRow label="X">
                  <NumberInput
                    value={selectedNode.rect?.x ?? 0}
                    onChange={(v) => updateSelected((n) => (n.rect.x = v))}
                    step={1}
                    min={-10000}
                  />
                </PropertyRow>
                <PropertyRow label="Y">
                  <NumberInput
                    value={selectedNode.rect?.y ?? 0}
                    onChange={(v) => updateSelected((n) => (n.rect.y = v))}
                    step={1}
                    min={-10000}
                  />
                </PropertyRow>
                <PropertyRow label="Width">
                  <NumberInput
                    value={selectedNode.rect?.w ?? 100}
                    onChange={(v) => updateSelected((n) => (n.rect.w = Math.max(1, v)))}
                    step={1}
                    min={1}
                  />
                </PropertyRow>
                <PropertyRow label="Height">
                  <NumberInput
                    value={selectedNode.rect?.h ?? 40}
                    onChange={(v) => updateSelected((n) => (n.rect.h = Math.max(1, v)))}
                    step={1}
                    min={1}
                  />
                </PropertyRow>

                {/* Type-specific */}
                {selectedNode.type === 'label' && (
                  <>
                    <PropertyRow label="Text">
                      <TextInput value={selectedNode.text ?? ''} onChange={(v) => updateSelected((n) => (n.text = v))} />
                    </PropertyRow>
                    <PropertyRow label="Font Size">
                      <NumberInput
                        value={(selectedNode.style?.fontSize ?? 18) as number}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.fontSize = v;
                          })
                        }
                        step={1}
                        min={1}
                      />
                    </PropertyRow>
                    <PropertyRow label="Text Color">
                      <ColorInput
                        value={(selectedNode.style?.color ?? '#ffffff') as string}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.color = v;
                          })
                        }
                      />
                    </PropertyRow>
                    <PropertyRow label="Align">
                      <Select
                        value={String(selectedNode.style?.align ?? 'center')}
                        options={[
                          { value: 'left', label: 'Left' },
                          { value: 'center', label: 'Center' },
                          { value: 'right', label: 'Right' },
                        ]}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.align = v;
                          })
                        }
                      />
                    </PropertyRow>
                  </>
                )}

                {selectedNode.type === 'button' && (
                  <>
                    <PropertyRow label="Text">
                      <TextInput value={selectedNode.text ?? ''} onChange={(v) => updateSelected((n) => (n.text = v))} />
                    </PropertyRow>
                    <PropertyRow label="Background">
                      <ColorInput
                        value={(selectedNode.style?.backgroundColor ?? '#1f2a44') as string}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.backgroundColor = v;
                          })
                        }
                      />
                    </PropertyRow>
                    <PropertyRow label="Border Color">
                      <ColorInput
                        value={(selectedNode.style?.borderColor ?? '#6b8cff') as string}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.borderColor = v;
                          })
                        }
                      />
                    </PropertyRow>
                    <PropertyRow label="Border Width">
                      <NumberInput
                        value={(selectedNode.style?.borderWidth ?? 2) as number}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.borderWidth = v;
                          })
                        }
                        step={1}
                        min={0}
                      />
                    </PropertyRow>
                    <PropertyRow label="Radius">
                      <NumberInput
                        value={(selectedNode.style?.radius ?? 6) as number}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.radius = v;
                          })
                        }
                        step={1}
                        min={0}
                      />
                    </PropertyRow>
                    <PropertyRow label="Text Color">
                      <ColorInput
                        value={(selectedNode.style?.textColor ?? '#ffffff') as string}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.textColor = v;
                          })
                        }
                      />
                    </PropertyRow>
                    <PropertyRow label="Font Size">
                      <NumberInput
                        value={(selectedNode.style?.fontSize ?? 18) as number}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.fontSize = v;
                          })
                        }
                        step={1}
                        min={1}
                      />
                    </PropertyRow>
                    <PropertyRow label="Align">
                      <Select
                        value={String(selectedNode.style?.align ?? 'center')}
                        options={[
                          { value: 'left', label: 'Left' },
                          { value: 'center', label: 'Center' },
                          { value: 'right', label: 'Right' },
                        ]}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.align = v;
                          })
                        }
                      />
                    </PropertyRow>
                    <PropertyRow label="Padding">
                      <NumberInput
                        value={(selectedNode.style?.padding ?? 8) as number}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.padding = v;
                          })
                        }
                        step={1}
                        min={0}
                      />
                    </PropertyRow>
                  </>
                )}

                {selectedNode.type === 'panel' && (
                  <>
                    <PropertyRow label="Background">
                      <ColorInput
                        value={(selectedNode.style?.backgroundColor ?? '#0b1020') as string}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.backgroundColor = v;
                          })
                        }
                      />
                    </PropertyRow>
                    <PropertyRow label="Border Color">
                      <ColorInput
                        value={(selectedNode.style?.borderColor ?? '#000000') as string}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.borderColor = v;
                          })
                        }
                      />
                    </PropertyRow>
                    <PropertyRow label="Border Width">
                      <NumberInput
                        value={(selectedNode.style?.borderWidth ?? 0) as number}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.borderWidth = v;
                          })
                        }
                        step={1}
                        min={0}
                      />
                    </PropertyRow>
                    <PropertyRow label="Radius">
                      <NumberInput
                        value={(selectedNode.style?.radius ?? 0) as number}
                        onChange={(v) =>
                          updateSelected((n) => {
                            n.style = n.style ?? {};
                            n.style.radius = v;
                          })
                        }
                        step={1}
                        min={0}
                      />
                    </PropertyRow>
                  </>
                )}
              </>
            )}
          </Section>

          <div style={{ height: 12 }} />

          <Section title="Raw JSON" defaultOpen={false}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{
                width: '100%',
                height: 240,
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 10,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </Section>
        </div>
      </div>
    </div>
  );
};

