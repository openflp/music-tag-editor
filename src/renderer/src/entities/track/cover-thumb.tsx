import type { CoverArt } from '@shared/types'
import { CoverIcon } from '@/shared/ui/icons'
import { coverSrc } from './lib'
import { useThumb } from './cover-cache'

// Data-URI обложки собирается ОДИН раз на объект обложки.
const coverUrls = new WeakMap<object, string>()

function coverUrl(cover: CoverArt): string {
  let url = coverUrls.get(cover)
  if (url === undefined) {
    url = coverSrc(cover.mime, cover.dataBase64)
    coverUrls.set(cover, url)
  }
  return url
}

function LazyThumb({ cover, className, iconSize }: { cover: CoverArt; className: string; iconSize: number }) {
  const url = useThumb(cover)
  if (url) return <img className={className} alt="" decoding="async" src={url} />
  return (
    <span className={className} aria-hidden="true">
      <CoverIcon size={iconSize} />
    </span>
  )
}

// Обложка в строке списка / палитре. Полная — как раньше; из файла (lazy) — миниатюра,
// которая грузится только пока строка видна.
export function CoverImg({ cover, className, iconSize = 16 }: { cover: CoverArt; className: string; iconSize?: number }) {
  if (cover.lazy) return <LazyThumb cover={cover} className={className} iconSize={iconSize} />
  return <img className={className} alt="" decoding="async" src={coverUrl(cover)} />
}
