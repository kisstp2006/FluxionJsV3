// Type declaration for the webpack-aliased script registry module.
// The alias `__fluxion_game_scripts__` is resolved by the generated
// webpack.game.config.js to .fluxion/game-scripts.ts at build time.
// This declaration silences TypeScript's "cannot find module" error
// during compilation outside of a game build.
declare module '__fluxion_game_scripts__' {
  /** Map from project-relative script path to the script module namespace. */
  export const scriptRegistry: Record<string, any>;
  /** Plugin module namespaces — each has an optional register(engine) export. */
  export const pluginModules: any[];
}
