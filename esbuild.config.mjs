import esbuild from 'esbuild';

const isProd = process.argv[2] === 'production';

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  external: ['obsidian', 'electron', '@codemirror/*', 'node:*'],
  format: 'cjs',
  target: 'es2020',
  outfile: 'dist/main.js',
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
});
