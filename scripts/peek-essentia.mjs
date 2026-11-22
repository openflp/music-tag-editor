import { readFileSync } from 'node:fs'

const s = readFileSync('node_modules/essentia.js/dist/essentia-wasm.es.js', 'utf8')
for (const token of ['ALLOW_MEMORY_GROWTH', 'MAXIMUM_MEMORY', 'wasmMemory.grow', 'abortOnCannotGrowMemory']) {
  console.log(token, s.includes(token))
}
