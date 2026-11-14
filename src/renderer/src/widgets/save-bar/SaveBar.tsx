import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { baseName, formatBadge, formatBitrate, formatDuration, formatRate } from '@/entities/track/lib'
import { draftCount, dirtyCount, editorPlan, historyEntries, useEditor } from '@/features/editor/model/store'
import { shownTrackTitle, trackDirty } from '@shared/plan'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { copyTracks } from '@/features/editor/lib/copy'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Hint } from '@/components/ui/tooltip'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { FadeText } from '@/shared/ui/fade-text'
import { CheckIcon, ChevronDownIcon, CloseIcon, CopyIcon, FileIcon, FolderOutIcon, MoreIcon, RedoIcon, RestoreIcon, TrashIcon, UndoIcon } from '@/shared/ui/icons'
import { fileWord, tr, useI18n } from '@/shared/i18n'

function ErrorScroll({ watch, children }: { watch: number; children: ReactNode }) {
  const { pack } = useI18n()
  const [overflow, setOverflow] = useState({ x: false, y: false })
  const [edges, setEdges] = useState({ top: false, right: false, bottom: false, left: false })
  const [barOn, setBarOn] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const railYRef = useRef<HTMLDivElement>(null)
  const railXRef = useRef<HTMLDivElement>(null)
  const thumbYRef = useRef<HTMLDivElement>(null)
  const thumbXRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const hideTimer = useRef(0)
  const drag = useRef<{ axis: 'x' | 'y'; pointer: number; start: number } | null>(null)
  const overThumb = useRef(false)
  const overList = useRef(false)
  const barOnRef = useRef(false)

  const placeThumb = () => {
    const el = listRef.current
    if (!el) return
    const maxY = el.scrollHeight - el.clientHeight
    const maxX = el.scrollWidth - el.clientWidth
    const next = { y: maxY > 1, x: maxX > 1 }
    const edge = {
      top: next.y && el.scrollTop > 2,
      bottom: next.y && maxY - el.scrollTop > 2,
      left: next.x && el.scrollLeft > 2,
      right: next.x && maxX - el.scrollLeft > 2
    }
    setOverflow((prev) => (prev.x === next.x && prev.y === next.y ? prev : next))
    setEdges((prev) => (prev.top === edge.top && prev.right === edge.right && prev.bottom === edge.bottom && prev.left === edge.left ? prev : edge))
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    let yRule = ''
    let xRule = ''
    const railY = railYRef.current
    const thumbY = thumbYRef.current
    if (next.y && railY && thumbY) {
      const track = railY.clientHeight
      const height = Math.max(28, Math.min(track, (el.clientHeight / el.scrollHeight) * track))
      const y = (el.scrollTop / Math.max(1, maxY)) * Math.max(0, track - height)
      yRule = `.status-thumb{height:${height}px;transform:translateY(${y}px)}`
    }
    const railX = railXRef.current
    const thumbX = thumbXRef.current
    if (next.x && railX && thumbX) {
      const track = railX.clientWidth
      const width = Math.max(28, Math.min(track, (el.clientWidth / el.scrollWidth) * track))
      const x = (el.scrollLeft / Math.max(1, maxX)) * Math.max(0, track - width)
      xRule = `.status-thumb-x{width:${width}px;transform:translateX(${x}px)}`
    }
    sheetRef.current.replaceSync(`${yRule}${xRule}`)
  }

  const reveal = () => {
    const el = listRef.current
    if (!el) return
    const can = el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1
    if (!can) return
    if (!barOnRef.current) {
      barOnRef.current = true
      setBarOn(true)
    }
    window.clearTimeout(hideTimer.current)
    if (overList.current || overThumb.current || drag.current) return
    hideTimer.current = window.setTimeout(() => {
      if (overList.current || overThumb.current || drag.current) return
      barOnRef.current = false
      setBarOn(false)
    }, 800)
  }

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    placeThumb()
    const onScroll = () => {
      placeThumb()
      reveal()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => placeThumb())
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [watch, overflow.x, overflow.y])

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimer.current)
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  const onThumbDown = (axis: 'x' | 'y') => (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = listRef.current
    if (!el) return
    drag.current = { axis, pointer: axis === 'y' ? event.clientY : event.clientX, start: axis === 'y' ? el.scrollTop : el.scrollLeft }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.currentTarget.classList.add('dragging')
    reveal()
  }

  const onThumbMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const el = listRef.current
    if (!state || !el) return
    if (state.axis === 'y') {
      const rail = railYRef.current
      const thumb = thumbYRef.current
      if (!rail || !thumb) return
      const max = el.scrollHeight - el.clientHeight
      const travel = Math.max(1, rail.clientHeight - thumb.getBoundingClientRect().height)
      el.scrollTop = state.start + ((event.clientY - state.pointer) / travel) * max
      return
    }
    const rail = railXRef.current
    const thumb = thumbXRef.current
    if (!rail || !thumb) return
    const max = el.scrollWidth - el.clientWidth
    const travel = Math.max(1, rail.clientWidth - thumb.getBoundingClientRect().width)
    el.scrollLeft = state.start + ((event.clientX - state.pointer) / travel) * max
  }

  const onThumbUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null
    event.currentTarget.classList.remove('dragging')
    reveal()
  }

  const thumbHover = {
    onPointerEnter: () => {
      overThumb.current = true
      window.clearTimeout(hideTimer.current)
    },
    onPointerLeave: () => {
      overThumb.current = false
      reveal()
    },
    onPointerMove: onThumbMove,
    onPointerUp: onThumbUp
  }

  return (
    <div
      className="status-scroll"
      onPointerEnter={() => {
        overList.current = true
        reveal()
      }}
      onPointerLeave={() => {
        overList.current = false
        reveal()
      }}
      onPointerMove={reveal}
    >
      <ul ref={listRef} className="error-list" aria-label={pack.errors}>
        {children}
      </ul>
      <div className={edges.top ? 'status-edge top on' : 'status-edge top'} />
      <div className={edges.right ? 'status-edge right on' : 'status-edge right'} />
      <div className={edges.bottom ? 'status-edge bottom on' : 'status-edge bottom'} />
      <div className={edges.left ? 'status-edge left on' : 'status-edge left'} />
      {overflow.y ? (
        <div ref={railYRef} className={barOn ? `list-rail live${overflow.x ? ' cross' : ''}` : `list-rail${overflow.x ? ' cross' : ''}`}>
          <div ref={thumbYRef} className="status-thumb" onPointerDown={onThumbDown('y')} {...thumbHover} />
        </div>
      ) : null}
      {overflow.x ? (
        <div ref={railXRef} className={barOn ? `status-rail-x live${overflow.y ? ' cross' : ''}` : `status-rail-x${overflow.y ? ' cross' : ''}`}>
          <div ref={thumbXRef} className="status-thumb-x" onPointerDown={onThumbDown('x')} {...thumbHover} />
        </div>
      ) : null}
    </div>
  )
}

