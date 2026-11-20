import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { flushSync } from 'react-dom'
import { CoverImg } from '@/entities/track/cover-thumb'
import { formatBadge } from '@/entities/track/lib'
import { copyPlain, copyTracks } from '@/features/editor/lib/copy'
import { editorPlan, useEditor, type TrackVm } from '@/features/editor/model/store'
import { usePrefs } from '@/features/settings/prefs'
import { SidebarStatus } from '@/widgets/save-bar/SaveBar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Hint } from '@/components/ui/tooltip'
import { FadeText } from '@/shared/ui/fade-text'
import {
  ArtistIcon,
  CheckIcon,
  CopyIcon,
  CreatedIcon,
  DurationIcon,
  FileIcon,
  FilePlusIcon,
  FilterIcon,
  FolderIcon,
  FolderOutIcon,
  ModifiedIcon,
  CoverIcon,
  MoreIcon,
  NoteIcon,
  OrderIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SortNameIcon,
  TrashIcon
} from '@/shared/ui/icons'
import { shownTrackArtist, shownTrackTitle, trackDirty } from '@shared/plan'
import { getLocale, tr, useI18n } from '@/shared/i18n'
import { contentSpan, thumbBox, virtualRange } from '@/shared/ui/scroll-metrics'

type SideSort = 'open' | 'name' | 'title' | 'artist' | 'created' | 'modified' | 'duration'

const ROW = 46
const OVERSCAN = 24
// padding-bottom у .track-list по умолчанию. Входит в высоту прокрутки, но не в строки.
// Реальное значение читается в measure(): при открытом статус-баре оно 64 или 160px.
const LIST_TAIL = 10
const NO_PATHS: ReadonlySet<string> = new Set()
// больше стольких новых строк за раз — это «пачка», без анимации появления
const BULK_ROWS = 24
const TRACK_MS = 200
const HEAD_MS = 220

type ExitRow = { track: TrackVm; index: number }

type ListMotion = {
  ready: boolean
  generation: number
  paths: string[]
  entered: ReadonlySet<string>
  exits: ExitRow[]
  above: number
  defer: boolean
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
  return true
}

function sameFiles(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const known = new Set(left)
  return right.every((path) => known.has(path))
}

function viewportRows(list: HTMLUListElement | null): { first: number; last: number } {
  if (!list || list.clientHeight <= 0) return { first: 0, last: 0 }
  return {
    first: Math.floor(list.scrollTop / ROW),
    last: Math.ceil((list.scrollTop + list.clientHeight) / ROW)
  }
}

function placeExits(visible: TrackVm[], exits: readonly ExitRow[], above: number): { track: TrackVm; leaving: boolean }[] {
  const rows = visible.map((track) => ({ track, leaving: false }))
  for (const exit of exits) {
    const at = Math.min(rows.length, Math.max(0, exit.index - above))
    rows.splice(at, 0, { track: exit.track, leaving: true })
  }
  return rows
}

const SORT_ICON: Record<SideSort, ReactNode> = {
  open: <OrderIcon />,
  name: <SortNameIcon />,
  title: <NoteIcon />,
  artist: <ArtistIcon />,
  created: <CreatedIcon />,
  modified: <ModifiedIcon />,
  duration: <DurationIcon />
}

function fileLabel(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

// Ключ сортировки считается один раз на трек (O(n)), а не заново на каждое из ~n·log n сравнений:
// раньше каждое сравнение гоняло regex-split пути и localeCompare с новыми options.
function sortKey(track: TrackVm, sort: SideSort): string | number {
  if (sort === 'name') return fileLabel(track.path)
  if (sort === 'title') return track.draft.title || fileLabel(track.path)
  if (sort === 'artist') return track.draft.artist
  if (sort === 'created') return track.tech.createdMs ?? 0
  if (sort === 'modified') return track.tech.modifiedMs ?? 0
  if (sort === 'duration') return track.tech.durationMs ?? 0
  return 0
}

function compareKeys(left: string | number, right: string | number, sort: SideSort, text: (a: string, b: string) => number): number {
  // даты и длительность: новые/длинные первыми
  if (typeof left === 'number' || typeof right === 'number') return Number(right) - Number(left)
  if (sort === 'artist') return compareArtist(left, right, text)
  return text(left, right)
}

function toView(track: TrackVm) {
  return {
    path: track.path,
    error: track.error,
    original: track.original,
    draft: track.draft,
    originalCover: track.originalCover,
    draftCover: track.draftCover
  }
}

function isDirty(track: TrackVm, plan: ReturnType<typeof editorPlan>): boolean {
  return trackDirty(toView(track), plan)
}

// TODO: move to the i18n packs (needs keys in @/shared/i18n)
const MSG = {
  pathCopied: 'Путь скопирован',
  pathCopyFailed: 'Не удалось скопировать путь',
  pathsCopied: 'Пути скопированы',
  pathsCopyFailed: 'Не удалось скопировать пути',
  refreshFailed: 'Не удалось обновить список'
} as const

// Tracks without an artist go last instead of first.
function compareArtist(a: string, b: string, text: (a: string, b: string) => number): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return text(a, b)
}

