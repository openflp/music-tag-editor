export type EditActions = {
  undo: () => void
  redo: () => void
  cut: () => void
  copy: () => void
  paste: () => void
  remove: () => void
  selectAll: () => void
  canUndo: boolean
  canRedo: boolean
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  canRemove: boolean
  canSelectAll: boolean
}

const hosts = new WeakMap<HTMLElement, () => EditActions>()
const TEXT = new Set(['text', 'search', 'url', 'tel', 'password', 'email', 'number'])

export function registerEditHost(el: HTMLElement, get: () => EditActions): () => void {
  hosts.set(el, get)
  return () => {
    hosts.delete(el)
  }
}

function command(name: string, value?: string): void {
  document.execCommand(name, false, value)
}

function inputActions(el: HTMLInputElement | HTMLTextAreaElement): EditActions {
  const readOnly = el.readOnly
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const direction = el.selectionDirection ?? 'none'
  const picked = end > start
  const focus = () => {
    el.focus()
    el.setSelectionRange(start, end, direction)
  }
  return {
    canUndo: !readOnly,
    canRedo: !readOnly,
    canCut: picked && !readOnly,
    canCopy: picked,
    canPaste: !readOnly,
    canRemove: picked && !readOnly,
    canSelectAll: el.value.length > 0,
    undo: () => {
      focus()
      command('undo')
    },
    redo: () => {
      focus()
      command('redo')
    },
    cut: () => {
      focus()
      command('cut')
    },
    copy: () => {
      focus()
      command('copy')
    },
    paste: () => {
      focus()
      void navigator.clipboard.readText().then((text) => {
        focus()
        if (text) command('insertText', text)
      }).catch(() => {
        focus()
        command('paste')
      })
    },
    remove: () => {
      focus()
      command('delete')
    },
    selectAll: () => {
      const apply = () => {
        el.focus({ preventScroll: true })
        const end = el.value.length
        try {
          el.setSelectionRange(0, end)
        } catch {
          el.select()
        }
      }
      apply()
      requestAnimationFrame(apply)
    }
  }
}

function richActions(el: HTMLElement): EditActions {
  const selection = window.getSelection()
  const picked = Boolean(selection && !selection.isCollapsed && el.contains(selection.anchorNode))
  const focus = () => el.focus()
  return {
    canUndo: true,
    canRedo: true,
    canCut: picked,
    canCopy: picked,
    canPaste: true,
    canRemove: picked,
    canSelectAll: (el.textContent ?? '').length > 0,
    undo: () => {
      focus()
      command('undo')
    },
    redo: () => {
      focus()
      command('redo')
    },
    cut: () => {
      focus()
      command('cut')
    },
    copy: () => {
      focus()
      command('copy')
    },
    paste: () => {
      focus()
      command('paste')
    },
    remove: () => {
      focus()
      command('delete')
    },
    selectAll: () => {
      const apply = () => {
        focus()
        command('selectAll')
      }
      apply()
      requestAnimationFrame(apply)
    }
  }
}

export type EditHit = { actions: EditActions; field: HTMLElement }

export function editHitFrom(target: EventTarget | null): EditHit | null {
  let field: HTMLInputElement | HTMLTextAreaElement | null = null
  let rich: HTMLElement | null = null
  let node: Node | null = target instanceof Node ? target : null
  while (node) {
    if (node instanceof HTMLElement) {
      const host = hosts.get(node)
      if (host) return { actions: host(), field: node }
      if (!field && (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement)) {
        const type = node instanceof HTMLInputElement ? (node.type || 'text').toLowerCase() : 'text'
        if (node instanceof HTMLTextAreaElement || TEXT.has(type)) field = node
      }
      if (!rich && node.isContentEditable && node.getAttribute('contenteditable') !== 'false') rich = node
    }
    node = node.parentNode
  }
  if (field) return field.disabled ? null : { actions: inputActions(field), field }
  if (rich) return { actions: richActions(rich), field: rich }
  return null
}
