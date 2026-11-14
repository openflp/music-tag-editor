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
import {
  readPlayerOpen,
  readSidebarOpen,
  readSidebarWidth,
  writePlayerOpen,
  writeSidebarOpen,
  writeSidebarWidth
} from '@/widgets/chrome/sidebar-layout'
import { loadAppSettings } from '@/features/settings/app-settings'
import { shortcutMatches, syncShortcuts } from '@/features/settings/prefs'
import { syncLocale } from '@/shared/i18n'

// TODO: move to the i18n packs (needs keys in @/shared/i18n)
const MSG = {
  pickTrack: 'Сначала выберите трек',
  badCover: 'Обложка должна быть изображением',
  badText: 'Некорректный текст',
  noPath: 'Не удалось получить путь к файлу',
  badFormat: 'Формат файла не поддерживается'
} as const

function dropInfo(data: DataTransfer | null): { files: boolean; mode: DropMode; count: number } {
  if (!data) return { files: false, mode: 'library', count: 0 }
  const types = Array.from(data.types)
  const files = !types.length || types.includes('Files')
  const items = Array.from(data.items ?? []).filter((item) => item.kind === 'file')
  const mime = items.map((item) => item.type)
  let mode: DropMode = 'library'
  if (mime.length && mime.every((type) => type.startsWith('image/'))) mode = 'cover'
  else if (mime.length && mime.every((type) => type === 'text/plain')) mode = 'comment'
  return { files, mode, count: items.length }
}

export function App() {
  useEditorBindings()
  const loading = useEditor((state) => state.loading)
  const hasTracks = useEditor((state) => state.tracks.length > 0)
  const openDialog = useEditor((state) => state.openDialog)
  const openFolder = useEditor((state) => state.openFolder)
  const [dropMode, setDropMode] = useState<DropMode | null>(null)
  const [dropCount, setDropCount] = useState(0)
  const [palette, setPalette] = useState(false)
  const [sidebar, setSidebar] = useState(readSidebarWidth)
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

  useEffect(() => {
    writeSidebarWidth(sidebar)
  }, [sidebar])

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
    const hide = () => {
      setDropMode(null)
      setDropCount(0)
    }
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
      const info = dropInfo(event.dataTransfer)
      // Not a file drag (text into an input, Monaco selection...): leave it to the browser.
      if (!info.files) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDropMode((prev) => (prev === info.mode ? prev : info.mode))
      setDropCount((prev) => (prev === info.count ? prev : info.count))
    }
    const onLeave = (event: DragEvent) => {
      const left = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
      if (left) hide()
    }
    const onDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files
      if (!files?.length) {
        hide()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      hide()
      void handleDrop(files)
    }
    const handleDrop = async (files: FileList) => {
      const dropped = takeDrop(files)
      const notify = (text: string) => useEditor.getState().notify({ kind: 'err', text })
      const hasOpenTrack = () => {
        const state = useEditor.getState()
        return state.tracks.some((track) => state.selected.includes(track.path) && !track.error)
      }
      // Library first, so a cover/comment dropped together with tracks lands on the freshly added selection.
      if (dropped.library.length) await useEditor.getState().addPaths(dropped.library)
      const image = dropped.images[0]
      const text = dropped.texts[0]
      if (image || text) {
        if (!hasOpenTrack()) notify(MSG.pickTrack)
        else {
          if (image) {
            try {
              useEditor.getState().setCover(await coverFromFile(image))
            } catch (error: unknown) {
              notify(error instanceof Error ? error.message : MSG.badCover)
            }
          }
          if (text) {
            try {
              useEditor.getState().setField('comment', await commentFromFile(text))
            } catch (error: unknown) {
              notify(error instanceof Error ? error.message : MSG.badText)
            }
          }
        }
      }
      if (!dropped.library.length && !dropped.images.length && !dropped.texts.length) {
        if (dropped.missedPath) notify(MSG.noPath)
        else if (dropped.missedKind) notify(MSG.badFormat)
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
        <DragOverlay mode={dropMode} count={dropCount} />
        <EditMenu />
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
      </div>
    </TooltipProvider>
  )
}