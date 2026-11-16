declare module 'dev05r:renderer' {
  export const renderPost: typeof import('./render').renderPost;
  export const implementation: 'baseline' | 'optimized';
}
