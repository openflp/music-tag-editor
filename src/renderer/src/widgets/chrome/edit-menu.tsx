import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { editHitFrom, type EditActions } from '@/shared/lib/edit-actions'
import { useI18n } from '@/shared/i18n'
import { formatChord, shortcutOf } from '@/features/settings/prefs'
import { isMac } from '@/shared/lib/platform'
import { CopyIcon, CutIcon, PasteIcon, RedoIcon, SelectAllIcon, TrashIcon, UndoIcon } from '@/shared/ui/icons'

type MenuState = { x: number; y: number; actions: EditActions }

function Item({
  label,
  shortcut,
  icon,
  disabled,
  onSelect
}: {
  label: string
  shortcut: string
  icon: ReactNode
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem disabled={disabled} onSelect={onSelect}>
      {icon}
      {label}
      <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
    </DropdownMenuItem>
  )
}

export function EditMenu() {
  const { pack } = useI18n()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const fieldRef = useRef<HTMLElement | null>(null)
  const afterClose = useRef<(() => void) | null>(null)
  const place = (x: number, y: number) => {
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    const left = Math.max(8, Math.min(x, window.innerWidth - 8))
    const top = Math.max(8, Math.min(y, window.innerHeight - 8))
    sheetRef.current.replaceSync(`.edit-menu-anchor{left:${left}px;top:${top}px}`)
  }

  useEffect(() => {
    const onMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      const hit = editHitFrom(event.target)
      if (!hit) return
      event.preventDefault()
      fieldRef.current = hit.field
      afterClose.current = null
      let { clientX: x, clientY: y } = event
      if (x === 0 && y === 0) {
        // Menu key / Shift+F10: no pointer position, anchor to the field instead.
        const rect = hit.field.getBoundingClientRect()
        x = rect.left + 8
        y = rect.bottom
      }
      place(x, y)
      setMenu({ x, y, actions: hit.actions })
    }
    window.addEventListener('contextmenu', onMenu, true)
    return () => window.removeEventListener('contextmenu', onMenu, true)
  }, [])

  useEffect(() => {
    return () => {
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  const actions = menu?.actions
  // Every action runs after the menu has closed and the field has its focus back:
  // clipboard / undo commands act on the focused element, which is the menu item while it is open.
  const later = (run?: () => void) => () => {
    afterClose.current = run ?? null
  }
  return (
    <DropdownMenu open={menu !== null} onOpenChange={(open) => { if (!open) setMenu(null) }}>
      <DropdownMenuTrigger asChild>
        <span className="edit-menu-anchor" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={0}
        className="menu-edit"
        aria-label={pack.edit}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const run = afterClose.current
          afterClose.current = null
          fieldRef.current?.focus({ preventScroll: true })
          run?.()
        }}
      >
        <Item label={pack.undo} shortcut={formatChord(shortcutOf('undo'))} icon={<UndoIcon />} disabled={!actions?.canUndo} onSelect={later(actions ? () => actions.undo() : undefined)} />
        <Item label={pack.redo} shortcut={formatChord(shortcutOf('redo'))} icon={<RedoIcon />} disabled={!actions?.canRedo} onSelect={later(actions ? () => actions.redo() : undefined)} />
        <DropdownMenuSeparator />
        <Item label={pack.cut} shortcut={formatChord('Ctrl+X')} icon={<CutIcon />} disabled={!actions?.canCut} onSelect={later(actions ? () => actions.cut() : undefined)} />
        <Item label={pack.clipboardCopy} shortcut={formatChord('Ctrl+C')} icon={<CopyIcon />} disabled={!actions?.canCopy} onSelect={later(actions ? () => actions.copy() : undefined)} />
        <Item label={pack.paste} shortcut={formatChord('Ctrl+V')} icon={<PasteIcon />} disabled={!actions?.canPaste} onSelect={later(actions ? () => actions.paste() : undefined)} />
        <Item label={pack.remove} shortcut={isMac ? '⌦' : 'Del'} icon={<TrashIcon />} disabled={!actions?.canRemove} onSelect={later(actions ? () => actions.remove() : undefined)} />
        <DropdownMenuSeparator />
        <Item
          label={pack.selectAll}
          shortcut={formatChord('Ctrl+A')}
          icon={<SelectAllIcon />}
          disabled={!actions?.canSelectAll}
          onSelect={later(actions ? () => actions.selectAll() : undefined)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}