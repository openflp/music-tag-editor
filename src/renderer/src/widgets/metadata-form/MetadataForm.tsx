import { useEffect, useMemo, useRef, useState } from 'react'
import { shortcutMatches, type ShortcutId } from '@/features/settings/prefs'
import { coverSrc } from '@/entities/track/lib'
import { selectionTracks, useEditor, type TrackVm } from '@/features/editor/model/store'
import { APPLY_FIELDS, HISTORY_FIELDS, type HistoryField, type TagField } from '@shared/types'
import { NAME_TOKENS } from '@shared/filename'
import { sameValue, uniformField } from '@shared/plan'
import { HoverCard } from 'radix-ui'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { SheetTabs } from './sheet-tabs'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Hint } from '@/components/ui/tooltip'
import { CloseIcon, CoverIcon, DownloadIcon, EyeIcon, FolderIcon, HelpIcon, ImageIcon, TrashIcon } from '@/shared/ui/icons'
import { FadeText } from '@/shared/ui/fade-text'
import { useCoverActions } from './cover-actions'
import { CompositeField, FieldGroup, IndexRow, NumberField } from './fields'
import { CommentEditor } from './comment-editor'
import { InfoPane } from './info-pane'
import { getLocale, tr, useI18n } from '@/shared/i18n'
import type { Pack } from '@shared/i18n'

const SHEET_TABS = ['main', 'note', 'lyrics', 'detail', 'file'] as const
type SheetTab = (typeof SHEET_TABS)[number]

const TAB_SHORTCUT: Record<SheetTab, ShortcutId> = {
  main: 'tabMain',
  note: 'tabNote',
  lyrics: 'tabLyrics',
  detail: 'tabInfo',
  file: 'tabFile'
}

const TOKEN_KEY: Record<string, keyof Pack> = {
  '%artist%': 'fieldArtist',
  '%title%': 'fieldTitle',
  '%album%': 'fieldAlbum',
  '%albumartist%': 'fieldAlbumArtist',
  '%year%': 'fieldYear',
  '%track%': 'fieldNumber',
  '%disc%': 'fieldDiscShort',
  '%genre%': 'fieldGenre',
  '%filename%': 'tokenFile',
  '%n%': 'fieldNumber'
}

function tokenLabel(pack: Pack, token: string): string {
  const key = TOKEN_KEY[token]
  const value = key ? pack[key] : token
  return typeof value === 'string' ? value : token
}