function useSaveState() {
  const saving = useEditor((state) => state.saving)
  const progress = useEditor((state) => state.progress)
  const writeErrors = useEditor((state) => state.writeErrors)
  return { saving, progress, writeErrors }
}

function HistoryButton({
  label,
  disabled,
  icon,
  steps,
  onStep,
  onOnce
}: {
  label: string
  disabled: boolean
  icon: ReactNode
  steps: string[]
  onStep: (index: number) => void
  onOnce: () => void
}) {
  const { pack } = useI18n()
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const name = label.split(' · ')[0]
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setQuery('')
      }}
    >
      <Hint label={label} align="end">
        <Popover.Anchor asChild>
          <button
            type="button"
            className="icon-btn"
            aria-label={name}
            aria-expanded={open}
            disabled={disabled}
            onPointerUp={(event) => {
              if (event.button !== 0 || disabled) return
              setOpen(false)
              onOnce()
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onOnce()
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              if (!disabled && steps.length) setOpen(true)
            }}
          >
            {icon}
          </button>
        </Popover.Anchor>
      </Hint>
      <Popover.Portal>
        <Popover.Content
          className="hist-menu"
          align="end"
          sideOffset={6}
          aria-label={name}
          data-no-track-nav=""
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            searchRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <Command>
            <CommandInput ref={searchRef} onValueChange={setQuery} placeholder={pack.historySearch} aria-label={pack.historySearch} />
            <AxisScroll watch={`${query}:${steps.length}`}>
              {(ref) => (
                <CommandList ref={ref} className="cmd-scroll-body">
                  <CommandEmpty>{pack.nothingFound}</CommandEmpty>
                  <CommandGroup>
                    {steps.map((step, index) => (
                      <CommandItem
                        key={`${index}-${step}`}
                        value={`${index}\u0000${step}`}
                        keywords={[step]}
                        onSelect={() => {
                          onStep(index)
                          setOpen(false)
                        }}
                      >
                        <span className="hist-value">{step}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              )}
            </AxisScroll>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function TrackHeader() {
  const { locale, pack } = useI18n()
  const tracks = useEditor((state) => state.tracks)
  const selected = useEditor((state) => state.selected)
  const saving = useEditor((state) => state.saving)
  const reset = useEditor((state) => state.requestReset)
  const remove = useEditor((state) => state.remove)
  const removeSelected = useEditor((state) => state.removeSelected)
  const revealCurrent = useEditor((state) => state.revealCurrent)
  const openCurrent = useEditor((state) => state.openCurrent)
  const undoOnce = useEditor((state) => state.undoOnce)
  const redoOnce = useEditor((state) => state.redoOnce)
  const undoTo = useEditor((state) => state.undoTo)
  const redoTo = useEditor((state) => state.redoTo)
  const canUndo = useEditor((state) => state.undo.length > 0)
  const canRedo = useEditor((state) => state.redo.length > 0)
  const undoSteps = useEditor((state) => historyEntries(state, locale).undo)
  const redoSteps = useEditor((state) => historyEntries(state, locale).redo)
  const requestSave = useEditor((state) => state.requestSave)
  const liveDirty = useEditor((state) => dirtyCount(state))
  const drafts = useEditor((state) => draftCount(state))
  const plan = useEditor(editorPlan)
  const picked = tracks.filter((track) => selected.includes(track.path))
  const fileDirty = picked.some((track) =>
    trackDirty(
      {
        path: track.path,
        error: track.error,
        original: track.original,
        draft: track.draft,
        originalCover: track.originalCover,
        draftCover: track.draftCover
      },
      plan
    )
  )
  const first = picked[0]
  const number = first ? plan.fileName?.numbers?.[first.path] : undefined
  const title = picked.length === 0 ? pack.noTrack : picked.length === 1 ? shownTrackTitle({
    path: first.path,
    error: first.error,
    original: first.original,
    draft: first.draft,
    originalCover: first.originalCover,
    draftCover: first.draftCover
  }, plan) : pack.selectedN(picked.length)
  const meta = (() => {
    if (!first) return pack.pickTrack
    if (picked.length !== 1) return pack.selectedOf(picked.length, tracks.length)
    const bits = [pack.selectedOne(tracks.length), formatBadge(first.format)]
    if (number) bits.push(`%n% ${number}`)
    const duration = formatDuration(first.tech.durationMs)
    if (duration) bits.push(duration)
    const bitrate = formatBitrate(first.tech.bitrate)
    if (bitrate) bits.push(bitrate)
    const rate = formatRate(first.tech.sampleRate)
    if (rate) bits.push(rate)
    return bits.join(' · ')
  })()
  return (
    <header className="track-head">
      <div className="head-copy">
        <div className="head-title-row">
          <span className={fileDirty ? 'head-dirty on' : 'head-dirty'}>
            <span>
              <span className="dirty" aria-label={fileDirty ? pack.dirty : undefined} />
            </span>
          </span>
          <FadeText className="head-title">{title}</FadeText>
          <DropdownMenu>
            <Hint label={pack.fileOps}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="icon-btn" aria-label={pack.fileOps} disabled={saving || !picked.length}>
                  <MoreIcon />
                </button>
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="start" aria-label={pack.fileOps}>
              <DropdownMenuItem disabled={saving || !picked.length} onSelect={() => void revealCurrent()}>
                <FolderOutIcon />
                {pack.revealFile}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={saving || !picked.length} onSelect={() => void openCurrent()}>
                <FileIcon />
                {pack.openFile}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={saving || !picked.length} onSelect={() => void copyTracks('files')}>
                <CopyIcon />
                {picked.length > 1 ? pack.copyFiles : pack.copyFile}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={saving || !picked.length} onSelect={() => void copyTracks('paths')}>
                <CopyIcon />
                {picked.length > 1 ? pack.copyPaths : pack.copyPath}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={saving || !picked.length}
                onSelect={() => {
                  if (picked.length > 1) removeSelected()
                  else if (first) remove(first.path)
                }}
              >
                <TrashIcon />
                {picked.length > 1 ? pack.removeMany : pack.removeOne}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="head-meta">{meta}</span>
      </div>
      <div className="head-actions">
        <HistoryButton
          label={pack.undoKey}
          disabled={saving || !canUndo}
          icon={<UndoIcon />}
          steps={undoSteps}
          onOnce={undoOnce}
          onStep={(index) => undoTo(undoSteps.length - 1 - index)}
        />
        <HistoryButton
          label={pack.redoKey}
          disabled={saving || !canRedo}
          icon={<RedoIcon />}
          steps={redoSteps}
          onOnce={redoOnce}
          onStep={(index) => redoTo(redoSteps.length - 1 - index)}
        />
        <Hint label={pack.undoAll} align="end">
          <button type="button" className="icon-btn" aria-label={pack.undoAll} onClick={reset} disabled={saving || drafts === 0}>
            <RestoreIcon />
          </button>
        </Hint>
        <Hint label={saving ? pack.saving : pack.writeTagsKey} align="end">
          <button type="button" className="icon-btn accent" aria-label={pack.writeTags} onClick={requestSave} disabled={saving || liveDirty === 0}>
            <CheckIcon />
          </button>
        </Hint>
      </div>
    </header>
  )
}

function statusSession(saving: boolean, total: number | null, errors: { path: string; error: string; code?: string }[]): string {
  if (errors.length) return `err:${errors.map((item) => `${item.path}\0${item.code ?? ''}\0${item.error}`).join('\n')}`
  if (total !== null) return `write:${total}`
  if (saving) return 'save'
  return ''
}

export function SidebarStatus() {
  const { pack } = useI18n()
  const { progress, writeErrors, saving } = useSaveState()
  const saveCopy = useEditor((state) => state.saveCopy)
  const notify = useEditor((state) => state.notify)
  const [expanded, setExpanded] = useState(false)
  const [closed, setClosed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const copiedTimer = useRef(0)
  const session = statusSession(saving, progress ? progress.total : null, writeErrors)
  const open = Boolean(session) && closed !== session
  const failed = writeErrors.length > 0
  const tone = failed ? 'err' : 'busy'
  const ratio = progress && progress.total > 0 ? Math.min(1, progress.current / progress.total) : 0
  const left = progress ? pack.writing(progress.current, progress.total) : failed ? (writeErrors.length === 1 ? pack.writeOneFail : pack.writeManyFail(writeErrors.length)) : pack.saving

  useEffect(() => {
    if (!failed) setExpanded(false)
  }, [failed])

  useLayoutEffect(() => {
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    sheetRef.current.replaceSync(`.side-progress-fill{transform:scaleX(${ratio})}`)
  }, [ratio])

  useEffect(() => {
    return () => {
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => window.clearTimeout(copiedTimer.current)
  }, [])

  const copyErrors = () => {
    const text = writeErrors.map((item) => `${baseName(item.path)} — ${item.error}`).join('\n')
    if (!text) return
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1600)
    }).catch(() => notify({ kind: 'err', text: 'Не удалось скопировать ошибку' }))
  }

  return (
    <div
      className={open ? `side-status on ${tone}${expanded ? ' expanded' : ''}` : `side-status ${tone}`}
      role="status"
      aria-live="polite"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : true}
    >
      <div className="side-status-row">
        <span className="status-dot" aria-hidden="true" />
        <FadeText>{left}</FadeText>
        <div className="side-status-actions">
          {failed ? (
            <button
              type="button"
              className={copied ? 'icon-btn copy-swap copied' : 'icon-btn copy-swap'}
              aria-label={copied ? pack.copied : pack.copyError}
              onClick={copyErrors}
            >
              <span className="copy-swap-icon copy">
                <CopyIcon />
              </span>
              <span className="copy-swap-icon check">
                <CheckIcon />
              </span>
            </button>
          ) : null}
          {failed ? (
            <Hint label={expanded ? pack.collapseErrors : pack.showErrors}>
              <button
                type="button"
                className={expanded ? 'icon-btn side-status-toggle on' : 'icon-btn side-status-toggle'}
                aria-label={expanded ? pack.collapseErrors : pack.showErrors}
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                <ChevronDownIcon />
              </button>
            </Hint>
          ) : null}
          <Hint label={pack.close} align="end">
            <button type="button" className="icon-btn" aria-label={pack.close} onClick={() => setClosed(session)}>
              <CloseIcon size={14} />
            </button>
          </Hint>
        </div>
      </div>
      <div className={progress ? 'side-progress-slot on' : 'side-progress-slot'}>
        <div>
          <div
            className="side-progress"
            role="progressbar"
            aria-valuenow={progress?.current ?? 0}
            aria-valuemin={0}
            aria-valuemax={progress?.total ?? 0}
            aria-label={pack.writeProgress}
          >
            <span className="side-progress-fill" />
          </div>
        </div>
      </div>
      {failed ? (
        <div className="side-status-panel">
          <div>
            <ErrorScroll watch={writeErrors.length}>
              {writeErrors.map((item) => (
                <li key={item.path}>
                  <span>
                    {baseName(item.path)} — {tr(item.error)}
                  </span>
                  {item.code === 'locked' || item.code === 'readonly' ? (
                    <button type="button" className="btn" onClick={() => void saveCopy(item.path)} disabled={saving}>
                      {pack.copy}
                    </button>
                  ) : null}
                </li>
              ))}
            </ErrorScroll>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SaveDialogs() {
  const { pack } = useI18n()
  const preview = useEditor((state) => state.savePreview)
  const resetAsk = useEditor((state) => state.resetAsk)
  const closeAsk = useEditor((state) => state.closeAsk)
  const confirmSave = useEditor((state) => state.confirmSave)
  const dismissSave = useEditor((state) => state.dismissSave)
  const confirmReset = useEditor((state) => state.confirmReset)
  const dismissReset = useEditor((state) => state.dismissReset)
  const confirmClose = useEditor((state) => state.confirmClose)
  const dismissClose = useEditor((state) => state.dismissClose)
  const saving = useEditor((state) => state.saving)
  const count = preview?.length ?? 0
  const filesLabel = fileWord(count, pack)
  return (
    <>
      <Dialog open={resetAsk} onOpenChange={(open) => { if (!open) dismissReset() }}>
        <DialogContent className="ask-dialog" data-no-track-nav="" showCloseButton={false}>
          <DialogTitle>{pack.askResetTitle}</DialogTitle>
          <DialogDescription>{pack.askResetBody}</DialogDescription>
          <div className="ask-actions">
            <button type="button" className="btn" onClick={dismissReset}>{pack.keepChanges}</button>
            <button type="button" className="btn primary" onClick={confirmReset}>{pack.undoAll}</button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={closeAsk} onOpenChange={(open) => { if (!open) dismissClose() }}>
        <DialogContent className="ask-dialog" data-no-track-nav="" showCloseButton={false}>
          <DialogTitle>{pack.askCloseTitle}</DialogTitle>
          <DialogDescription>{pack.askCloseBody}</DialogDescription>
          <div className="ask-actions">
            <button type="button" className="btn" onClick={dismissClose}>{pack.stay}</button>
            <button type="button" className="btn primary" onClick={confirmClose}>{pack.close}</button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) dismissSave() }}>
        <DialogContent className="ask-dialog" data-no-track-nav="" showCloseButton={false}>
          <DialogTitle>{pack.askSaveTitle(count, filesLabel)}</DialogTitle>
          <DialogDescription>{pack.askSaveBody}</DialogDescription>
          <AxisScroll className="save-scroll" watch={String(count)} shade>
            {(ref) => (
              <div ref={ref} className="save-preview">
                {preview?.map((file) => (
                  <section key={file.path} className="save-file">
                    <b>{file.name}</b>
                    <ul>
                      {file.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </AxisScroll>
          <div className="ask-actions">
            <button type="button" className="btn" onClick={dismissSave} disabled={saving}>{pack.cancel}</button>
            <button type="button" className="btn primary" onClick={confirmSave} disabled={saving}>{pack.write}</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
