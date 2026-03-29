/** Raw-string imports for webpack asset/source loaders */
declare module '*.glsl' {
  const content: string;
  export default content;
}

declare module '*.tmpl' {
  const content: string;
  export default content;
}

/** Stubbed until `npm install wasmoon` is run. */
declare module 'wasmoon' {
  export class LuaFactory {
    createEngine(options?: Record<string, any>): Promise<LuaEngine>;
  }
  export interface LuaEngine {
    global: {
      get(name: string): any;
      set(name: string, value: any): void;
      call(name: string, ...args: any[]): any;
      close?(): void;
    };
    doString(code: string): Promise<void>;
  }
}
