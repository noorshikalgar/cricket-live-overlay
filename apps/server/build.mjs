import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // keep real npm deps external, bundle only our own code + @cos/shared
  packages: 'external',
  alias: { '@cos/shared': '../../packages/shared/src/index.ts' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('server built → dist/main.js');
