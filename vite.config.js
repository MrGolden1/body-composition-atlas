import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`                → dist/ (normal multi-file site, relative paths)
// `vite build --mode single`  → dist-single/index.html (everything inlined: code, fonts, body model)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: mode === 'single'
    ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 }
    : { chunkSizeWarningLimit: 1000 },
}));
