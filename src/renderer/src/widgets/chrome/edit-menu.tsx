import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { editHitFrom, type EditActions } from '@/shared/lib/edit-actions'
import { useI18n } from '@/shared/i18n'
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
      <span className="menu-kbd">{shortcut}</span>
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
      place(event.clientX, event.clientY)
      setMenu({ x: event.clientX, y: event.clientY, actions: hit.actions })
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
  return (
    <DropdownMenu open={menu !== null} onOpenChange={(open) => { if (!open) setMenu(null) }}>
      <DropdownMenuTrigger asChild>
        <span className="edit-menu-anchor" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="menu-edit"
        aria-label={pack.edit}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const run = afterClose.current
          afterClose.current = null
          if (run) run()
          else fieldRef.current?.focus({ preventScroll: true })
        }}
      >
        <Item label={pack.undo} shortcut="Ctrl+Z" icon={<UndoIcon />} disabled={!actions?.canUndo} onSelect={() => actions?.undo()} />
        <Item label={pack.redo} shortcut="Ctrl+Y" icon={<RedoIcon />} disabled={!actions?.canRedo} onSelect={() => actions?.redo()} />
        <DropdownMenuSeparator />
        <Item label={pack.cut} shortcut="Ctrl+X" icon={<CutIcon />} disabled={!actions?.canCut} onSelect={() => actions?.cut()} />
        <Item label={pack.clipboardCopy} shortcut="Ctrl+C" icon={<CopyIcon />} disabled={!actions?.canCopy} onSelect={() => actions?.copy()} />
        <Item label={pack.paste} shortcut="Ctrl+V" icon={<PasteIcon />} disabled={!actions?.canPaste} onSelect={() => actions?.paste()} />
        <Item label={pack.remove} shortcut="Del" icon={<TrashIcon />} disabled={!actions?.canRemove} onSelect={() => actions?.remove()} />
        <DropdownMenuSeparator />
        <Item
          label={pack.selectAll}
          shortcut="Ctrl+A"
          icon={<SelectAllIcon />}
          disabled={!actions?.canSelectAll}
          onSelect={() => {
            const selectAll = actions?.selectAll
            afterClose.current = () => selectAll?.()
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
