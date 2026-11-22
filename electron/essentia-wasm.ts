// essentia-wasm.es.js сам решает, что он в Node, если видит process.versions.node.
// В module worker нет importScripts, поэтому без правки грузится ветка Node и require('fs').
const WORKER_DETECT = 'ENVIRONMENT_IS_WORKER=typeof importScripts==="function"'
const NODE_DETECT = 'ENVIRONMENT_IS_NODE=typeof process==="object"&&typeof process.versions==="object"&&typeof process.versions.node==="string"'

export function browserEssentiaWasm(code: string): string {
  if (!code.includes(WORKER_DETECT) || !code.includes(NODE_DETECT)) {
    throw new Error('Сборка essentia.js изменилась: воркер не сможет загрузить WASM')
  }
  const next = code
    .replaceAll(WORKER_DETECT, 'ENVIRONMENT_IS_WORKER=typeof WorkerGlobalScope!=="undefined"')
    .replaceAll(NODE_DETECT, 'ENVIRONMENT_IS_NODE=false')
    .replaceAll('require("path")', '(null)')
    .replaceAll('require("fs")', '(null)')
    .replaceAll('require("crypto")', '(null)')
  if (next.includes('require(')) throw new Error('В WASM-модуле essentia остался require')
  return next
}
