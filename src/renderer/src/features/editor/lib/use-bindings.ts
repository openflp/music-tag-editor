import { useEffect } from 'react'
import { shortcutMatches } from '@/features/settings/prefs'
import { copyTracks } from './copy'
import { useEditor } from '../model/store'

export function useEditorBindings(): void {
  const selectDelta = useEditor((state) => state.selectDelta)

  useEffect(() => {
    const api = window.musicTagEditor
    if (!api) return
    void api.getHistory().then((history) => useEditor.setState({ history })).catch(() => undefined)
    const stopProgress = api.onProgress((progress) => useEditor.setState({ progress }))
    const stopClose = api.onCloseQuery(() => useEditor.getState().requestClose())
    const stopMenu = api.onMenu((command) => {
      const state = useEditor.getState()
      switch (command) {
        case 'open':
          void state.openDialog()
          break
        case 'folder':
          void state.openFolder()
          break
        case 'save':
          state.requestSave()
          break
        case 'undo':
          state.undoOnce()
          break
        case 'redo':
          state.redoOnce()
          break
        case 'prev':
          state.selectDelta(-1)
          break
        case 'next':
          state.selectDelta(1)
          break
        case 'refresh':
          void state.refresh()
          break
        case 'remove':
          state.removeSelected()
          break
        case 'clear':
          state.requestClear()
          break
        case 'reveal':
          void state.revealCurrent()
          break
        case 'openFile':
          void state.openCurrent()
          break
        case 'settings':
          window.dispatchEvent(new CustomEvent('mte-open-settings', { detail: 'language' }))
          break
        case 'palette':
        case 'toggleSidebar':
        case 'togglePlayer':
          window.dispatchEvent(new CustomEvent('mte-command', { detail: command }))
          break
        default:
          if (command.startsWith('tab:')) window.dispatchEvent(new CustomEvent('mte-sheet-tab', { detail: command.slice(4) }))
      }
    })
    return () => {
      stopProgress()
      stopClose()
      stopMenu()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutMatches('redoAlt', event)) {
        event.preventDefault()
        useEditor.getState().redoOnce()
        return
      }
      if (shortcutMatches('folder', event)) {
        event.preventDefault()
        void useEditor.getState().openFolder()
        return
      }
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable || target.closest('[data-no-track-nav], [role="menu"]')) return
      }
      if (shortcutMatches('copyFiles', event)) {
        if (!(target instanceof HTMLElement) || !target.closest('.sidebar')) return
        event.preventDefault()
        void copyTracks('files')
        return
      }
      if (shortcutMatches('selectAll', event)) {
        // есть выделенный мышью текст в «Информации»: Ctrl+A выделяет весь текст таблицы, а не все треки
        const selection = window.getSelection()
        const table = selection && !selection.isCollapsed ? selection.anchorNode?.parentElement?.closest('.info-pane .prop-table') : null
        if (selection && table) {
          event.preventDefault()
          selection.selectAllChildren(table)
          return
        }
        event.preventDefault()
        useEditor.getState().selectAll()
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        useEditor.getState().selectEdge(event.key === 'Home' ? 'start' : 'end', event.shiftKey)
        return
      }
      if (event.key === 'Escape' && useEditor.getState().selected.length > 1) {
        const state = useEditor.getState()
        const path = state.focus ?? state.anchor ?? state.selected[0]
        if (path) state.select(path, 'single')
        return
      }
      if (shortcutMatches('remove', event)) {
        event.preventDefault()
        useEditor.getState().removeSelected()
        return
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      event.preventDefault()
      selectDelta(event.key === 'ArrowUp' ? -1 : 1, event.shiftKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectDelta])
}