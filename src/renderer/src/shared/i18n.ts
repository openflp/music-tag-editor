import { useSyncExternalStore } from 'react'
import { packFor, translate, type LocaleId, type Pack } from '@shared/i18n'
import { applyLanguagePack, parseLanguagePack, type LanguagePack } from '@shared/language-pack'

const KEY = 'mte.locale'
const PACKS_KEY = 'mte.languagePacks'
const MAX_PACKS = 8

export type ActiveLocale = LocaleId | `pack:${string}`

function readPacks(): LanguagePack[] {
  try {
    const raw = localStorage.getItem(PACKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const packs: LanguagePack[] = []
    for (const item of parsed) {
      try {
        packs.push(parseLanguagePack(item))
      } catch {
        /* skip a damaged pack */
      }
    }
    return packs.slice(0, MAX_PACKS)
  } catch {
    return []
  }
}

function readLocale(packs: LanguagePack[]): ActiveLocale {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === 'en' || raw === 'ru') return raw
    if (raw?.startsWith('pack:') && packs.some((item) => `pack:${item.id}` === raw)) return raw as ActiveLocale
  } catch {
    /* storage can be unavailable */
  }
  return 'ru'
}

let packs = readPacks()
let current: ActiveLocale = readLocale(packs)

interface LocaleSnap {
  locale: ActiveLocale
  revision: number
}

let snapshot: LocaleSnap = { locale: current, revision: 0 }
const serverSnapshot: LocaleSnap = { locale: 'ru', revision: 0 }
const listeners = new Set<() => void>()

function publish(): void {
  snapshot = { locale: current, revision: snapshot.revision + 1 }
  listeners.forEach((listener) => listener())
}

function storePacks(): void {
  try {
    localStorage.setItem(PACKS_KEY, JSON.stringify(packs))
  } catch {
    /* storage can be unavailable */
  }
}

export function languagePacks(): LanguagePack[] {
  return packs
}

export function menuLocaleOf(next: ActiveLocale = current): LocaleId {
  if (next === 'en' || next === 'ru') return next
  const found = packs.find((item) => `pack:${item.id}` === next)
  return found?.base ?? 'ru'
}

function applyDocument(next: ActiveLocale): void {
  const menu = menuLocaleOf(next)
  const lang = next === 'ru' || next === 'en' ? next : next.slice(5)
  document.documentElement.lang = lang
  window.dispatchEvent(new CustomEvent('mte-locale', { detail: menu }))
  void window.musicTagEditor?.setLocale(menu)
}

export function getLocale(): ActiveLocale {
  return current
}

function packForActive(locale: ActiveLocale): Pack {
  if (locale === 'ru' || locale === 'en') return packFor(locale)
  const found = packs.find((item) => `pack:${item.id}` === locale)
  if (!found) return packFor('ru')
  return applyLanguagePack(found.base, found.strings)
}

export function getPack(): Pack {
  return packForActive(current)
}

export function tr(message: string): string {
  return translate(message, menuLocaleOf())
}

export function fileWord(count: number, pack: Pack = getPack()): string {
  if (pack.fileFew === pack.fileMany) return count === 1 ? pack.fileOne : pack.fileMany
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return pack.fileOne
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return pack.fileFew
  return pack.fileMany
}

export function setLocale(next: ActiveLocale): void {
  if (next !== 'ru' && next !== 'en' && !packs.some((item) => `pack:${item.id}` === next)) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* storage can be unavailable */
  }
  applyDocument(next)
  publish()
}

export function saveLanguagePack(pack: LanguagePack): LanguagePack {
  const clean = parseLanguagePack(pack)
  packs = [clean, ...packs.filter((item) => item.id !== clean.id)].slice(0, MAX_PACKS)
  storePacks()
  publish()
  return clean
}

export interface PackAuditRow {
  id: string
  name: string
  ok: boolean
}

/** Сверяет сохранённый JSON с правилами пакета. Встроенные языки всегда целые. */
export function auditLanguagePacks(): { rows: PackAuditRow[]; failed: boolean } {
  const builtin: PackAuditRow[] = [
    { id: 'ru', name: 'Русский', ok: true },
    { id: 'en', name: 'English', ok: true }
  ]
  let raw: string | null
  try {
    raw = localStorage.getItem(PACKS_KEY)
  } catch {
    return { rows: builtin, failed: true }
  }
  if (!raw) {
    return { rows: [...builtin, ...packs.map((item) => ({ id: item.id, name: item.name, ok: true }))], failed: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { rows: builtin, failed: true }
  }
  if (!Array.isArray(parsed)) return { rows: builtin, failed: true }
  const custom: PackAuditRow[] = parsed.slice(0, MAX_PACKS).map((item, index) => {
    try {
      const pack = parseLanguagePack(item)
      return { id: pack.id, name: pack.name, ok: true }
    } catch {
      const name = item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
        ? (item as { name: string }).name.trim() || String(index + 1)
        : String(index + 1)
      return { id: `broken:${index}`, name, ok: false }
    }
  })
  return { rows: [...builtin, ...custom], failed: false }
}

export function removeLanguagePack(id: string): void {
  packs = packs.filter((item) => item.id !== id)
  storePacks()
  if (current === `pack:${id}`) {
    current = 'ru'
    try {
      localStorage.setItem(KEY, current)
    } catch {
      /* storage can be unavailable */
    }
    applyDocument(current)
  }
  publish()
}

export function syncLocale(): void {
  applyDocument(current)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): LocaleSnap {
  return snapshot
}

export function useI18n(): { locale: ActiveLocale; pack: Pack; setLocale: (next: ActiveLocale) => void } {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot)
  return { locale: snap.locale, pack: packForActive(snap.locale), setLocale }
}

if (typeof document !== 'undefined') document.documentElement.lang = current === 'ru' || current === 'en' ? current : current.slice(5)
