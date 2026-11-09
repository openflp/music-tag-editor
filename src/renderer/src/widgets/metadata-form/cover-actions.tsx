import { useMemo } from 'react'
import { coverSame, uniformField } from '@shared/plan'
import type { CoverArt } from '@shared/types'
import { useEditor } from '@/features/editor/model/store'

function coverMark(cover: CoverArt | null): string {
  if (!cover) return ''
  const data = cover.dataBase64
  return `${cover.mime}:${data.length}:${data.slice(0, 24)}:${data.slice(-24)}`
}

export function useCoverActions() {
  const stamp = useEditor((state) => {
    const ids = new Set(state.selected)
    const marks: string[] = []
    let editable = 0
    for (const track of state.tracks) {
      if (!ids.has(track.path) || track.error) continue
      editable += 1
      marks.push(coverMark(track.draftCover))
    }
    return `${state.applyCover ? 1 : 0}\n${coverMark(state.sharedCover)}\n${state.saving ? 1 : 0}\n${editable}\n${marks.join('|')}`
  })

  const view = useMemo(() => {
    const state = useEditor.getState()
    const ids = new Set(state.selected)
    const editable = state.tracks.filter((track) => ids.has(track.path) && !track.error)
    const coverView = state.applyCover
      ? { mixed: false, value: state.sharedCover }
      : uniformField(
          editable.map((track) => track.draftCover),
          coverSame
        )
    const cover = coverView.mixed ? null : coverView.value
    return {
      disabled: state.saving || editable.length === 0,
      mixed: coverView.mixed,
      cover,
      canDownload: Boolean(cover),
      canRemove: coverView.mixed || Boolean(cover),
      applyCover: state.applyCover
    }
  }, [stamp])

  const setCover = useEditor((state) => state.setCover)
  const setApplyCover = useEditor((state) => state.setApplyCover)
  const disabled = view.disabled
  const cover = view.cover

  const replace = async () => {
    try {
      const next = await window.musicTagEditor?.openCover()
      if (next) setCover(next)
    } catch (error) {
      useEditor.getState().notify({ kind: 'err', text: error instanceof Error ? error.message : 'Не удалось открыть обложку' })
    }
  }

  const download = async (target: CoverArt) => {
    try {
      const saved = await window.musicTagEditor?.saveCover(target)
      if (saved) useEditor.getState().notify({ kind: 'ok', text: 'Обложка сохранена' })
    } catch (error) {
      useEditor.getState().notify({ kind: 'err', text: error instanceof Error ? error.message : 'Не удалось сохранить обложку' })
    }
  }

  return {
    disabled,
    mixed: view.mixed,
    cover,
    canDownload: view.canDownload,
    canRemove: view.canRemove,
    applyCover: view.applyCover,
    setApplyCover,
    replace,
    download,
    remove: () => setCover(null)
  }
}
