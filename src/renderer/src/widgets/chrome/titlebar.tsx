import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Menubar,
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
import { Hint } from '@/components/ui/tooltip'
import { CheckIcon, FilePlusIcon, FolderIcon, GithubIcon, MenuIcon, MoreIcon, PlayerToggleIcon, SearchIcon, SettingsIcon, SidebarIcon, TrashIcon } from '@/shared/ui/icons'
import { TITLEBAR_CENTER_ID, TITLEBAR_LEFT_ID, TITLEBAR_RIGHT_ID, ensureTitlebarRegions } from '@shared/titlebar'
import { packTitlebarMenuOverflow } from '@/widgets/chrome/menu-overflow'
import { useAppSettings } from '@/features/settings/app-settings'
import { shortcutMatches, useShortcut } from '@/features/settings/prefs'
import { SettingsDialog } from '@/widgets/settings/SettingsDialog'
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

function MenuKey({ id }: { id: 'open' | 'folder' | 'save' | 'undo' | 'redo' | 'palette' }) {
  const chord = useShortcut(id)
  if (!chord) return null
  return <MenubarShortcut>{chord}</MenubarShortcut>
}

function MenuItems({ id, onPalette }: { id: TitlebarMenuId; onPalette: () => void }) {
  const { pack } = useI18n()
  const openDialog = useEditor((state) => state.openDialog)
  const openFolder = useEditor((state) => state.openFolder)
  const saveAll = useEditor((state) => state.requestSave)
  const clear = useEditor((state) => state.clear)
  const undoOnce = useEditor((state) => state.undoOnce)
  const redoOnce = useEditor((state) => state.redoOnce)
  const requestReset = useEditor((state) => state.requestReset)
  const selectDelta = useEditor((state) => state.selectDelta)

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
        <MenubarItem onSelect={() => saveAll()}>
          <CheckIcon />
          {pack.writeTags}
          <MenuKey id="save" />
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onSelect={clear}>
          <TrashIcon />
          {pack.clearList}
        </MenubarItem>
      </>
    )
  }
  if (id === 'edit') {
    return (
      <>
        <MenubarItem onSelect={undoOnce}>
          {pack.undo}
          <MenuKey id="undo" />
        </MenubarItem>
        <MenubarItem onSelect={redoOnce}>
          {pack.redo}
          <MenuKey id="redo" />
        </MenubarItem>
        <MenubarItem onSelect={requestReset}>{pack.undoAll}</MenubarItem>
      </>
    )
  }
  if (id === 'view') {
    return (
      <MenubarItem onSelect={onPalette}>
        <SearchIcon />
        {pack.searchCommands}
        <MenuKey id="palette" />
      </MenubarItem>
    )
  }
  if (id === 'window') {
    return (
      <>
        <MenubarItem onSelect={() => selectDelta(-1)}>
          {pack.prevFile}
          <MenubarShortcut>↑</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onSelect={() => selectDelta(1)}>
          {pack.nextFile}
          <MenubarShortcut>↓</MenubarShortcut>
        </MenubarItem>
      </>
    )
  }
  return <p className="menu-note">{pack.settingsNote}</p>
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

function IconMenu({ onPalette }: { onPalette: () => void }) {
  const { pack, menus } = useTitlebarMenus()
  const [openMenu, setOpenMenu] = useState('')
  return (
    <Menubar className="mte-titlebar-menubar is-icon" aria-label={pack.menuApp} value={openMenu} onValueChange={setOpenMenu}>
      <MenubarMenu value="overflow">
        <MenubarTrigger className="mte-menu-overflow" data-menu="overflow" aria-label={pack.menuOverflow}>
          <MenuIcon />
        </MenubarTrigger>
        <MenubarContent className="mte-menubar-content" alignOffset={0} sideOffset={4}>
          {menus.map((menu) => (
            <MenubarSub key={menu.id}>
              <MenubarSubTrigger>{menu.label}</MenubarSubTrigger>
              <MenubarSubContent className="mte-menubar-content">
                <MenuItems id={menu.id} onPalette={onPalette} />
              </MenubarSubContent>
            </MenubarSub>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

function BarMenu({ onPalette }: { onPalette: () => void }) {
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
        const next = packTitlebarMenuOverflow({
          itemWidths: widths,
          available: host.offsetWidth,
          overflowWidth: OVERFLOW_BTN_PX,
          gap: MENU_GAP_PX
        })
        setShown((current) => (current === next.shown ? current : next.shown))
      } finally {
        calculating.current = false
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
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
                position: collapsed ? 'absolute' : undefined,
                left: collapsed ? 0 : undefined,
                top: collapsed ? 0 : undefined
              }}
            >
              {menu.label}
            </MenubarTrigger>
            <MenubarContent className="mte-menubar-content" alignOffset={0} sideOffset={4}>
              <MenuItems id={menu.id} onPalette={onPalette} />
            </MenubarContent>
          </MenubarMenu>
        )
      })}
      <MenubarMenu value="overflow">
        <MenubarTrigger
          className="mte-menu-overflow"
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
                <MenuItems id={menu.id} onPalette={onPalette} />
              </MenubarSubContent>
            </MenubarSub>
          ))}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

function MenuBar({ onPalette }: { onPalette: () => void }) {
  const mode = useAppSettings().settings.menuBar
  if (mode === 'bar') return <BarMenu onPalette={onPalette} />
  return <IconMenu onPalette={onPalette} />
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

function TitleSearch({ onPalette }: { onPalette: () => void }) {
  const { pack } = useI18n()
  return (
    <div className="title-search">
      <button type="button" className="title-search-query" aria-label={pack.searchLong} aria-keyshortcuts="Control+K" onClick={onPalette}>
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

function SettingsButton() {
  const { pack } = useI18n()
  const settingsKey = useShortcut('settings')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shortcutMatches('settings', event)) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const tip = settingsKey ? `${pack.settings} · ${settingsKey}` : pack.settings
  return (
    <>
      <Hint label={tip}>
        <button
          type="button"
          className="icon-btn"
          aria-label={pack.settings}
          aria-keyshortcuts={settingsKey.replaceAll('Ctrl', 'Control') || undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <SettingsIcon />
        </button>
      </Hint>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
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
  return (
    <>
      <TitlebarHost id="mte-titlebar-menu-host" placement="after-icon">
        <MenuBar onPalette={onPalette} />
      </TitlebarHost>
      <TitlebarHost id="mte-titlebar-search-host" placement="center">
        <TitleSearch onPalette={onPalette} />
      </TitlebarHost>
      <TitlebarHost id="mte-titlebar-settings-host" placement="before-controls">
        <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} />
        <PlayerToggle open={playerOpen} onToggle={onTogglePlayer} />
        <SettingsButton />
      </TitlebarHost>
    </>
  )
}
