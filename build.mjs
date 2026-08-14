/** Build the Node host modules and the single-file DSH Web client bundle. */

import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'

const tsc = 'node_modules/.bin/tsc'

execFileSync(tsc, ['-p', 'tsconfig.build.json'], { stdio: 'inherit' })
execFileSync(tsc, ['-p', 'tsconfig.client.json'], { stdio: 'inherit' })

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*'],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-sideband', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})
