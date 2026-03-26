const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const commonRules = [
  {
    test: /\.tsx?$/,
    use: 'ts-loader',
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

// Electron Main Process
const electronMain = {
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
    new (require('webpack')).DefinePlugin({
      'global': 'globalThis',
    }),
  ],
};

// Visual Material Editor (separate window)
const vmeWindow = {
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
    new (require('webpack')).DefinePlugin({
      'global': 'globalThis',
    }),
  ],
};

module.exports = [electronMain, electronPreload, editorRenderer, vmeWindow];
