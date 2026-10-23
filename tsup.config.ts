import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/http.ts', 'src/cli.ts'],
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  dts: {
    resolve: false,
  },
  sourcemap: true,
  minify: true,
  clean: true,
  splitting: true,
  treeshake: true,
})
