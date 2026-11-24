import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from '@/components/ui/menubar'
import { useEditor } from '@/features/editor/model/store'
import { copyTracks } from '@/features/editor/lib/copy'
import { Hint } from '@/components/ui/tooltip'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CopyIcon, FileIcon, FilePlusIcon, FolderIcon, FolderOutIcon, GithubIcon, MenuIcon, MoreIcon, PauseIcon, PlayIcon, PlayerToggleIcon, RefreshStopIcon, RestoreIcon, SearchIcon, SelectAllIcon, SettingsIcon, SidebarIcon, TrashIcon, UndoIcon, RedoIcon } from '@/shared/ui/icons'
import { TITLEBAR_CENTER_ID, TITLEBAR_LEFT_ID, TITLEBAR_RIGHT_ID, ensureTitlebarRegions } from '@shared/titlebar'
import { packTitlebarMenuOverflow } from '@/widgets/chrome/menu-overflow'
import { setAppSetting, useAppSettings } from '@/features/settings/app-settings'
import { ariaChord, formatChord, setShowFormatBadges, shortcutMatches, usePrefs, useShortcut, type ShortcutId } from '@/features/settings/prefs'
import { isMac } from '@/shared/lib/platform'
import { SettingsDialog, type SettingsSection } from '@/widgets/settings/SettingsDialog'
import { ZOOM_STEPS, type ZoomStep } from '@shared/types'
import { useI18n } from '@/shared/i18n'

type Placement = 'after-icon' | 'center' | 'before-controls'

function titlebarRoot(): HTMLElement | null {
  const bar = document.querySelector('.cet-titlebar')
  if (!(bar instanceof HTMLElement)) return null
  ensureTitlebarRegions(bar)
  return bar
}

function ensureHost(id: string, placement: Placement): HTMLElement | null {
  const existing = document.getElementById(id)
  if (existing) return existing
  if (!titlebarRoot()) return null
  const host = document.createElement('div')
  host.id = id
  if (placement === 'before-controls') {
    const right = document.getElementById(TITLEBAR_RIGHT_ID)
    if (!(right instanceof HTMLElement)) return null
    const controls = right.querySelector('.cet-window-controls')
    if (controls) controls.before(host)
    else right.append(host)
    return host
  }
  if (placement === 'center') {
    const center = document.getElementById(TITLEBAR_CENTER_ID)
    if (!(center instanceof HTMLElement)) return null
    center.append(host)
    return host
  }
  const left = document.getElementById(TITLEBAR_LEFT_ID)
  if (!(left instanceof HTMLElement)) return null
  const icon = left.querySelector('.cet-icon, .window-appicon')
  if (icon) icon.after(host)
  else left.append(host)
  return host
}

