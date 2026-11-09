import { useEditor } from '@/features/editor/model/store'

let busy = false

export function pathsToCopy(anchor?: string): string[] {
  const state = useEditor.getState()
  const group = Boolean(anchor && state.selected.includes(anchor) && state.selected.length > 1)
  const wanted = anchor && !group ? [anchor] : state.selected
  const wantedSet = new Set(wanted)
  const order = state.listOrder.length ? state.listOrder : state.tracks.map((track) => track.path)
  const ranked = order.filter((path) => wantedSet.has(path))
  const rest = wanted.filter((path) => !ranked.includes(path))
  return [...ranked, ...rest]
}

export async function copyTracks(kind: 'files' | 'paths', anchor?: string): Promise<void> {
  const api = window.musicTagEditor
  const paths = pathsToCopy(anchor)
  if (!paths.length || !api || busy) return
  busy = true
  const notify = useEditor.getState().notify
  try {
    if (kind === 'files') await api.copyFiles(paths)
    else await api.copyText(paths.join('\n'))
    const text = kind === 'files'
      ? paths.length > 1 ? 'Файлы скопированы' : 'Файл скопирован'
      : paths.length > 1 ? 'Пути скопированы' : 'Путь скопирован'
    notify({ kind: 'ok', text })
  } catch {
    notify({ kind: 'err', text: kind === 'files' ? 'Не удалось скопировать файл' : paths.length > 1 ? 'Не удалось скопировать пути' : 'Не удалось скопировать путь' })
  } finally {
    busy = false
  }
}

export async function copyPlain(text: string, ok: string, fail: string): Promise<void> {
  const api = window.musicTagEditor
  if (!text || !api || busy) return
  busy = true
  const notify = useEditor.getState().notify
  try {
    await api.copyText(text)
    notify({ kind: 'ok', text: ok })
  } catch {
    notify({ kind: 'err', text: fail })
  } finally {
    busy = false
  }
}
