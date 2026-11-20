import { getPack } from '@/shared/i18n'

export function baseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

export function formatBytes(bytes: number): string {
  const pack = getPack()
  if (bytes < 1024) return `${bytes} ${pack.unitB}`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${pack.unitKb}`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${pack.unitMb}`
}

export function formatDuration(ms: number): string {
  if (!ms) return ''
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatRate(hz: number): string {
  if (!hz) return ''
  return `${(hz / 1000).toFixed(1)} ${getPack().unitKhz}`
}

export function formatBitrate(value: number): string {
  if (!value) return ''
  const kbps = value >= 10000 ? Math.round(value / 1000) : Math.round(value)
  return `${kbps} kbps`
}

// Intl.DateTimeFormat дорог в создании: вкладка «Информация» зовёт formatStamp дважды на каждый выбранный трек.
const stampFormats = new Map<string, Intl.DateTimeFormat>()

export function formatStamp(ms: number, locale: string): string {
  if (!ms) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const lang = locale === 'en' ? 'en' : 'ru'
  let format = stampFormats.get(lang)
  if (!format) {
    format = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })
    stampFormats.set(lang, format)
  }
  return format.format(date)
}

export function formatBadge(extension: string): string {
  return extension.replace('.', '').toUpperCase() || '—'
}

export function coverSrc(mime: string, dataBase64: string): string {
  return `data:${mime};base64,${dataBase64}`
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
