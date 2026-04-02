/** Raw-string imports for webpack asset/source loaders */
declare module '*.glsl' {
  const content: string;
  export default content;
}

declare module '*.tmpl' {
  const content: string;
  export default content;
}