function TitlebarHost({ id, placement, children }: { id: string; placement: Placement; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    let cancelled = false
    const attach = () => {
      if (cancelled) return false
      const next = ensureHost(id, placement)
      if (!next) return false
      setHost(next)
      return true
    }
    if (attach()) {
      return () => {
        cancelled = true
      }
    }
    const observer = new MutationObserver(() => {
      if (attach()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [id, placement])
  if (!host) return null
  return createPortal(children, host)
}

const MENU_IDS = ['file', 'edit', 'view', 'window', 'help'] as const

type TitlebarMenuId = (typeof MENU_IDS)[number]

const OVERFLOW_BTN_PX = 22
const MENU_GAP_PX = 2
// зазор между последним пунктом меню и кнопками истории (.title-file-nav)
const NAV_GAP_PX = 8

const SHEET_MENU = [
  { id: 'main', label: 'tabMain', shortcut: 'tabMain' },
  { id: 'note', label: 'tabNote', shortcut: 'tabNote' },
  { id: 'lyrics', label: 'tabLyrics', shortcut: 'tabLyrics' },
  { id: 'detail', label: 'tabInfo', shortcut: 'tabInfo' },
  { id: 'file', label: 'tabFile', shortcut: 'tabFile' }
] as const

type MenuChrome = {
  onPalette: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  playerOpen: boolean
  onTogglePlayer: () => void
}

function openSettings(section: SettingsSection): void {
  window.dispatchEvent(new CustomEvent('mte-open-settings', { detail: section }))
}

function MenuKey({ id }: { id: ShortcutId }) {
  const chord = useShortcut(id)
  if (!chord) return null
  return <MenubarShortcut>{formatChord(chord)}</MenubarShortcut>
}

function MenuItems({ id, onPalette, sidebarOpen, onToggleSidebar, playerOpen, onTogglePlayer }: { id: TitlebarMenuId } & MenuChrome) {
  const { pack } = useI18n()
  const openDialog = useEditor((state) => state.openDialog)
  const openFolder = useEditor((state) => state.openFolder)
  const saveAll = useEditor((state) => state.requestSave)
  const requestClear = useEditor((state) => state.requestClear)
  const loading = useEditor((state) => state.loading)
  const refresh = useEditor((state) => state.refresh)
  const cancelLoad = useEditor((state) => state.cancelLoad)
  const revealCurrent = useEditor((state) => state.revealCurrent)
  const openCurrent = useEditor((state) => state.openCurrent)
  const undoOnce = useEditor((state) => state.undoOnce)
  const redoOnce = useEditor((state) => state.redoOnce)
  const requestReset = useEditor((state) => state.requestReset)
  const selectAll = useEditor((state) => state.selectAll)
  const selectDelta = useEditor((state) => state.selectDelta)
  const removeSelected = useEditor((state) => state.removeSelected)
  const requestPlay = useEditor((state) => state.requestPlay)
  const requestClose = useEditor((state) => state.requestClose)
  const goFileHistory = useEditor((state) => state.goFileHistory)
  const trackCount = useEditor((state) => state.tracks.length)
  const selectedCount = useEditor((state) => state.selected.length)
  const canUndo = useEditor((state) => state.undo.length > 0)
  const canRedo = useEditor((state) => state.redo.length > 0)
  const canBack = useEditor((state) => state.filePast.length > 0)
  const canForward = useEditor((state) => state.fileFuture.length > 0)
  const busy = useEditor((state) => state.loading || state.saving)
  // Селекторы zustand обязаны возвращать СТАБИЛЬНОЕ значение: раньше здесь создавался новый объект
  // на каждый вызов, useSyncExternalStore видел «новый снимок» бесконечно -> Maximum update depth exceeded.
  // Поэтому три отдельных селектора с примитивами.
  const currentPath = useEditor((state) =>
    state.focus && state.selected.includes(state.focus)
      ? state.focus
      : state.anchor && state.selected.includes(state.anchor)
        ? state.anchor
        : (state.selected[0] ?? null)
  )
  const currentBroken = useEditor((state) => {
    const path =
      state.focus && state.selected.includes(state.focus)
        ? state.focus
        : state.anchor && state.selected.includes(state.anchor)
          ? state.anchor
          : (state.selected[0] ?? null)
    return path ? Boolean(state.tracks.find((item) => item.path === path)?.error) : false
  })
  const currentPlaying = useEditor((state) => {
    const path =
      state.focus && state.selected.includes(state.focus)
        ? state.focus
        : state.anchor && state.selected.includes(state.anchor)
          ? state.anchor
          : (state.selected[0] ?? null)
    return path !== null && state.nowPlaying === path
  })
  const showFormat = usePrefs().showFormatBadges
  const zoom = useAppSettings().settings.zoom
  const onTop = useAppSettings().settings.alwaysOnTop
  const zoomIndex = ZOOM_STEPS.indexOf(zoom)
  const noTracks = trackCount === 0
  const noSelection = selectedCount === 0

  if (id === 'file') {
    return (
      <>
        <MenubarItem onSelect={() => void openDialog()}>
          <FilePlusIcon />
          {pack.openFiles}
          <MenuKey id="open" />
        </MenubarItem>
        <MenubarItem onSelect={() => void openFolder()}>
          <FolderIcon />
          {pack.openFolder}
          <MenuKey id="folder" />
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem disabled={busy} onSelect={() => saveAll()}>
          <CheckIcon />
          {pack.writeTags}
          <MenuKey id="save" />
        </MenubarItem>
        <MenubarItem
          disabled={loading ? false : noTracks || busy}
          onSelect={() => (loading ? cancelLoad() : void refresh())}
        >
          <RefreshStopIcon stop={loading} />
          <span className={loading ? 'swap-label is-stop' : 'swap-label'}>
            <span aria-hidden={loading}>{pack.refresh}</span>
            <span aria-hidden={!loading}>{pack.stopLoad}</span>
          </span>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem disabled={noSelection} onSelect={() => void revealCurrent()}>
          <FolderOutIcon />
          {pack.revealFile}
        </MenubarItem>
        <MenubarItem disabled={noSelection} onSelect={() => void openCurrent()}>
          <FileIcon />
          {pack.openFile}
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem disabled={noSelection || busy} onSelect={() => removeSelected()}>
          <TrashIcon />
          {selectedCount > 1 ? pack.removeMany : pack.removeOne}
          <MenuKey id="remove" />
        </MenubarItem>
        <MenubarItem disabled={noTracks && !loading} onSelect={requestClear}>
          {pack.clearList}
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onSelect={requestClose}>{pack.nativeQuit}</MenubarItem>
      </>
    )
  }
  if (id === 'edit') {
    return (
      <>
        <MenubarItem disabled={!canUndo} onSelect={undoOnce}>
          <UndoIcon />
          {pack.undo}
          <MenuKey id="undo" />
        </MenubarItem>
        <MenubarItem disabled={!canRedo} onSelect={redoOnce}>
          <RedoIcon />
          {pack.redo}
          <MenuKey id="redo" />
        </MenubarItem>
        <MenubarItem disabled={!canUndo} onSelect={requestReset}>
          <RestoreIcon />
          {pack.undoAll}
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem disabled={noTracks} onSelect={selectAll}>
          <SelectAllIcon />
          {pack.selectAll}
          <MenuKey id="selectAll" />
        </MenubarItem>
        <MenubarItem disabled={noSelection} onSelect={() => void copyTracks('files')}>
          <CopyIcon />
          {selectedCount > 1 ? pack.copyFiles : pack.copyFile}
          <MenuKey id="copyFiles" />
        </MenubarItem>
        <MenubarItem disabled={noSelection} onSelect={() => void copyTracks('paths')}>
          <CopyIcon />
          {selectedCount > 1 ? pack.copyPaths : pack.copyPath}
        </MenubarItem>
      </>
    )
  }
  if (id === 'view') {
    return (
      <>
        <MenubarItem onSelect={onPalette}>
          <SearchIcon />
          {pack.searchCommands}
          <MenuKey id="palette" />
        </MenubarItem>
        <MenubarItem onSelect={() => openSettings('language')}>
          <SettingsIcon />
          {pack.settings}
          <MenuKey id="settings" />
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onSelect={onToggleSidebar}>{sidebarOpen ? pack.hideList : pack.showList}</MenubarItem>
        <MenubarItem onSelect={onTogglePlayer}>{playerOpen ? pack.hidePlayer : pack.showPlayer}</MenubarItem>
        <MenubarCheckboxItem checked={showFormat} onCheckedChange={(value) => setShowFormatBadges(value === true)}>
          {pack.settingsFormatBadges}
        </MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarSub>
          <MenubarSubTrigger>{pack.sections}</MenubarSubTrigger>
          <MenubarSubContent className="mte-menubar-content">
            {SHEET_MENU.map((item) => (
              <MenubarItem key={item.id} onSelect={() => window.dispatchEvent(new CustomEvent('mte-sheet-tab', { detail: item.id }))}>
                {pack[item.label]}
                <MenuKey id={item.shortcut} />
              </MenubarItem>
            ))}
          </MenubarSubContent>
        </MenubarSub>
      </>
    )
  }
  if (id === 'window') {
    const stepZoom = (dir: 1 | -1) => {
      const next = ZOOM_STEPS[zoomIndex + dir]
      if (next !== undefined) setAppSetting('zoom', next)
    }
    return (
      <>
        <MenubarItem disabled={noTracks} onSelect={() => selectDelta(-1)}>
          {pack.prevFile}
          <MenubarShortcut>↑</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled={noTracks} onSelect={() => selectDelta(1)}>
          {pack.nextFile}
          <MenubarShortcut>↓</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled={!canBack} onSelect={() => goFileHistory(-1)}>
          <ArrowLeftIcon />
          {pack.fileBack}
        </MenubarItem>
        <MenubarItem disabled={!canForward} onSelect={() => goFileHistory(1)}>
          <ArrowRightIcon />
          {pack.fileForward}
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem disabled={!currentPath || currentBroken} onSelect={() => currentPath && requestPlay(currentPath)}>
          {currentPlaying ? <PauseIcon /> : <PlayIcon />}
          {currentPlaying ? pack.pause : pack.play}
        </MenubarItem>
        <MenubarSeparator />
        <MenubarCheckboxItem checked={onTop} onCheckedChange={(value) => setAppSetting('alwaysOnTop', value === true)}>
          {pack.settingsOnTop}
        </MenubarCheckboxItem>
        <MenubarItem disabled={zoomIndex <= 0} onSelect={() => stepZoom(-1)}>
          {pack.nativeZoomOut}
        </MenubarItem>
        <MenubarItem disabled={zoomIndex < 0 || zoomIndex >= ZOOM_STEPS.length - 1} onSelect={() => stepZoom(1)}>
          {pack.nativeZoomIn}
        </MenubarItem>
        <MenubarItem disabled={zoom === 1} onSelect={() => setAppSetting('zoom', 1 satisfies ZoomStep)}>
          {pack.nativeZoom}
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onSelect={() => void window.musicTagEditor?.reloadWindow()}>{pack.nativeReload}</MenubarItem>
      </>
    )
  }
  return (
    <>
      <MenubarItem onSelect={() => openSettings('shortcuts')}>{pack.settingsShortcuts}</MenubarItem>
      <MenubarItem onSelect={() => void window.musicTagEditor?.openRepository()}>
        <GithubIcon />
        {pack.github}
      </MenubarItem>
      <MenubarItem onSelect={() => void window.musicTagEditor?.openIssues('')}>{pack.crashReport}</MenubarItem>
    </>
  )
}

function menuTriggerAt(x: number, y: number): string {
  const hit = document.elementFromPoint(x, y)
  if (!(hit instanceof Element)) return ''
  const trigger = hit.closest('[data-slot="menubar-trigger"]')
  if (!(trigger instanceof HTMLElement)) return ''
  if (trigger.getAttribute('aria-hidden') === 'true') return ''
  return trigger.dataset.menu ?? ''
}

function useTitlebarMenus() {
  const { pack, locale } = useI18n()
  const menus = [
    { id: 'file' as const, label: pack.file },
    { id: 'edit' as const, label: pack.edit },
    { id: 'view' as const, label: pack.view },
    { id: 'window' as const, label: pack.window },
    { id: 'help' as const, label: pack.help }
  ]
  return { pack, locale, menus }
}

function IconMenu(chrome: MenuChrome) {
  const { pack, menus } = useTitlebarMenus()
  const [openMenu, setOpenMenu] = useState('')
  return (
    <Menubar className="mte-titlebar-menubar is-icon" aria-label={pack.menuApp} value={openMenu} onValueChange={setOpenMenu}>
      <MenubarMenu value="overflow">
        <MenubarTrigger className="mte-menu-overflow is-menu" data-menu="overflow" aria-label={pack.menuOverflow}>
          <MenuIcon />
        </MenubarTrigger>
        <MenubarContent className="mte-menubar-content" alignOffset={0} sideOffset={4}>
          {menus.map((menu) => (
            <MenubarSub key={menu.id}>
              <MenubarSubTrigger>{menu.label}</MenubarSubTrigger>
              <MenubarSubContent className="mte-menubar-content">
                <MenuItems id={menu.id} {...chrome} />
              </MenubarSubContent>
            </MenubarSub>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

function BarMenu(chrome: MenuChrome) {
  const { pack, locale, menus } = useTitlebarMenus()
  const [shown, setShown] = useState<number>(menus.length)
  const [openMenu, setOpenMenu] = useState('')
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const calculating = useRef(false)
  const hidden = menus.slice(shown)
  const hamburger = shown === 0
  const hasOverflow = shown < menus.length

  useEffect(() => {
    if (!openMenu) return
    const follow = (event: PointerEvent) => {
      const next = menuTriggerAt(event.clientX, event.clientY)
      if (!next || next === openMenu) return
      setOpenMenu(next)
    }
    window.addEventListener('pointermove', follow)
    return () => window.removeEventListener('pointermove', follow)
  }, [openMenu])

  useLayoutEffect(() => {
    const host = document.getElementById('mte-titlebar-menu-host')
    if (!(host instanceof HTMLElement)) return
    const update = () => {
      if (calculating.current) return
      calculating.current = true
      try {
        const widths = menus.map((_, index) => itemRefs.current[index]?.offsetWidth ?? 0)
        if (widths.some((width) => width <= 0)) return
        // Кнопки истории лежат absolute слева от поиска и вылезают в левую колонку, где живёт меню.
        // Они не занимают место в раскладке, поэтому доступную ширину считаем сами: до левого края кнопок.
        let available = host.offsetWidth
        const nav = document.querySelector('.title-file-nav')
        if (nav instanceof HTMLElement && getComputedStyle(nav).visibility !== 'hidden') {
          const room = nav.getBoundingClientRect().left - host.getBoundingClientRect().left - NAV_GAP_PX
          available = Math.max(0, Math.min(available, Math.floor(room)))
        }
        const next = packTitlebarMenuOverflow({
          itemWidths: widths,
          available,
          overflowWidth: OVERFLOW_BTN_PX,
          gap: MENU_GAP_PX
        })
        setShown((current) => (current === next.shown ? current : next.shown))
      } finally {
        calculating.current = false
      }
    }
    update()
    // кнопки истории монтируются позже меню (отдельный портал), поэтому пересчитываем и на следующем кадре
    const frame = requestAnimationFrame(update)
    const observer = new ResizeObserver(update)
    observer.observe(host)
    // позиция кнопок зависит от ширины окна и центральной колонки, а не только от самого host
    const bar = document.querySelector('.cet-titlebar')
    if (bar instanceof HTMLElement) observer.observe(bar)
    const mutations = bar instanceof HTMLElement ? new MutationObserver(update) : null
    if (bar instanceof HTMLElement) mutations?.observe(bar, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      mutations?.disconnect()
    }
  }, [locale])

  return (
    <Menubar className="mte-titlebar-menubar" aria-label={pack.menuApp} value={openMenu} onValueChange={setOpenMenu}>
      {menus.map((menu, index) => {
        const collapsed = index >= shown
        return (
          <MenubarMenu key={menu.id} value={menu.id}>
            <MenubarTrigger
              ref={(node) => {
                itemRefs.current[index] = node
              }}
              data-menu={menu.id}
              aria-hidden={collapsed || undefined}
              tabIndex={collapsed ? -1 : undefined}
              style={{
                visibility: collapsed ? 'hidden' : undefined,
                pointerEvents: collapsed ? 'none' : undefined,
                // Скрытые пункты нужны только для замера ширины. Раньше они лежали в (0,0) меню и, раз они идут
                // в DOM после видимых, их drag-область перекрывала no-drag первых пунктов и сидела поверх меню.
                // Уводим их за верхний край окна: ни на что не влияют, ширина по-прежнему измеряется.
                position: collapsed ? 'absolute' : undefined,
                left: collapsed ? 0 : undefined,
                top: collapsed ? -100 : undefined
              }}
            >
              {menu.label}
            </MenubarTrigger>
            <MenubarContent className="mte-menubar-content" alignOffset={0} sideOffset={4}>
              <MenuItems id={menu.id} {...chrome} />
            </MenubarContent>
          </MenubarMenu>
        )
      })}
      <MenubarMenu value="overflow">
        <MenubarTrigger
          className={hamburger ? 'mte-menu-overflow is-menu' : 'mte-menu-overflow'}
          data-menu="overflow"
          aria-label={hamburger ? pack.menuOverflow : pack.menuMore}
          style={{ display: hasOverflow ? undefined : 'none' }}
        >
          {hamburger ? <MenuIcon /> : <MoreIcon />}
        </MenubarTrigger>
        <MenubarContent className="mte-menubar-content" alignOffset={0} sideOffset={4}>
          {hidden.map((menu) => (
            <MenubarSub key={menu.id}>
              <MenubarSubTrigger>{menu.label}</MenubarSubTrigger>
              <MenubarSubContent className="mte-menubar-content">
                <MenuItems id={menu.id} {...chrome} />
              </MenubarSubContent>
            </MenubarSub>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

function MenuBar(chrome: MenuChrome) {
  const mode = useAppSettings().settings.menuBar
  if (mode === 'bar') return <BarMenu {...chrome} />
  return <IconMenu {...chrome} />
}

function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { pack } = useI18n()
  const label = open ? pack.hideList : pack.showList
  return (
    <Hint label={label}>
      <button type="button" className="icon-btn" aria-label={label} aria-pressed={open} onClick={onToggle}>
        <SidebarIcon off={!open} />
      </button>
    </Hint>
  )
}

function PlayerToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { pack } = useI18n()
  const label = open ? pack.hidePlayer : pack.showPlayer
  return (
    <Hint label={label}>
      <button type="button" className="icon-btn" aria-label={label} aria-pressed={open} onClick={onToggle}>
        <PlayerToggleIcon off={!open} />
      </button>
    </Hint>
  )
}

function FileHistoryNav() {
  const { pack } = useI18n()
  const past = useEditor((state) => state.filePast.length)
  const future = useEditor((state) => state.fileFuture.length)
  const goFileHistory = useEditor((state) => state.goFileHistory)
  return (
    <div className="title-file-nav">
      <Hint label={pack.fileBack}>
        <button type="button" className="icon-btn" aria-label={pack.fileBack} disabled={past === 0} onClick={() => goFileHistory(-1)}>
          <ArrowLeftIcon />
        </button>
      </Hint>
      <Hint label={pack.fileForward}>
        <button type="button" className="icon-btn" aria-label={pack.fileForward} disabled={future === 0} onClick={() => goFileHistory(1)}>
          <ArrowRightIcon />
        </button>
      </Hint>
    </div>
  )
}

function TitleSearch({ onPalette }: { onPalette: () => void }) {
  const { pack } = useI18n()
  const paletteKey = useShortcut('palette')
  return (
    <div className="title-search">
      <button type="button" className="title-search-query" aria-label={pack.searchLong} aria-keyshortcuts={ariaChord(paletteKey) || undefined} onClick={onPalette}>
        <SearchIcon />
        <span>{pack.search}</span>
      </button>
      <span className="title-search-sep" aria-hidden="true" />
      <Hint label={pack.github}>
        <button
          type="button"
          className="title-search-github"
          aria-label={pack.github}
          onClick={() => {
            void window.musicTagEditor?.openRepository()
          }}
        >
          <GithubIcon />
        </button>
      </Hint>
    </div>
  )
}

function isSettingsSection(value: unknown): value is SettingsSection {
  return value === 'language' || value === 'shortcuts' || value === 'operators' || value === 'writing' || value === 'playback' || value === 'system'
}

function SettingsButton() {
  const { pack } = useI18n()
  const settingsKey = useShortcut('settings')
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<SettingsSection>('language')
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shortcutMatches('settings', event)) return
      event.preventDefault()
      setSection('language')
      setOpen((value) => !value)
    }
    const onOpen = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      setSection(isSettingsSection(detail) ? detail : 'language')
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mte-open-settings', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mte-open-settings', onOpen)
    }
  }, [])
  const tip = settingsKey ? `${pack.settings} · ${formatChord(settingsKey)}` : pack.settings
  return (
    <>
      <Hint label={tip}>
        <button
          type="button"
          className="icon-btn"
          aria-label={pack.settings}
          aria-keyshortcuts={ariaChord(settingsKey) || undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setSection('language')
            setOpen(true)
          }}
        >
          <SettingsIcon />
        </button>
      </Hint>
      <SettingsDialog open={open} section={section} onClose={() => setOpen(false)} />
    </>
  )
}

const OVERLAY_FLOOR_PX = 138
const OVERLAY_MAX_PX = 400

type OverlayApi = {
  visible: boolean
  getTitlebarAreaRect: () => { x: number; width: number }
  addEventListener: (type: 'geometrychange', listener: () => void) => void
  removeEventListener: (type: 'geometrychange', listener: () => void) => void
}

// Ширину системных кнопок справа считаем один раз и обновляем только при реальном изменении геометрии окна
// (resize / geometrychange). Раньше CSS брал её из env(titlebar-area-*) на каждом пересчёте стилей, а при
// потере и возврате фокуса Chromium на мгновение отдаёт другие значения, и правая группа
// (sidebar / player / настройки) дёргалась. Явная --mte-overlay-width перекрывает env() в styles.css.
function useStableOverlay(): void {
  useEffect(() => {
    const bar = document.querySelector('.cet-titlebar')
    if (!(bar instanceof HTMLElement)) return
    const overlay = (navigator as Navigator & { windowControlsOverlay?: OverlayApi }).windowControlsOverlay
    const floor = bar.classList.contains('cet-windows') ? OVERLAY_FLOOR_PX : 0
    let last = -1
    let frame = 0
    const apply = (value: number) => {
      if (value === last) return
      last = value
      bar.style.setProperty('--mte-overlay-width', `${value}px`)
    }
    const measure = (force: boolean) => {
      // во время смены фокуса значения ненадёжны: пропускаем, пока окно не в фокусе
      if (!force && !document.hasFocus()) return
      let value = floor
      if (overlay?.visible) {
        const rect = overlay.getTitlebarAreaRect()
        const width = window.innerWidth - rect.x - rect.width
        if (!(rect.width > 0) || width < 0 || width > OVERLAY_MAX_PX) return
        value = Math.max(width, floor)
      }
      apply(Math.round(value))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => measure(false))
    }
    measure(true)
    window.addEventListener('resize', schedule)
    overlay?.addEventListener('geometrychange', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      overlay?.removeEventListener('geometrychange', schedule)
    }
  }, [])
}

// При потере фокуса окна cet-titlebar вешает на заголовок класс .inactive, а Chromium заново считает :focus-visible
// у последней нажатой кнопки: кнопки окна и правая группа мигают. Вид заголовка не должен зависеть от фокуса окна:
// гасим .inactive сразу при появлении (MutationObserver срабатывает до отрисовки кадра) и снимаем фокус с
// кнопки заголовка, когда окно его теряет.
function useCalmTitlebar(): void {
  useEffect(() => {
    const bar = document.querySelector('.cet-titlebar')
    if (!(bar instanceof HTMLElement)) return
    const calm = () => {
      if (bar.classList.contains('inactive')) bar.classList.remove('inactive')
    }
    calm()
    const observer = new MutationObserver(calm)
    observer.observe(bar, { attributes: true, attributeFilter: ['class'] })
    const onBlur = () => {
      const active = document.activeElement
      if (active instanceof HTMLElement && bar.contains(active)) active.blur()
    }
    window.addEventListener('blur', onBlur)
    return () => {
      observer.disconnect()
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}

export function TitleBar({
  onPalette,
  sidebarOpen,
  onToggleSidebar,
  playerOpen,
  onTogglePlayer
}: {
  onPalette: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  playerOpen: boolean
  onTogglePlayer: () => void
}) {
  useStableOverlay()
  useCalmTitlebar()
  return (
    <>
      {/* macOS: меню нативное (main/buildMenu), в окне его нет */}
      {isMac ? null : (
        <TitlebarHost id="mte-titlebar-menu-host" placement="after-icon">
          <MenuBar onPalette={onPalette} sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} playerOpen={playerOpen} onTogglePlayer={onTogglePlayer} />
        </TitlebarHost>
      )}
      <TitlebarHost id="mte-titlebar-search-host" placement="center">
        <div className="title-search-anchor">
          <FileHistoryNav />
          <TitleSearch onPalette={onPalette} />
        </div>
      </TitlebarHost>
      <TitlebarHost id="mte-titlebar-settings-host" placement="before-controls">
        <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} />
        <PlayerToggle open={playerOpen} onToggle={onTogglePlayer} />
        <SettingsButton />
      </TitlebarHost>
    </>
  )
}