// Webpack asset/source loader — SVG files imported as raw string content.
declare module '*.svg' {
  const content: string;
  export default content;
}