function ToolMenu({
  label,
  disabled,
  align,
  icon,
  pressed,
  children
}: {
  label: string
  disabled?: boolean
  align: 'start' | 'end'
  icon: ReactNode
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <Hint label={label} align={align}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={pressed ? 'icon-btn on' : 'icon-btn'} aria-label={label} aria-pressed={pressed} disabled={disabled}>
            {icon}
          </button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align={align} aria-label={label}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type RowProps = {
  track: TrackVm
  plan: ReturnType<typeof editorPlan>
  active: boolean
  leaving: boolean
  entering: boolean
  tabIndex: number
  pos: number
  size: number
  showFormat: boolean
  onPick: (path: string, event: ReactMouseEvent) => void
}

// Строка списка вынесена в memo: при скролле окно сдвигается на одну строку, и раньше
// перерисовывались все ~50 видимых строк (с FadeText, shownTrackTitle, trackDirty).
// Теперь — только вошедшие в окно.
const TrackRow = memo(function TrackRow({ track, plan, active, leaving, entering, tabIndex, pos, size, showFormat, onPick }: RowProps) {
  const { pack } = useI18n()
  const view = toView(track)
  const title = shownTrackTitle(view, plan)
  const artist = shownTrackArtist(view, plan)
  const dirty = isDirty(track, plan)
  const cover = track.draftCover
  const motionClass = leaving ? 'track-out' : entering ? 'track-in' : ''
  return (
    <li
      className={motionClass ? `track-item ${motionClass}` : 'track-item'}
      role="presentation"
      data-selected={active ? 'true' : 'false'}
      aria-hidden={leaving ? true : undefined}
      inert={leaving ? true : undefined}
    >
      <div className="track-clip">
        <button
          type="button"
          role="option"
          aria-selected={active}
          aria-setsize={size}
          aria-posinset={pos}
          tabIndex={tabIndex}
          data-selected={active ? 'true' : 'false'}
          draggable
          data-path={track.path}
          className={active ? 'track-row selected' : 'track-row'}
          onClick={(event) => onPick(track.path, event)}
        >
          {cover ? (
            <CoverImg cover={cover} className="thumb" iconSize={16} />
          ) : (
            <span className="thumb" aria-hidden="true">
              <CoverIcon size={16} />
            </span>
          )}
          <span className="track-copy">
            <span className="track-title">
              <span className={dirty ? 'head-dirty on' : 'head-dirty'}>
                <span>
                  <span
                    className="dirty"
                    role={dirty ? 'img' : undefined}
                    aria-label={dirty ? pack.dirty : undefined}
                    aria-hidden={dirty ? undefined : true}
                  />
                </span>
              </span>
              <FadeText>{title}</FadeText>
            </span>
            <span className={track.error ? 'track-sub error' : 'track-sub'}>
              <FadeText>{(track.error ? tr(track.error) : '') || artist || pack.noArtist}</FadeText>
            </span>
          </span>
          <span className={showFormat ? 'track-badge on' : 'track-badge'}>
            <span>
              <span className="badge">{formatBadge(track.format)}</span>
            </span>
          </span>
        </button>
      </div>
    </li>
  )
})

// Одно контекстное меню на весь список (аудит A1). ContextMenuContent всегда держит
// Portal + Presence; меню на каждой из 32+ строк давало 64 вложенных dispatch на первом
// коммите и «Maximum update depth exceeded». Здесь меню одно, а путь строки берётся в момент ПКМ.
function TrackMenuContent({ path, group, broken }: { path: string | null; group: boolean; broken: boolean }) {
  const remove = useEditor((state) => state.remove)
  const removeSelected = useEditor((state) => state.removeSelected)
  const revealFile = useEditor((state) => state.revealFile)
  const openFile = useEditor((state) => state.openFile)
  const requestPlay = useEditor((state) => state.requestPlay)
  const nowPlaying = useEditor((state) => state.nowPlaying)
  const { pack } = useI18n()
  if (!path) return null
  const playing = nowPlaying === path
  return (
    <ContextMenuContent>
      <ContextMenuItem disabled={broken} onSelect={() => requestPlay(path)}>
        {playing ? <PauseIcon /> : <PlayIcon />}
        {playing ? pack.pause : pack.play}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void revealFile(path)}>
        <FolderOutIcon />
        {pack.revealFile}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void openFile(path)}>
        <FileIcon />
        {pack.openFile}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void copyTracks('files', path)}>
        <CopyIcon />
        {group ? pack.copyFiles : pack.copyFile}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void copyTracks('paths', path)}>
        <CopyIcon />
        {group ? pack.copyPaths : pack.copyPath}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => (group ? removeSelected() : remove(path))}>
        <TrashIcon />
        {group ? pack.removeMany : pack.removeOne}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export function TrackSidebar({ loading, collapsed = false }: { loading: boolean; collapsed?: boolean }) {
  const tracks = useEditor((state) => state.tracks)
  const selected = useEditor((state) => state.selected)
  const plan = useEditor(editorPlan)
  const clear = useEditor((state) => state.clear)
  const refresh = useEditor((state) => state.refresh)
  const refreshSource = useEditor((state) => state.refreshSource)
  const openSource = useEditor((state) => state.openSource)
  const sourceDir = useEditor((state) => state.sourceDir)
  const revealCurrent = useEditor((state) => state.revealCurrent)
  const openCurrent = useEditor((state) => state.openCurrent)
  const openDialog = useEditor((state) => state.openDialog)
  const openFolder = useEditor((state) => state.openFolder)
  const select = useEditor((state) => state.select)
  const setListOrder = useEditor((state) => state.setListOrder)
  const focus = useEditor((state) => state.focus)
  const saving = useEditor((state) => state.saving)
  const [refreshing, setRefreshing] = useState(false)
  // путь строки, на которой открыто контекстное меню (ref — для обработчика, state — для рендера)
  const menuPathRef = useRef<string | null>(null)
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const { pack } = useI18n()
  const showFormat = usePrefs().showFormatBadges
  const sorts: { id: SideSort; label: string; icon: ReactNode }[] = [
    { id: 'open', label: pack.sortOpen, icon: SORT_ICON.open },
    { id: 'name', label: pack.sortName, icon: SORT_ICON.name },
    { id: 'title', label: pack.sortTitle, icon: SORT_ICON.title },
    { id: 'artist', label: pack.sortArtist, icon: SORT_ICON.artist },
    { id: 'created', label: pack.sortCreated, icon: SORT_ICON.created },
    { id: 'modified', label: pack.sortModified, icon: SORT_ICON.modified },
    { id: 'duration', label: pack.sortDuration, icon: SORT_ICON.duration }
  ]
  const picked = useMemo(() => new Set(selected), [selected])
  const [sort, setSort] = useState<SideSort>('open')
  const [span, setSpan] = useState({ start: 0, end: 32 })
  const spanRef = useRef(span)
  const countRef = useRef(0)
  spanRef.current = span
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const [overflow, setOverflow] = useState(false)
  const [barOn, setBarOn] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const hideTimer = useRef(0)
  const drag = useRef<{ y: number; top: number } | null>(null)
  const overThumb = useRef(false)
  const overList = useRef(false)
  const barOnRef = useRef(false)
  const cssRef = useRef('')
  const scrollRef = useRef(0)
  const knownTracks = useRef<readonly TrackVm[]>([])
  const orderRef = useRef<readonly TrackVm[]>([])
  const metrics = useRef({ view: 0, rail: 0, tail: LIST_TAIL })
  const thumbDraw = useRef(0)
  const thumbRaf = useRef(0)
  const scrollGen = useRef(0)
  const [motion, setMotion] = useState<ListMotion>({
    ready: false,
    generation: 0,
    paths: [],
    entered: new Set(),
    exits: [],
    above: 0,
    defer: false
  })

  const pick = useCallback(
    (path: string, event: ReactMouseEvent) => {
      if (event.shiftKey) select(path, 'range')
      else if (event.ctrlKey || event.metaKey) select(path, 'toggle')
      else select(path, 'single')
    },
    [select]
  )

  const menuBroken = useMemo(
    () => (menuPath ? Boolean(tracks.find((track) => track.path === menuPath)?.error) : false),
    [menuPath, tracks]
  )

  const visible = useMemo(() => {
    if (sort === 'open') return tracks
    const collator = new Intl.Collator(getLocale(), { sensitivity: 'base' })
    return tracks
      .map((track, index) => ({ track, index, key: sortKey(track, sort) }))
      .sort((left, right) => compareKeys(left.key, right.key, sort, collator.compare) || left.index - right.index)
      .map((item) => item.track)
  }, [tracks, sort])
  // Массив путей: пока порядок не изменился, возвращается ТА ЖЕ ссылка. Не нужно join/split
  // огромной строки, а сравнения ниже (samePaths, deps эффектов) становятся O(1).
  const pathsRef = useRef<string[]>([])
  const nextPaths = useMemo(() => {
    const paths = visible.map((track) => track.path)
    if (samePaths(pathsRef.current, paths)) return pathsRef.current
    pathsRef.current = paths
    return paths
  }, [visible])
  orderRef.current = visible

  useEffect(() => {
    if (!tracks.length) setSort('open')
  }, [tracks.length])

  const paintSpacers = (start: number, end: number, count: number) => {
    const pad = start * ROW
    const rest = Math.max(0, count - end) * ROW
    const css = `.track-list{--list-pad:${pad}px;--list-rest:${rest}px}`
    if (css === cssRef.current) return
    cssRef.current = css
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    sheetRef.current.replaceSync(css)
  }

  const drawThumb = () => {
    const view = metrics.current.view
    const railH = metrics.current.rail
    const content = contentSpan(countRef.current, ROW, metrics.current.tail)
    const scroll = scrollRef.current
    const max = content - view
    const can = max > 1 && view > 0
    const top = can && scroll > 2
    const bottom = can && max - scroll > 16
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
    setOverflow((prev) => (prev === can ? prev : can))
    const thumb = thumbRef.current
    if (!can || !thumb || railH <= 0) return
    const target = thumbBox(view, content, railH, scroll)
    let height = target.height
    // Высота догоняет известное число строк по кадрам. Позиция — от кэшированного scrollTop, без чтения layout.
    if (!drag.current && thumbDraw.current > 0 && Math.abs(target.height - thumbDraw.current) > 4) {
      height = thumbDraw.current + (target.height - thumbDraw.current) * 0.35
      if (Math.abs(height - target.height) > 0.6) scheduleThumb()
    }
    thumbDraw.current = height
    const y = target.max > 0 ? (scroll / target.max) * Math.max(0, railH - height) : 0
    thumb.style.height = `${height}px`
    thumb.style.transform = `translateY(${y}px)`
  }

  const scheduleThumb = () => {
    if (thumbRaf.current) return
    thumbRaf.current = requestAnimationFrame(() => {
      thumbRaf.current = 0
      drawThumb()
    })
  }

  const syncWindow = (flush = false) => {
    const el = listRef.current
    if (!el) return
    const count = countRef.current
    const view = metrics.current.view || el.clientHeight
    if (view && metrics.current.view !== view) metrics.current.view = view
    const next = virtualRange(el.scrollTop, view, count, ROW, OVERSCAN)
    paintSpacers(next.start, next.end, count)
    const current = spanRef.current
    if (current.start === next.start && current.end === next.end) return
    if (flush) flushSync(() => setSpan(next))
    else setSpan(next)
  }

  const reveal = () => {
    const max = contentSpan(countRef.current, ROW, metrics.current.tail) - metrics.current.view
    if (max <= 1) return
    if (!barOnRef.current) {
      barOnRef.current = true
      setBarOn(true)
    }
    window.clearTimeout(hideTimer.current)
    if (overList.current || overThumb.current || drag.current) return
    hideTimer.current = window.setTimeout(() => {
      if (overList.current || overThumb.current || drag.current) return
      barOnRef.current = false
      setBarOn(false)
    }, 800)
  }

  const measure = () => {
    const el = listRef.current
    if (el) {
      metrics.current.view = el.clientHeight
      // .list-pane:has(.side-status.on) увеличивает padding-bottom списка (64/160px). Меняется content-box,
      // ResizeObserver срабатывает и сюда приходит новое значение; в горячем пути (scroll) этого чтения нет.
      const tail = Number.parseFloat(getComputedStyle(el).paddingBottom)
      metrics.current.tail = Number.isFinite(tail) ? tail : LIST_TAIL
    }
    const rail = railRef.current
    if (rail) metrics.current.rail = rail.clientHeight
  }

  const latest = useRef({ syncWindow, scheduleThumb, reveal, measure })
  latest.current = { syncWindow, scheduleThumb, reveal, measure }

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      scrollRef.current = el.scrollTop
      // Окно строк — в том же кадре, что и scrollTop, иначе виден пустой промежуток.
      latest.current.syncWindow(true)
      latest.current.scheduleThumb()
      latest.current.reveal()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => {
      latest.current.measure()
      latest.current.syncWindow(false)
      latest.current.scheduleThumb()
    })
    observer.observe(el)
    latest.current.measure()
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    measure()
    syncWindow(false)
    scheduleThumb()
  }, [overflow])

  useLayoutEffect(() => {
    syncWindow(false)
    scheduleThumb()
  }, [tracks.length, sort, loading])

  useLayoutEffect(() => {
    if (scrollGen.current === motion.generation) return
    scrollGen.current = motion.generation
    const list = listRef.current
    if (!list || !motion.above) return
    // Rows removed above the viewport are not drawn; shift scroll so the visible files stay put.
    list.scrollTop = Math.max(0, list.scrollTop - motion.above * ROW)
    latest.current.syncWindow(false)
    latest.current.scheduleThumb()
  }, [motion.generation, motion.above])

  // К выбранному файлу едем только когда сменился focus (клик, клавиатура, история).
  // Пачки дописываются в конец и focus не трогают, поэтому прокрутка остаётся на месте.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || !focus) return
    const index = orderRef.current.findIndex((track) => track.path === focus)
    if (index < 0) return
    const top = index * ROW
    const bottom = top + ROW
    const view = metrics.current.view || list.clientHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + view) list.scrollTop = bottom - view
    else return
    scrollRef.current = list.scrollTop
  }, [focus])

  useLayoutEffect(() => {
    knownTracks.current = visible
  }, [visible])

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimer.current)
      if (thumbRaf.current) cancelAnimationFrame(thumbRaf.current)
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!motion.entered.size && !motion.exits.length) return
    const wait = motion.defer ? HEAD_MS + TRACK_MS : TRACK_MS
    const id = window.setTimeout(() => {
      setMotion((current) => {
        if (!current.entered.size && !current.exits.length) return current
        return { ...current, entered: new Set(), exits: [], above: 0, defer: false }
      })
    }, wait)
    return () => window.clearTimeout(id)
  }, [motion.generation, motion.defer])

  const onThumbDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = listRef.current
    if (!el) return
    drag.current = { y: event.clientY, top: el.scrollTop }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    thumbRef.current?.classList.add('dragging')
    reveal()
  }

  const onThumbMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const el = listRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    if (!state || !el || !rail || !thumb) return
    const view = metrics.current.view || el.clientHeight
    const railH = metrics.current.rail || rail.clientHeight
    const max = contentSpan(countRef.current, ROW, metrics.current.tail) - view
    const travel = Math.max(1, railH - thumbDraw.current)
    el.scrollTop = state.top + ((event.clientY - state.y) / travel) * max
  }

  const onThumbUp = () => {
    drag.current = null
    thumbRef.current?.classList.remove('dragging')
    reveal()
  }

  if (!motion.ready) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const many = nextPaths.length > BULK_ROWS
    const entered = reduced || many ? NO_PATHS : new Set(nextPaths)
    setMotion({
      ready: true,
      generation: 1,
      paths: nextPaths,
      entered,
      exits: [],
      above: 0,
      defer: entered.size > 0
    })
  } else if (motion.paths !== nextPaths && (loading || nextPaths.length - motion.paths.length > BULK_ROWS)) {
    // Догрузка: не строим множества на все пути и не анимируем тысячи строк.
    // generation не растим — иначе эффект прокрутки срабатывает на каждую пачку.
    setMotion({
      ready: true,
      generation: motion.generation,
      paths: nextPaths,
      entered: NO_PATHS,
      exits: [],
      above: 0,
      defer: false
    })
  } else if (!samePaths(motion.paths, nextPaths)) {
    if (sameFiles(motion.paths, nextPaths)) {
      // тот же состав, другой порядок (сортировка): анимации входа/выхода тут не нужны,
      // иначе перемещённые узлы заново проигрывают track-in
      setMotion({ ...motion, paths: nextPaths, entered: new Set(), exits: [], above: 0, defer: false })
    } else {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const previous = new Set(motion.paths)
      const nextSet = new Set(nextPaths)
      const entered = new Set<string>()
      const exits: ExitRow[] = []
      let above = 0
      if (!reduced) {
        for (const path of nextPaths) {
          if (!previous.has(path)) entered.add(path)
        }
        const { first, last } = viewportRows(listRef.current)
        motion.paths.forEach((path, index) => {
          if (nextSet.has(path)) return
          const track = knownTracks.current[index]
          if (!track) return
          if (index < first) {
            above += 1
            return
          }
          if (index >= last) return
          exits.push({ track, index })
        })
        exits.sort((left, right) => left.index - right.index)
      }
      setMotion({
        ready: true,
        generation: motion.generation + 1,
        paths: nextPaths,
        entered,
        exits,
        above,
        defer: motion.paths.length === 0 && entered.size > 0
      })
    }
  }

  const spinning = loading || refreshing
  const placed = motion.exits.length ? placeExits(visible, motion.exits, motion.above) : null
  countRef.current = placed ? placed.length : visible.length
  const rows = placed
    ? placed.slice(span.start, span.end)
    : visible.slice(span.start, span.end).map((track) => ({ track, leaving: false }))
  const headOpen = tracks.length > 0 || motion.exits.length > 0
  const anchor = focus ?? selected.at(-1) ?? null
  const anchorShown = anchor !== null && rows.some((row) => row.track.path === anchor)

  const reload = () => {
    if (refreshing || saving) return
    setRefreshing(true)
    const started = performance.now()
    void (async () => {
      try {
        if (useEditor.getState().sourceDir) await refreshSource()
        if (useEditor.getState().tracks.length) await refresh()
      } catch (error: unknown) {
        useEditor.getState().notify({ kind: 'err', text: error instanceof Error && error.message ? error.message : MSG.refreshFailed })
      } finally {
        const wait = 500 - (performance.now() - started)
        if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait))
        setRefreshing(false)
      }
    })()
  }

  useEffect(() => {
    setListOrder(nextPaths)
  }, [nextPaths, setListOrder])

  return (
    <aside className="sidebar" aria-hidden={collapsed} inert={collapsed ? true : undefined}>
      <div className="toolbar">
        <ToolMenu label={pack.addFiles} align="start" icon={<PlusIcon />}>
          <DropdownMenuItem onSelect={() => void openDialog()}>
            <FilePlusIcon />
            {pack.files}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void openFolder()}>
            <FolderIcon />
            {pack.folder}
          </DropdownMenuItem>
        </ToolMenu>
        <Hint label={pack.refresh} align="start">
          <button
            type="button"
            className="icon-btn"
            aria-label={pack.refresh}
            disabled={(!tracks.length && !sourceDir) || spinning || saving}
            onClick={reload}
          >
            <RefreshIcon />
          </button>
        </Hint>
        <ToolMenu label={pack.sort} disabled={!tracks.length} align="start" pressed={sort !== 'open'} icon={<FilterIcon />}>
          {sorts.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => setSort(item.id)}>
              {item.icon}
              {item.label}
              <CheckIcon className={sort === item.id ? 'menu-check' : 'menu-check-off'} />
            </DropdownMenuItem>
          ))}
        </ToolMenu>
        <span className="toolbar-gap" />
        <ToolMenu label={pack.more} align="end" disabled={!sourceDir && !tracks.length} icon={<MoreIcon />}>
          <DropdownMenuItem disabled={!selected.length} onSelect={() => void revealCurrent()}>
            <FolderOutIcon />
            {pack.revealFile}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!selected.length} onSelect={() => void openCurrent()}>
            <FileIcon />
            {pack.openFile}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!sourceDir} onSelect={() => void openSource()}>
            <FolderIcon />
            {pack.folderInExplorer}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!sourceDir}
            onSelect={() => {
              if (!sourceDir) return
              void copyPlain(sourceDir, MSG.pathCopied, MSG.pathCopyFailed)
            }}
          >
            <CopyIcon />
            {pack.copyFolderPath}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!tracks.length}
            onSelect={() => {
              const text = visible.map((track) => track.path).join('\n')
              void copyPlain(text, MSG.pathsCopied, MSG.pathsCopyFailed)
            }}
          >
            <FileIcon />
            {pack.copyFilePaths}
          </DropdownMenuItem>
        </ToolMenu>
      </div>
      <div className="list-pane">
      <div className={headOpen ? 'list-head on' : 'list-head'}>
        <div>
          <span className="list-head-label">
            <span>{pack.files} · <span className="list-count">{tracks.length}</span></span>
            {spinning ? <span className="list-spinner" role="status" aria-label={pack.refreshing} /> : null}
          </span>
          <button type="button" className="list-clear" onClick={clear}>{pack.clear}</button>
        </div>
      </div>
      <div
        className="list-body"
        onPointerEnter={() => {
          overList.current = true
          reveal()
        }}
        onPointerLeave={() => {
          overList.current = false
          reveal()
        }}
        onPointerMove={reveal}
      >
      <div className="list-scroll">
      <div className={edges.top ? 'list-edge top on' : 'list-edge top'} />
      {!tracks.length && !motion.exits.length ? <div className="list-empty">{loading ? pack.reading : pack.emptyList}</div> : null}
      <ContextMenu
        onOpenChange={(open) => {
          const path = menuPathRef.current
          if (open && path && !useEditor.getState().selected.includes(path)) select(path, 'single')
        }}
      >
      <ContextMenuTrigger asChild>
      <ul
        ref={listRef}
        className={`track-list${motion.defer && motion.entered.size ? ' defer-in' : ''}${loading || motion.entered.size > BULK_ROWS ? ' bulk' : ''}`}
        role="listbox"
        aria-multiselectable="true"
        aria-label={pack.tracks}
        onContextMenu={(event) => {
          const target = event.target
          const row = target instanceof Element ? target.closest('.track-row') : null
          const path = row instanceof HTMLElement ? row.dataset.path : undefined
          if (!path) {
            // ПКМ мимо строки: меню не открываем (Radix пропускает свой обработчик при defaultPrevented)
            event.preventDefault()
            return
          }
          menuPathRef.current = path
          setMenuPath(path)
        }}
      >
        {rows.map(({ track, leaving }, i) => (
          <TrackRow
            key={track.path}
            track={track}
            plan={plan}
            active={picked.has(track.path)}
            leaving={leaving}
            entering={motion.entered.has(track.path)}
            tabIndex={anchorShown ? (track.path === anchor ? 0 : -1) : i === 0 ? 0 : -1}
            pos={span.start + i + 1}
            size={visible.length}
            showFormat={showFormat}
            onPick={pick}
          />
        ))}
      </ul>
      </ContextMenuTrigger>
      <TrackMenuContent path={menuPath} group={menuPath !== null && picked.has(menuPath) && selected.length > 1} broken={menuBroken} />
      </ContextMenu>
      <div className={edges.bottom ? 'list-edge bottom on' : 'list-edge bottom'} />
      {overflow ? (
        <div ref={railRef} className={barOn ? 'list-rail live' : 'list-rail'}>
          <div
            ref={thumbRef}
            className="list-thumb"
            onPointerEnter={() => {
              overThumb.current = true
              window.clearTimeout(hideTimer.current)
            }}
            onPointerLeave={() => {
              overThumb.current = false
              reveal()
            }}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
          />
        </div>
      ) : null}
      </div>
      </div>
      <SidebarStatus />
      </div>
    </aside>
  )
}