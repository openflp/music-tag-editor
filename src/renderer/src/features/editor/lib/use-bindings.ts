import { useEffect } from 'react'
import type { MenuCommand, ZoomStep } from '@shared/types'
import { ZOOM_STEPS } from '@shared/types'
import { getAppSettings, setAppSetting } from '@/features/settings/app-settings'
import { getPrefs, menuOwnsShortcut, setShowFormatBadges, shortcutMatches, shortcutOf } from '@/features/settings/prefs'
import { getPack } from '@/shared/i18n'
import { compareVersions, hasNewer } from '@shared/update'
import { isMac } from '@/shared/lib/platform'
import { copyTracks } from './copy'
import { useEditor } from '../model/store'

function stepZoom(dir: 1 | -1): void {
  const zoom = getAppSettings().settings.zoom
  const next = ZOOM_STEPS[ZOOM_STEPS.indexOf(zoom) + dir]
  if (next !== undefined) setAppSetting('zoom', next)
}

function runMenuCommand(command: MenuCommand): void {
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
      if (state.loading) state.cancelLoad()
      else if (!state.saving && state.tracks.length > 0) void state.refresh()
      break
    case 'remove':
      state.removeSelected()
      break
    case 'clear':
      if (state.tracks.length > 0 || state.loading) state.requestClear()
      break
    case 'reveal':
      void state.revealCurrent()
      break
    case 'openFile':
      void state.openCurrent()
      break
    case 'formatBadges':
      setShowFormatBadges(!getPrefs().showFormatBadges)
      break
    case 'play': {
      const path =
        state.focus && state.selected.includes(state.focus)
          ? state.focus
          : state.anchor && state.selected.includes(state.anchor)
            ? state.anchor
            : (state.selected[0] ?? null)
      if (path) state.requestPlay(path)
      break
    }
    case 'settings':
      window.dispatchEvent(new CustomEvent('mte-open-settings', { detail: 'language' }))
      break
    case 'palette':
    case 'toggleSidebar':
    case 'togglePlayer':
      window.dispatchEvent(new CustomEvent('mte-command', { detail: command }))
      break
    case 'zoomIn':
      stepZoom(1)
      break
    case 'zoomOut':
      stepZoom(-1)
      break
    case 'zoomReset':
      if (getAppSettings().settings.zoom !== 1) setAppSetting('zoom', 1 satisfies ZoomStep)
      break
    case 'reload':
      void window.musicTagEditor?.reloadWindow()
      break
    case 'quit':
      state.requestClose()
      break
    case 'alwaysOnTop':
      setAppSetting('alwaysOnTop', !getAppSettings().settings.alwaysOnTop)
      break
    case 'helpShortcuts':
      window.dispatchEvent(new CustomEvent('mte-open-settings', { detail: 'shortcuts' }))
      break
    case 'github':
      void window.musicTagEditor?.openRepository()
      break
    case 'report':
      void window.musicTagEditor?.openIssues('')
      break
    default:
      if (command.startsWith('tab:')) window.dispatchEvent(new CustomEvent('mte-sheet-tab', { detail: command.slice(4) }))
  }
}

function appShortcut(event: KeyboardEvent): MenuCommand | null {
  if (!menuOwnsShortcut('openFile') && shortcutMatches('openFile', event)) return 'openFile'
  if (!menuOwnsShortcut('formatBadges') && shortcutMatches('formatBadges', event)) return 'formatBadges'
  if (shortcutMatches('sidebar', event)) return 'toggleSidebar'
  if (shortcutMatches('player', event)) return 'togglePlayer'
  if (shortcutMatches('refresh', event)) return 'refresh'
  if (shortcutMatches('clear', event)) return 'clear'
  if (shortcutMatches('onTop', event)) return 'alwaysOnTop'
  if (shortcutMatches('zoomReset', event)) return 'zoomReset'
  if (shortcutMatches('reload', event)) return 'reload'
  if (shortcutMatches('helpShortcuts', event)) return 'helpShortcuts'
  if (shortcutMatches('github', event)) return 'github'
  if (shortcutMatches('report', event)) return 'report'
  if (shortcutMatches('quit', event)) {
    // На macOS Cmd+Q уже закрывает приложение через меню программы.
    if (isMac && shortcutOf('quit') === 'Ctrl+Q') return null
    return 'quit'
  }
  return null
}

export function useEditorBindings(): void {
  const selectDelta = useEditor((state) => state.selectDelta)

  useEffect(() => {
    const api = window.musicTagEditor
    if (!api) return
    void api.getHistory().then((history) => useEditor.setState({ history })).catch(() => undefined)
    if (getPrefs().checkUpdates) {
      void api.checkUpdates().then((result) => {
        if (!hasNewer(result.current, result.versions)) return
        const newer = result.versions.find((item) => !item.prerelease && compareVersions(item.version, result.current) > 0)
        if (!newer) return
        useEditor.getState().notify({ kind: 'ok', text: `${getPack().settingsUpdateNewer}: ${newer.version}` })
      }).catch(() => undefined)
    }
    const stopProgress = api.onProgress((progress) => useEditor.setState({ progress }))
    const stopClose = api.onCloseQuery(() => useEditor.getState().requestClose())
    const stopMenu = api.onMenu((command) => runMenuCommand(command))
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
      if (!menuOwnsShortcut('folder') && shortcutMatches('folder', event)) {
        event.preventDefault()
        void useEditor.getState().openFolder()
        return
      }
      if (shortcutMatches('zoomIn', event) || shortcutMatches('zoomOut', event)) {
        event.preventDefault()
        stepZoom(shortcutMatches('zoomIn', event) ? 1 : -1)
        return
      }
      const command = appShortcut(event)
      if (command) {
        event.preventDefault()
        if (!event.repeat) runMenuCommand(command)
        return
      }
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable || target.closest('[data-no-track-nav], [role="menu"]')) return
      }
      if (shortcutMatches('play', event)) {
        if (event.repeat || document.querySelector('[role="dialog"][data-state="open"]')) return
        event.preventDefault()
        runMenuCommand('play')
        return
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