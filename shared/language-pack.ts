import { packFor, type LocaleId, type Pack } from './i18n'

export interface LanguagePack {
  id: string
  name: string
  base: LocaleId
  strings: Record<string, string>
}

const ID = /^[a-z][a-z0-9-]{0,31}$/
const RESERVED = new Set(['ru', 'en'])

let stringKeys: Set<string> | null = null

function keysOf(): Set<string> {
  if (stringKeys) return stringKeys
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(packFor('ru'))) {
    if (typeof value === 'string') keys.add(key)
  }
  stringKeys = keys
  return keys
}

export function applyLanguagePack(base: LocaleId, strings: Record<string, string>): Pack {
  const pack = { ...packFor(base) } as Pack & Record<string, unknown>
  const allowed = keysOf()
  for (const [key, value] of Object.entries(strings)) {
    if (allowed.has(key)) pack[key] = value
  }
  return pack
}

export function languagePackTemplate(base: LocaleId): string {
  const strings: Record<string, string> = {}
  for (const [key, value] of Object.entries(packFor(base))) {
    if (typeof value === 'string') strings[key] = value
  }
  const name = base === 'ru' ? 'Название языка' : 'Language name'
  return JSON.stringify({ id: 'xx', name, base, strings }, null, 2)
}

export function parseLanguagePack(value: unknown): LanguagePack {
  if (!value || typeof value !== 'object') throw new Error('Некорректный языковой пакет')
  const item = value as Record<string, unknown>
  const id = typeof item.id === 'string' ? item.id.trim().toLowerCase() : ''
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  const base = item.base === 'en' || item.base === 'ru' ? item.base : null
  if (!ID.test(id) || RESERVED.has(id) || name.length < 1 || name.length > 48 || /[\u0000-\u001f]/.test(name) || !base) {
    throw new Error('Некорректный языковой пакет')
  }
  if (!item.strings || typeof item.strings !== 'object' || Array.isArray(item.strings)) {
    throw new Error('Некорректный языковой пакет')
  }
  const allowed = keysOf()
  const strings: Record<string, string> = {}
  for (const [key, text] of Object.entries(item.strings as Record<string, unknown>)) {
    if (!allowed.has(key) || typeof text !== 'string') continue
    const clean = text.trim()
    if (!clean || clean.length > 800) continue
    strings[key] = clean
  }
  if (Object.keys(strings).length === 0) throw new Error('Некорректный языковой пакет')
  return { id, name, base, strings }
}
