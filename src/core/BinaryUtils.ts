// ============================================================
// FluxionJS V3 — Binary Utilities
// Shared low-level helpers for binary scene serialization.
// ============================================================

/**
 * FNV-32a hash — fast, deterministic, good distribution for short strings.
 * Used to identify component typeIds in the binary scene format.
 */
export function fnv32a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ── String Table ─────────────────────────────────────────────────────────────

export interface StringTable {
  strings: string[];
  index: Map<string, number>;
}

/**
 * Build a deduplicated string table from a list of strings.
 * Repeated strings appear only once; use `index` to look up position.
 */
export function buildStringTable(strings: Iterable<string>): StringTable {
  const table: string[] = [];
  const index = new Map<string, number>();
  for (const s of strings) {
    if (!index.has(s)) {
      index.set(s, table.length);
      table.push(s);
    }
  }
  return { strings: table, index };
}

// ── DataView helpers ──────────────────────────────────────────────────────────

export class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private _size = 0;
  private enc = new TextEncoder();

  get byteLength(): number { return this._size; }

  writeUint8(v: number): void    { this._push(new Uint8Array([v & 0xff])); }
  writeUint16(v: number): void   { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v >>> 0, true); this._push(b); }
  writeUint32(v: number): void   { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this._push(b); }
  writeInt32(v: number): void    { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0, true); this._push(b); }
  writeFloat32(v: number): void  { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); this._push(b); }

  writeUtf8(s: string): void {
    const encoded = this.enc.encode(s);
    this.writeUint16(encoded.byteLength);
    this._push(encoded);
  }

  writeBytes(data: Uint8Array): void { this._push(data); }

  toArrayBuffer(): ArrayBuffer {
    const out = new Uint8Array(this._size);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out.buffer;
  }

  private _push(data: Uint8Array): void {
    this.chunks.push(data);
    this._size += data.byteLength;
  }
}

export class BinaryReader {
  private view: DataView;
  private dec = new TextDecoder();
  offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  get byteLength(): number { return this.view.byteLength; }
  get remaining(): number  { return this.byteLength - this.offset; }

  readUint8(): number   { return this.view.getUint8(this.offset++); }
  readUint16(): number  { const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
  readUint32(): number  { const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
  readInt32(): number   { const v = this.view.getInt32(this.offset, true); this.offset += 4; return v; }
  readFloat32(): number { const v = this.view.getFloat32(this.offset, true); this.offset += 4; return v; }

  readUtf8(): string {
    const len = this.readUint16();
    const bytes = new Uint8Array(this.view.buffer, this.offset, len);
    this.offset += len;
    return this.dec.decode(bytes);
  }

  readBytes(len: number): Uint8Array {
    const bytes = new Uint8Array(this.view.buffer, this.offset, len);
    this.offset += len;
    return bytes;
  }

  skip(n: number): void { this.offset += n; }
}