function TrackCover() {
  const { pack } = useI18n()
  const { cover, disabled, canRemove, replace, remove, download } = useCoverActions()
  const [view, setView] = useState(false)
  return (
    <div className="cover-slot">
      <div
        className="track-cover cover-frame"
        onMouseLeave={(event) => {
          const active = document.activeElement
          if (active instanceof HTMLElement && event.currentTarget.contains(active)) active.blur()
        }}
      >
        {cover ? <img alt="" src={coverSrc(cover.mime, cover.dataBase64)} /> : <CoverIcon />}
        <div className="cover-veil" />
        <div className="cover-split">
          <button type="button" aria-label={pack.replaceCover} disabled={disabled} onClick={() => void replace()}>
            <ImageIcon />
          </button>
          <button type="button" aria-label={pack.removeCover} disabled={disabled || !canRemove} onClick={remove}>
            <TrashIcon />
          </button>
          <button type="button" aria-label={pack.viewCover} disabled={!cover} onClick={() => setView(true)}>
            <EyeIcon />
          </button>
          <button
            type="button"
            aria-label={pack.saveCover}
            disabled={disabled || !cover}
            onClick={() => {
              if (cover) void download(cover)
            }}
          >
            <DownloadIcon />
          </button>
        </div>
      </div>
      <Dialog open={view} onOpenChange={setView}>
        <DialogContent className="cover-dialog" data-no-track-nav="">
          <DialogTitle className="sr-only">{pack.cover}</DialogTitle>
          <DialogDescription className="sr-only">{pack.viewCover}</DialogDescription>
          {cover ? (
            <div className="cover-preview">
              <img alt="" src={coverSrc(cover.mime, cover.dataBase64)} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function MetadataForm() {
  const { pack } = useI18n()
  const picked = useEditor(selectionTracks)
  const applyAll = useEditor((state) => state.applyAll)
  const applyValues = useEditor((state) => state.applyValues)
  const history = useEditor((state) => state.history)
  const saving = useEditor((state) => state.saving)
  const setField = useEditor((state) => state.setField)
  const applyCover = useEditor((state) => state.applyCover)
  const fileMask = useEditor((state) => state.fileMask)
  const fileDir = useEditor((state) => state.fileDir)
  const fileAll = useEditor((state) => state.fileAll)
  const setFileMask = useEditor((state) => state.setFileMask)
  const setFileDir = useEditor((state) => state.setFileDir)
  const setApplyScope = useEditor((state) => state.setApplyScope)
  const pickFileDir = useEditor((state) => state.pickFileDir)
  const maskRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<SheetTab>('main')
  const everywhere = fileAll && applyCover && APPLY_FIELDS.every((field) => applyAll[field])

  useEffect(() => {
    const onSheet = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null
      if (detail === 'main' || detail === 'note' || detail === 'lyrics' || detail === 'detail' || detail === 'file') setTab(detail)
    }
    window.addEventListener('mte-sheet-tab', onSheet)
    return () => window.removeEventListener('mte-sheet-tab', onSheet)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const jump = SHEET_TABS.find((id) => shortcutMatches(TAB_SHORTCUT[id], event))
      if (jump) {
        event.preventDefault()
        event.stopPropagation()
        setTab(jump)
        return
      }
      const next = shortcutMatches('nextTab', event)
      const prev = shortcutMatches('prevTab', event)
      if (!next && !prev) return
      event.preventDefault()
      event.stopPropagation()
      setTab((current) => {
        const index = SHEET_TABS.indexOf(current)
        const dir = prev ? -1 : 1
        return SHEET_TABS[(index + dir + SHEET_TABS.length) % SHEET_TABS.length]
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // стабильная ссылка: InfoPane мемоизируется по ней
  const editable = useMemo(() => picked.filter((track) => !track.error), [picked])
  const disabled = saving || editable.length === 0

  const textField = (field: TagField) => {
    const apply = (APPLY_FIELDS as readonly string[]).includes(field)
      ? applyAll[field as (typeof APPLY_FIELDS)[number]]
      : false
    if (apply) return { mixed: false, value: String(applyValues[field] ?? '') }
    const view = uniformField(
      editable.map((track) => String(track.draft[field] ?? '')),
      (left, right) => left === right
    )
    return { mixed: view.mixed, value: view.value ?? '' }
  }

  const numberField = (field: 'year' | 'trackNumber' | 'trackTotal' | 'discNumber' | 'discTotal') => {
    if (field === 'year' && applyAll.year) return { mixed: false, value: applyValues.year }
    const view = uniformField(
      editable.map((track) => track.draft[field]),
      sameValue
    )
    return { mixed: view.mixed, value: view.mixed ? null : view.value }
  }

  // Варианты для выпадающих списков считаются лениво: только для того поля, чей список открыли,
  // и по текущему массиву треков из стора. Раньше useMemo пересчитывал все поля по всем трекам
  // на каждый символ (правка меняет объект трека, и инкрементальный кэш не срабатывал).
  // Подписки на tracks у формы больше нет — она не перерисовывается из-за чужих правок списка.
  const optionCache = useRef(new Map<HistoryField, { tracks: TrackVm[]; list: { value: string; count: number }[] }>())
  const optionGetters = useMemo(() => {
    const getters = {} as Record<HistoryField, () => { value: string; count: number }[]>
    for (const field of HISTORY_FIELDS) {
      getters[field] = () => {
        const all = useEditor.getState().tracks
        const hit = optionCache.current.get(field)
        if (hit && hit.tracks === all) return hit.list
        const bag = new Map<string, number>()
        for (const track of all) {
          if (track.error) continue
          const value = String(track.draft[field] ?? '').trim()
          if (value) bag.set(value, (bag.get(value) ?? 0) + 1)
        }
        // один Collator на проход: localeCompare(…, locale) на каждое сравнение многократно дороже
        const collator = new Intl.Collator(getLocale())
        const list = [...bag.entries()].sort((left, right) => collator.compare(left[0], right[0])).map(([value, count]) => ({ value, count }))
        optionCache.current.set(field, { tracks: all, list })
        return list
      }
    }
    return getters
  }, [])

  if (picked.length > 0 && !editable.length) {
    return (
      <section className="stage-empty">
        <p>{picked[0]?.error ? tr(picked[0].error) : pack.readFail}</p>
      </section>
    )
  }

  const title = textField('title')
  const artist = textField('artist')
  const album = textField('album')
  const albumArtist = textField('albumArtist')
  const genre = textField('genre')
  const comment = textField('comment')
  const lyricsView = uniformField(
    editable.map((track) => track.draft.lyrics ?? track.tech.lyrics ?? ''),
    (left, right) => left === right
  )
  const lyrics = { mixed: lyricsView.mixed, value: lyricsView.value ?? '' }
  const year = numberField('year')
  const trackNumber = numberField('trackNumber')
  const trackTotal = numberField('trackTotal')
  const discNumber = numberField('discNumber')
  const discTotal = numberField('discTotal')

  const putToken = (token: string) => {
    const field = maskRef.current
    const start = field?.selectionStart ?? fileMask.length
    const end = field?.selectionEnd ?? start
    const next = `${fileMask.slice(0, start)}${token}${fileMask.slice(end)}`
    setFileMask(next)
    const caret = start + token.length
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(caret, caret)
    })
  }

  return (
    <section className="stage">
      <Tabs value={tab} onValueChange={(value) => {
        if ((SHEET_TABS as readonly string[]).includes(value)) setTab(value as SheetTab)
      }} className="sheet">
        <SheetTabs
          ids={SHEET_TABS}
          labels={{ main: pack.tabMain, note: pack.tabNote, lyrics: pack.tabLyrics, detail: pack.tabInfo, file: pack.tabFile }}
          active={tab}
          onSelect={setTab}
          label={pack.tabs}
          moreLabel={pack.tabs}
        />
      <TabsContent value="main" className="groups main-pane">
        <FieldGroup
          title={pack.groupTrack}
          asideTitle={pack.cover}
          asideHint={pack.coverHint}
          aside={<TrackCover />}
        >
          <CompositeField label={pack.fieldTitle} value={title.value} mixed={title.mixed} disabled={disabled} onChange={(value) => setField('title', value)} />
          <CompositeField
            label={pack.fieldArtist}
            value={artist.value}
            mixed={artist.mixed}
            disabled={disabled}
            combo
            getOptions={optionGetters.artist}
            history={history.artist ?? []}
            onChange={(value) => setField('artist', value)}
          />
          <CompositeField
            label={pack.fieldGenre}
            value={genre.value}
            mixed={genre.mixed}
            disabled={disabled}
            combo
            getOptions={optionGetters.genre}
            history={history.genre ?? []}
            onChange={(value) => setField('genre', value)}
          />
          <IndexRow
            label={pack.fieldTrackNo}
            left={trackNumber}
            right={trackTotal}
            disabled={disabled}
            onLeft={(value) => setField('trackNumber', value)}
            onRight={(value) => setField('trackTotal', value)}
          />
        </FieldGroup>
        <FieldGroup title={pack.groupAlbum}>
          <CompositeField
            label={pack.fieldAlbum}
            value={album.value}
            mixed={album.mixed}
            disabled={disabled}
            combo
            getOptions={optionGetters.album}
            history={history.album ?? []}
            onChange={(value) => setField('album', value)}
          />
          <CompositeField
            label={pack.fieldAlbumArtist}
            value={albumArtist.value}
            mixed={albumArtist.mixed}
            disabled={disabled}
            combo
            getOptions={optionGetters.albumArtist}
            history={history.albumArtist ?? []}
            onChange={(value) => setField('albumArtist', value)}
          />
          <NumberField
            label={pack.fieldYear}
            stepper
            value={year.value}
            mixed={year.mixed}
            disabled={disabled}
            onChange={(value) => setField('year', value)}
          />
          <IndexRow
            label={pack.fieldDiscNo}
            left={discNumber}
            right={discTotal}
            disabled={disabled}
            onLeft={(value) => setField('discNumber', value)}
            onRight={(value) => setField('discTotal', value)}
          />
        </FieldGroup>
      </TabsContent>
      <TabsContent value="note" className="groups note-pane">
        <div className="note-head">
          <span>{pack.comment}</span>
        </div>
        <CommentEditor value={comment.value} mixed={comment.mixed} disabled={disabled} onChange={(value) => setField('comment', value)} />
      </TabsContent>
      <TabsContent value="lyrics" className="groups note-pane">
        <div className="note-head">
          <span>{pack.infoLyrics}</span>
        </div>
        <CommentEditor value={lyrics.value} mixed={lyrics.mixed} disabled={disabled} label={pack.infoLyrics} onChange={(value) => setField('lyrics', value)} />
      </TabsContent>
      <TabsContent value="detail" className="groups info-scroll">
        <InfoPane tracks={editable} />
      </TabsContent>
      <TabsContent value="file" className="groups file-pane">
        <section>
          <div className="group-head">
            <span>{pack.forAllFiles}</span>
          </div>
          <div className="export-scope">
            <span id="apply-everywhere">{pack.applyEverywhere}</span>
            <button
              type="button"
              role="switch"
              className={everywhere ? 'settings-switch on' : 'settings-switch'}
              aria-checked={everywhere}
              aria-labelledby="apply-everywhere"
              disabled={disabled}
              onClick={() => setApplyScope(!everywhere)}
            >
              <span />
            </button>
          </div>
        </section>
        <section>
          <div className="group-head">
            <span className="group-title">
              <span>{pack.fileName}</span>
              <HoverCard.Root openDelay={200} closeDelay={160}>
                <HoverCard.Trigger asChild>
                  <button type="button" className="help" aria-label={pack.fileNameHelp}>
                    <HelpIcon />
                  </button>
                </HoverCard.Trigger>
                <HoverCard.Portal>
                  <HoverCard.Content className="file-help" side="bottom" align="start" sideOffset={6} data-no-track-nav="">
                    <p>{pack.fileNameBody}</p>
                    <div className="file-tokens">
                      {NAME_TOKENS.map((item) => (
                        <button key={item.token} type="button" className="mask-token" disabled={disabled} onClick={() => putToken(item.token)}>
                          <span>{tokenLabel(pack, item.token)}</span>
                          <b>{item.token}</b>
                        </button>
                      ))}
                    </div>
                  </HoverCard.Content>
                </HoverCard.Portal>
              </HoverCard.Root>
            </span>
          </div>
          <div className="group-card">
            <div className="form-row">
              <label className="form-label" htmlFor="file-mask">{pack.mask}</label>
              <div className="fld">
                <input
                  ref={maskRef}
                  id="file-mask"
                  value={fileMask}
                  disabled={disabled}
                  placeholder={pack.keepName}
                  spellCheck={false}
                  onChange={(event) => setFileMask(event.target.value)}
                />
              </div>
            </div>
          </div>
        </section>
        <section>
          <div className="group-head">
            <span className="group-title">
              <span>{pack.folder}</span>
              <Hint label={pack.folderHint}>
                <button type="button" className="help" aria-label={pack.folderHelp}>
                  <HelpIcon />
                </button>
              </Hint>
            </span>
          </div>
          <div className="group-card">
            <div className="form-row file-folder-row">
              <span className="form-label">{pack.where}</span>
              <Hint className="file-path-tip" label={fileDir || pack.beside}>
                <span className="file-path">
                  <FadeText>{fileDir || pack.beside}</FadeText>
                </span>
              </Hint>
              <div className="file-actions">
                <Hint label={pack.pickFolder} align="end">
                  <button type="button" className="icon-btn" aria-label={pack.pickFolder} disabled={saving} onClick={() => void pickFileDir()}>
                    <FolderIcon />
                  </button>
                </Hint>
                <Hint label={pack.resetFolder} align="end">
                  <button type="button" className="icon-btn" aria-label={pack.resetFolder} disabled={saving || !fileDir} onClick={() => setFileDir('')}>
                    <CloseIcon />
                  </button>
                </Hint>
              </div>
            </div>
          </div>
        </section>
      </TabsContent>
      </Tabs>
    </section>
  )
}