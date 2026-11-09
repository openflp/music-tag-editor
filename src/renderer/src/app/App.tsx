import { useEffect, useState } from 'react'
import { commentFromFile, coverFromFile, takeDrop, type DropMode } from '@/features/editor/lib/drop'
import { useEditorBindings } from '@/features/editor/lib/use-bindings'
import { useEditor } from '@/features/editor/model/store'
import { MetadataForm } from '@/widgets/metadata-form/MetadataForm'
import { Player } from '@/widgets/player/Player'
import { TrackHeader, SaveDialogs } from '@/widgets/save-bar/SaveBar'
import { Toast } from '@/widgets/toast/Toast'
import { TrackSidebar } from '@/widgets/track-sidebar/TrackSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommandPalette, DragOverlay, EmptyStage, SidebarResizer, TitleBar } from '@/widgets/chrome/Chrome'
import { EditMenu } from '@/widgets/chrome/edit-menu'
import { readPlayerOpen, readSidebarOpen, writePlayerOpen, writeSidebarOpen } from '@/widgets/chrome/sidebar-layout'
import { loadAppSettings } from '@/features/settings/app-settings'
import { shortcutMatches, syncShortcuts } from '@/features/settings/prefs'
import { syncLocale } from '@/shared/i18n'

export function App() {
  useEditorBindings()
  const loading = useEditor((state) => state.loading)
  const hasTracks = useEditor((state) => state.tracks.length > 0)
  const openDialog = useEditor((state) => state.openDialog)
  const openFolder = useEditor((state) => state.openFolder)
  const [dropMode, setDropMode] = useState<DropMode | null>(null)
  const [palette, setPalette] = useState(false)
  const [sidebar, setSidebar] = useState(300)
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen)
  const [playerOpen, setPlayerOpen] = useState(readPlayerOpen)

  useEffect(() => {
    syncLocale()
    syncShortcuts()
    void loadAppSettings()
  }, [])

  useEffect(() => {
    writeSidebarOpen(sidebarOpen)
  }, [sidebarOpen])

  useEffect(() => {
    writePlayerOpen(playerOpen)
  }, [playerOpen])

  const playCommand = useEditor((state) => state.playCommand)
  useEffect(() => {
    if (playCommand?.type === 'play') setPlayerOpen(true)
  }, [playCommand])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutMatches('palette', event)) {
        event.preventDefault()
        setPalette((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const hide = () => setDropMode(null)
    const onStart = (event: DragEvent) => {
      const target = event.target
      const row = target instanceof Element ? target.closest('.track-row') : null
      if (!(row instanceof HTMLElement)) return
      const path = row.dataset.path
      if (!path) return
      event.preventDefault()
      const state = useEditor.getState()
      const group = state.selected.includes(path) ? state.listOrder.filter((item) => state.selected.includes(item)) : []
      window.musicTagEditor?.dragFiles(group.length ? group : [path])
    }
    const onDragOver = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      const types = event.dataTransfer ? Array.from(event.dataTransfer.types) : []
      if (types.length && !types.includes('Files')) return
      setDropMode((prev) => (prev === 'library' ? prev : 'library'))
    }
    const onLeave = (event: DragEvent) => {
      const left = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
      if (left) hide()
    }
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      hide()
      const files = event.dataTransfer?.files
      if (!files?.length) return
      event.stopPropagation()
      const dropped = takeDrop(files)
      const state = useEditor.getState()
      if (dropped.library.length) void state.addPaths(dropped.library)
      const open = state.tracks.some((track) => state.selected.includes(track.path) && !track.error)
      if (dropped.images[0] || dropped.texts[0]) {
        if (!open) state.notify({ kind: 'err', text: 'Сначала выберите трек' })
        else {
          const image = dropped.images[0]
          const text = dropped.texts[0]
          if (image) {
            void coverFromFile(image)
              .then((cover) => useEditor.getState().setCover(cover))
              .catch((error: unknown) => {
                useEditor.getState().notify({ kind: 'err', text: error instanceof Error ? error.message : 'Обложка должна быть изображением' })
              })
          }
          if (text) {
            void commentFromFile(text)
              .then((value) => useEditor.getState().setField('comment', value))
              .catch((error: unknown) => {
                useEditor.getState().notify({ kind: 'err', text: error instanceof Error ? error.message : 'Некорректный текст' })
              })
          }
        }
      }
      if (!dropped.library.length && !dropped.images.length && !dropped.texts.length) {
        if (dropped.missedPath) state.notify({ kind: 'err', text: 'Не удалось получить путь к файлу' })
        else if (dropped.missedKind) state.notify({ kind: 'err', text: 'Формат файла не поддерживается' })
      }
    }
    document.addEventListener('dragstart', onStart, true)
    document.addEventListener('dragend', hide)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragstart', onStart, true)
      document.removeEventListener('dragend', hide)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
    <div className={dropMode ? 'shell over' : 'shell'}>
      <TitleBar
        onPalette={() => setPalette(true)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        playerOpen={playerOpen}
        onTogglePlayer={() => setPlayerOpen((open) => !open)}
      />
      <div className={sidebarOpen ? 'workspace' : 'workspace sidebar-closed'}>
        <TrackSidebar loading={loading} collapsed={!sidebarOpen} />
        <SidebarResizer width={sidebar} onWidth={setSidebar} collapsed={!sidebarOpen} />
        <div className="editor">
          {hasTracks ? (
            <>
              <TrackHeader />
              <MetadataForm />
            </>
          ) : (
            <EmptyStage onOpenFiles={() => void openDialog()} onOpenFolder={() => void openFolder()} />
          )}
          <Player hidden={!playerOpen} />
          <SaveDialogs />
          <Toast />
        </div>
      </div>
      <DragOverlay mode={dropMode} count={0} />
      <EditMenu />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
    </TooltipProvider>
  )
}
