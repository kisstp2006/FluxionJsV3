const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env = {}) => {
  const isProd = !!env.production;
  const isTauri = !!env.tauri || process.env.TAURI === 'true';
  const mode = isProd ? 'production' : 'development';

  // ts-loader with transpileOnly=true skips type-checking during build
  // (tsc --noEmit handles that separately). Saves ~40% memory + significant time.
  const commonRules = [
    {
      test: /\.tsx?$/,
      use: [{ loader: 'ts-loader', options: { transpileOnly: true } }],
      exclude: /node_modules/,
    },
    {
      test: /\.css$/,
      use: ['style-loader', 'css-loader'],
    },
    {
      // Import .glsl files as plain strings (no processing, bundled at build time)
      test: /\.glsl$/,
      type: 'asset/source',
    },
    {
      // Import .svg files as raw strings — consumed by SvgIcon component
      test: /\.svg$/,
      type: 'asset/source',
    },
    {
      // Import script template files as raw strings
      test: /\.tmpl$/,
      type: 'asset/source',
    },
  ];

  const resolve = {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@physics': path.resolve(__dirname, 'src/physics'),
      '@scene': path.resolve(__dirname, 'src/scene'),
      '@input': path.resolve(__dirname, 'src/input'),
      '@audio': path.resolve(__dirname, 'src/audio'),
      '@assets': path.resolve(__dirname, 'src/assets'),
      '@editor': path.resolve(__dirname, 'editor'),
    },
    // wasmoon (and other Node-targeting packages) reference built-ins that
    // webpack 5 no longer polyfills automatically. Stub them out for browser
    // / Electron renderer targets — wasmoon falls back to fetch-based WASM
    // loading when these are unavailable.
    fallback: {
      url:    false,
      module: false,
      path:   false,
      fs:     false,
    },
  };

  // Shared filesystem cache — dramatically speeds up incremental builds
  const cache = {
    type: 'filesystem',
    buildDependencies: { config: [__filename] },
  };

  // Production optimization: minimize only in prod, no source maps in dev
  const optimization = isProd
    ? { minimize: true }
    : { minimize: false };

  const devtool = isProd ? false : false; // source maps disabled — re-enable if debugging

  // Define plugins for different builds
  const commonPlugins = [
    new webpack.DefinePlugin({
      'process.env': JSON.stringify({
        NODE_ENV: isProd ? 'production' : 'development',
        TAURI: isTauri ? 'true' : 'false',
      }),
    }),
  ];

  const configs = [];

  // Only build Electron targets if not building for Tauri
  if (!isTauri) {
    // Electron Main Process
    const electronMain = {
      name: 'main',
      mode,
      devtool,
      cache,
      optimization,
      entry: './electron/main.ts',
      target: 'electron-main',
      output: {
        path: path.resolve(__dirname, 'dist/electron'),
        filename: 'main.js',
      },
      module: { rules: commonRules },
      resolve,
      node: { __dirname: false, __filename: false },
    };

    // Electron Preload
    const electronPreload = {
      name: 'preload',
      mode,
      devtool,
      cache,
      optimization,
      entry: './electron/preload.ts',
      target: 'electron-preload',
      output: {
        path: path.resolve(__dirname, 'dist/electron'),
        filename: 'preload.js',
      },
      module: { rules: commonRules },
      resolve,
    };

    configs.push(electronMain, electronPreload);
  }

  // Editor Renderer Process
  const editorRenderer = {
    name: 'editor',
    mode,
    devtool,
    cache,
    optimization,
    entry: './editor/index.tsx',
    target: 'web',
    output: {
      path: path.resolve(__dirname, 'dist/editor'),
      filename: 'editor.bundle.js',
      globalObject: 'self',
    },
    module: { rules: commonRules },
    resolve,
    plugins: [
      ...commonPlugins,
      new HtmlWebpackPlugin({
        template: './editor/index.html',
        filename: 'index.html',
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'node_modules/three/examples/jsm/libs/draco'),
            to: path.resolve(__dirname, 'dist/editor/draco'),
          },
        ],
      }),
      new webpack.DefinePlugin({ 'global': 'globalThis' }),
    ],
  };

  // Visual Material Editor (separate window)
  const vmeWindow = {
    name: 'vme',
    mode,
    devtool,
    cache,
    optimization,
    entry: './editor/vme-window.tsx',
    target: 'web',
    output: {
      path: path.resolve(__dirname, 'dist/editor'),
      filename: 'vme-window.bundle.js',
      globalObject: 'self',
    },
    module: { rules: commonRules },
    resolve,
    plugins: [
      new HtmlWebpackPlugin({
        template: './editor/vme-window.html',
        filename: 'vme-window.html',
      }),
      new webpack.DefinePlugin({ 'global': 'globalThis' }),
    ],
  };

  // FUI Editor (separate window)
  const fuiWindow = {
    name: 'fui',
    mode,
    devtool,
    cache,
    optimization,
    entry: './editor/fui-window.tsx',
    target: 'web',
    output: {
      path: path.resolve(__dirname, 'dist/editor'),
      filename: 'fui-window.bundle.js',
      globalObject: 'self',
    },
    module: { rules: commonRules },
    resolve,
    plugins: [
      new HtmlWebpackPlugin({
        template: './editor/fui-window.html',
        filename: 'fui-window.html',
      }),
      new webpack.DefinePlugin({ 'global': 'globalThis' }),
    ],
  };

  // Script Editor (separate window)
  const scriptWindow = {
    name: 'script',
    mode,
    devtool,
    cache,
    optimization,
    entry: './editor/script-window.tsx',
    target: 'web',
    output: {
      path: path.resolve(__dirname, 'dist/editor'),
      filename: 'script-window.bundle.js',
      globalObject: 'self',
    },
    module: { rules: commonRules },
    resolve,
    plugins: [
      new HtmlWebpackPlugin({
        template: './editor/script-window.html',
        filename: 'script-window.html',
      }),
      // Copy monaco's prebuilt min/vs directory so the loader can reference it
      // locally instead of fetching from CDN (which is blocked in Electron).
      new CopyWebpackPlugin({
        patterns: [{
          from: path.resolve(__dirname, 'node_modules/monaco-editor/min/vs'),
          to: path.resolve(__dirname, 'dist/editor/vs'),
        }],
      }),
      new webpack.DefinePlugin({ 'global': 'globalThis' }),
    ],
  };

  // Detached Panel Window (separate OS window per panel)
  const panelWindow = {
    name: 'panel',
    mode,
    devtool,
    cache,
    optimization,
    entry: './editor/panel-window.tsx',
    target: 'web',
    output: {
      path: path.resolve(__dirname, 'dist/editor'),
      filename: 'panel-window.bundle.js',
      globalObject: 'self',
    },
    module: { rules: commonRules },
    resolve,
    plugins: [
      new HtmlWebpackPlugin({
        template: './editor/panel-window.html',
        filename: 'panel-window.html',
      }),
      new webpack.DefinePlugin({ 'global': 'globalThis' }),
    ],
  };

  configs.push(editorRenderer, vmeWindow, fuiWindow, scriptWindow, panelWindow);

  return configs;
};
