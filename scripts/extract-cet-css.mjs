import fs from 'node:fs'

const source = fs.readFileSync('node_modules/custom-electron-titlebar/index.js', 'utf8')
const marker = 'var base_default = "'
const start = source.indexOf(marker)
if (start < 0) throw new Error('marker missing')
let index = start + marker.length
let css = ''
while (index < source.length) {
  const char = source[index]
  if (char === '\\') {
    const next = source[index + 1]
    if (next === 'n') css += '\n'
    else if (next === 'r') css += '\r'
    else if (next === 't') css += '\t'
    else if (next === '"') css += '"'
    else if (next === '\\') css += '\\'
    else css += next
    index += 2
    continue
  }
  if (char === '"') break
  css += char
  index += 1
}
const banner = '/* Styles shipped with custom-electron-titlebar. Kept in a file so production CSP can omit unsafe-inline. */\n'
fs.writeFileSync('src/renderer/src/app/cet.css', banner + css)
console.log('bytes', css.length)
