const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env = {}) => {
  const isProd = !!env.production;
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
      new webpack.DefinePlugin({ 'global': 'globalThis' }),
    ],
  };

  return [electronMain, electronPreload, editorRenderer, vmeWindow, fuiWindow, scriptWindow];
};
