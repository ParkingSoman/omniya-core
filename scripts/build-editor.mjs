import { build } from 'esbuild';

// The spike page lives under src/renderer/dev/, which electron-builder excludes
// from packaged builds. The real editor entry is added in Phase 2.
await build({
  entryPoints: ['src/renderer/editor/spike-entry.js'],
  outfile: 'src/renderer/dev/spike.bundle.js',
  bundle: true,
  format: 'iife',
  logLevel: 'warning',
});
