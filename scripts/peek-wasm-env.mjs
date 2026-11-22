import { readFileSync, writeFileSync } from 'node:fs'

const s = readFileSync('node_modules/essentia.js/dist/essentia-wasm.es.js', 'utf8')
const token = 'self.location.href'
const i = s.indexOf(token)
writeFileSync('scripts/wasm-worker.txt', s.slice(i - 180, i + 700))
console.log(i)
