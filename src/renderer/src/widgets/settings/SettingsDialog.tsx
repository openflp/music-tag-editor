import { isLinux, isMac } from '@/shared/lib/platform'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { NAME_TOKENS } from '@shared/filename'
import type { Pack } from '@shared/i18n'
import { languagePackTemplate } from '@shared/language-pack'
import { ZOOM_STEPS, type ZoomStep } from '@shared/types'
import { compareVersions, hasNewer, type ReleaseInfo } from '@shared/update'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Hint } from '@/components/ui/tooltip'
import { useEditor } from '@/features/editor/model/store'
import { setAppSetting, useAppSettings } from '@/features/settings/app-settings'
import {
  SHORTCUTS,
  addToken,
  removeToken,
  resetShortcuts,
  setConfirmClose,
  setConfirmReset,
  setConfirmClearLoad,
  setConfirmWrite,
  setAllOperators,
  setTokenEnabled,
  operatorsEnabled,
  setCheckUpdates,
  setNumberStart,
  setNumberWidth,
  setRememberVolume,
  setShowFormatBadges,
  setLanguageOrder,
  chordFromEvent,
  formatChord,
  setShortcut,
  shortcutOf,
  tokenNameError,
  updateToken,
  usePrefs,
  useShortcut,
  type ShortcutId
} from '@/features/settings/prefs'
import { auditLanguagePacks, languagePacks, menuLocaleOf, removeLanguagePack, saveLanguagePack, useI18n, type ActiveLocale } from '@/shared/i18n'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { Collapse as SharedCollapse } from '@/shared/ui/collapse'
import { CheckIcon, ChevronRightIcon, CircleCheckIcon, CloseIcon, ExpandIcon, HelpIcon, ImportIcon, MoreIcon, OpenExternalIcon, PlusIcon, RefreshIcon, SampleIcon, SearchIcon, SettingsIcon, ShrinkIcon, TrashIcon, YearNextIcon, YearPrevIcon } from '@/shared/ui/icons'

const SIDE_MIN = 148
const SIDE_MAX = 260

const LABEL: Record<ShortcutId, keyof Pack> = {
  open: 'openFiles',
  folder: 'openFolder',
  openFile: 'openFile',
  formatBadges: 'settingsFormatBadges',
  play: 'play',
  save: 'writeTags',
  undo: 'undo',
  redo: 'redo',
  redoAlt: 'settingsRedoAlt',
  palette: 'palette',
  settings: 'settings',
  nextTab: 'settingsNextTab',
  prevTab: 'settingsPrevTab',
  tabMain: 'tabMain',
  tabNote: 'tabNote',
  tabLyrics: 'tabLyrics',
  tabInfo: 'tabInfo',
  tabFile: 'tabFile',
  selectAll: 'selectAll',
  copyFiles: 'copyFile',
  remove: 'removeMany',
  sidebar: 'shortcutList',
  player: 'player',
  refresh: 'shortcutRefresh',
  clear: 'clearList',
  quit: 'nativeQuit',
  onTop: 'settingsOnTop',
  zoomIn: 'nativeZoomIn',
  zoomOut: 'nativeZoomOut',
  zoomReset: 'nativeZoom',
  reload: 'shortcutReload',
  helpShortcuts: 'settingsShortcuts',
  github: 'github',
  report: 'crashReport'
}

const TOKEN_LABEL: Record<string, keyof Pack> = {
  '%artist%': 'fieldArtist',
  '%title%': 'fieldTitle',
  '%album%': 'fieldAlbum',
  '%albumartist%': 'fieldAlbumArtist',
  '%year%': 'fieldYear',
  '%track%': 'fieldTrack',
  '%disc%': 'fieldDiscShort',
  '%genre%': 'fieldGenre',
  '%filename%': 'fileName',
  '%n%': 'settingsNumbers'
}

export type SettingsSection = 'language' | 'shortcuts' | 'operators' | 'writing' | 'playback' | 'system' | 'updates'
type SectionId = SettingsSection

function keepSelect(event: { preventDefault: () => void; target: EventTarget | null }) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('[data-slot="select-content"], [data-slot="dropdown-menu-content"]')) event.preventDefault()
}

function sectionItems(id: SectionId, pack: Pack, extra: string[]): string[] {
  if (id === 'language') return [pack.language, pack.settingsPacks, pack.settingsPackLoad, pack.settingsPackSample, pack.settingsPackCheck, pack.settingsPackName, pack.settingsPackBase, 'Русский', 'English', ...extra]
  if (id === 'shortcuts') return [pack.settingsShortcuts, ...extra]
  if (id === 'operators') {
    return [pack.settingsOperators, pack.settingsCustom, pack.settingsBuiltin, pack.settingsNumbering, pack.settingsNumberStart, pack.settingsNumberWidth, ...NAME_TOKENS.map((item) => item.token), ...extra]
  }
  if (id === 'writing') return [pack.settingsWriting, pack.settingsConfirmWrite, pack.settingsConfirmClose, pack.settingsConfirmReset, pack.settingsConfirmClear]
  if (id === 'playback') return [pack.settingsPlayback, pack.settingsRememberVolume, pack.settingsThrottle]
  if (id === 'updates') return [pack.settingsUpdates, pack.settingsUpdateCurrent, pack.settingsUpdateStartup, pack.settingsUpdateCheck, pack.settingsUpdateOpen]
  return [
    pack.settingsSystem,
    ...(isMac ? [] : [`${pack.settingsMenu} ${pack.settingsMenuIcon} ${pack.settingsMenuBar}`]),
    pack.settingsFormatBadges,
    pack.settingsHardware,
    pack.settingsSpellcheck,
    ...(isLinux ? [] : [pack.settingsLogin]),
    pack.settingsOnTop,
    pack.settingsRestore,
    pack.settingsZoom
  ]
}

/** Строка поиска (в нижнем регистре) — доступна всем строкам настроек для подсветки. */
const FindContext = createContext('')

/** Блоки с анимацией сообщают, что их высота устоялась: прокрутка и тень пересчитываются. */
const SettleContext = createContext<() => void>(() => undefined)

/** Текст с подсветкой найденного фрагмента. */
function Hl({ text }: { text: string }) {
  const needle = useContext(FindContext)
  if (!needle) return <>{text}</>
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let from = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(<mark key={at} className="settings-mark">{text.slice(at, at + needle.length)}</mark>)
    from = at + needle.length
  }
  if (parts.length === 0) return <>{text}</>
  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

/** Подсказка спрятана за (?): текст виден только при наведении. */
function HelpTip({ hint }: { hint?: string }) {
  if (!hint) return null
  return (
    <Hint label={hint} side="top">
      <button type="button" className="icon-btn settings-help" aria-label={hint}>
        <HelpIcon />
      </button>
    </Hint>
  )
}

function RowTitle({ title, hint, htmlFor }: { title: string; hint?: string; htmlFor?: string }) {
  const text = <b><Hl text={title} /></b>
  return (
    <span className="settings-row-title">
      {htmlFor ? <label htmlFor={htmlFor}>{text}</label> : text}
      <HelpTip hint={hint} />
    </span>
  )
}

export function SettingsDialog({ open, onClose, section: requested = 'language' }: { open: boolean; onClose: () => void; section?: SettingsSection }) {
  const { locale, pack, setLocale } = useI18n()
  const prefs = usePrefs()
  const app = useAppSettings()
  const notify = useEditor((state) => state.notify)
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<SectionId>(requested)
  const [capture, setCapture] = useState<ShortcutId | null>(null)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [settle, setSettle] = useState(0)
  const bumpSettle = useCallback(() => setSettle((count) => count + 1), [])
  const [maximized, setMaximized] = useState(false)
  const toggleMax = () => {
    setMaximized((prev) => !prev)
    // высота панелей меняется вместе с анимацией окна: после неё пересчитываем прокрутку и тени
    window.setTimeout(bumpSettle, 340)
  }
  const [editId, setEditId] = useState<string | null>(null)
  const [editFocus, setEditFocus] = useState<'name' | 'value'>('name')
  const [editName, setEditName] = useState('')
  const [editValue, setEditValue] = useState('')
  const editing = useRef(false)
  const startEdit = (item: { id: string; name: string; value: string }, focus: 'name' | 'value' = 'name') => {
    setEditFocus(focus)
    setEditId(item.id)
    setEditName(item.name)
    setEditValue(item.value)
  }
  const [loadingPack, setLoadingPack] = useState(false)
  const [packMarks, setPackMarks] = useState<Record<string, boolean> | null>(null)
  const [packBroken, setPackBroken] = useState<string[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const widthRef = useRef(176)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const packs = languagePacks()

  const needle = query.trim().toLowerCase()
  const shortcutWords = SHORTCUTS.map((item) => `${String(pack[LABEL[item.id]])} ${shortcutOf(item.id)}`).join('\n')
  const tokenWords = prefs.tokens.map((item) => `${item.name} ${item.value}`).join('\n')
  const sections = useMemo(() => {
    const rows: { id: SectionId; title: string; items: string[] }[] = [
      { id: 'language', title: pack.language, items: sectionItems('language', pack, packs.map((item) => item.name)) },
      { id: 'shortcuts', title: pack.settingsShortcuts, items: sectionItems('shortcuts', pack, shortcutWords.split('\n')) },
      { id: 'operators', title: pack.settingsOperators, items: sectionItems('operators', pack, tokenWords ? tokenWords.split('\n') : []) },
      { id: 'writing', title: pack.settingsWriting, items: sectionItems('writing', pack, []) },
      { id: 'playback', title: pack.settingsPlayback, items: sectionItems('playback', pack, []) },
      { id: 'system', title: pack.settingsSystem, items: sectionItems('system', pack, []) },
      { id: 'updates', title: pack.settingsUpdates, items: sectionItems('updates', pack, []) }
    ]
    const counted = rows.map((row) => ({ id: row.id, title: row.title, count: needle ? row.items.filter((item) => item.toLowerCase().includes(needle)).length : 0 }))
    if (!needle) return counted
    return counted.filter((row) => row.count > 0)
  }, [needle, pack, packs, shortcutWords, tokenWords])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSection(requested)
  }, [open, requested])

  useEffect(() => {
    if (!sections.length) return
    if (!sections.some((item) => item.id === section)) setSection(sections[0].id)
  }, [section, sections])

  useEffect(() => {
    if (!capture) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setCapture(null)
        return
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
      setShortcut(capture, chordFromEvent(event))
      setCapture(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capture])

  useEffect(() => {
    if (!open || capture) return
    const onFind = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return
      if (event.code !== 'KeyF') return
      event.preventDefault()
      event.stopPropagation()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onFind, true)
    return () => window.removeEventListener('keydown', onFind, true)
  }, [open, capture])

  useEffect(() => {
    return () => {
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  const paint = (width: number) => {
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    sheetRef.current.replaceSync(`.settings-window{--settings-side:${width}px}`)
  }

  const onResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX
    const start = widthRef.current
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => {
      const width = Math.max(SIDE_MIN, Math.min(SIDE_MAX, start + next.clientX - startX))
      widthRef.current = width
      paint(width)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const loadPack = async () => {
    if (!window.musicTagEditor || loadingPack) return
    setLoadingPack(true)
    try {
      const loaded = await window.musicTagEditor.loadLanguagePack()
      if (!loaded) return
      const saved = saveLanguagePack(loaded)
      setLocale(`pack:${saved.id}`)
    } catch {
      notify({ kind: 'err', text: pack.settingsPackBad })
    } finally {
      setLoadingPack(false)
    }
  }

  const checkPacks = () => {
    const result = auditLanguagePacks()
    const marks: Record<string, boolean> = {}
    const broken: string[] = []
    for (const row of result.rows) {
      marks[row.id] = row.ok
      if (!row.ok) broken.push(row.name)
    }
    setPackMarks(marks)
    setPackBroken(broken)
    if (result.failed && broken.length === 0) notify({ kind: 'err', text: pack.settingsPackBroken })
  }

  const onNavKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key) || sections.length === 0) return
    event.preventDefault()
    const index = Math.max(0, sections.findIndex((item) => item.id === section))
    let next = index
    if (event.key === 'ArrowDown') next = (index + 1) % sections.length
    else if (event.key === 'ArrowUp') next = (index - 1 + sections.length) % sections.length
    else if (event.key === 'Home') next = 0
    else next = sections.length - 1
    const id = sections[next].id
    setSection(id)
    requestAnimationFrame(() => document.getElementById(`settings-tab-${id}`)?.focus())
  }

  const operatorsOn = operatorsEnabled(prefs)
  const hardwarePending = app.settings.hardwareAcceleration !== app.hardwareAccelerationLive

  return (
    <FindContext.Provider value={needle}>
    <SettleContext.Provider value={bumpSettle}>
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className={maximized ? 'settings-window is-max' : 'settings-window'}
        data-no-track-nav=""
        showCloseButton={false}
        onPointerDownOutside={keepSelect}
        onFocusOutside={keepSelect}
      >
        <header
          className="settings-bar"
          onDoubleClick={(event) => {
            if (event.target instanceof Element && event.target.closest('button')) return
            toggleMax()
          }}
        >
          <SettingsIcon className="settings-app-icon" size={18} />
          <DialogTitle>
            {pack.settings}
            <span className="settings-bar-sub"> — {needle ? `«${query.trim()}» · ${sections.reduce((sum, item) => sum + item.count, 0)}` : (sections.find((item) => item.id === section)?.title ?? '')}</span>
          </DialogTitle>
          <Hint label={maximized ? pack.settingsMaximizeBack : pack.settingsMaximize}>
            <button
              type="button"
              className="icon-btn settings-max"
              aria-label={maximized ? pack.settingsMaximizeBack : pack.settingsMaximize}
              aria-pressed={maximized}
              onClick={toggleMax}
            >
              {maximized ? <ShrinkIcon key="back" /> : <ExpandIcon key="max" />}
            </button>
          </Hint>
          <button type="button" className="icon-btn settings-close" aria-label={pack.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <DialogDescription className="sr-only">{pack.settingsNote}</DialogDescription>
        <div className="settings-split">
          <aside className="settings-side">
            <label className="settings-search">
              <SearchIcon />
              <input ref={searchRef} value={query} placeholder={pack.settingsSearch} aria-label={pack.settingsSearch} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <AxisScroll className="settings-nav-scroll" shade watch={sections.map((item) => item.id).join(' ')}>
              {(ref) => (
                <div ref={ref} className="cmd-scroll-body settings-nav" role="tablist" aria-orientation="vertical" aria-label={pack.settings} onKeyDown={onNavKey}>
                  {sections.map((item) => (
                    <button
                      key={item.id}
                      id={`settings-tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={section === item.id}
                      aria-controls="settings-panel"
                      tabIndex={section === item.id ? 0 : -1}
                      className={section === item.id ? 'settings-nav-item on' : 'settings-nav-item'}
                      onClick={() => setSection(item.id)}
                    >
                      <span className="settings-nav-title"><Hl text={item.title} /></span>
                      {needle ? <span className="settings-count">{item.count}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </AxisScroll>
          </aside>
          <div className="settings-resizer" role="separator" aria-orientation="vertical" aria-label={pack.listWidth} onPointerDown={onResize} />
          <div className="settings-main" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${section}`}>
            {sections.length === 0 ? (
              <div className="settings-empty">
                <span className="cmd-empty-title">{pack.noResults}</span>
                <span className="cmd-empty-hint">{pack.noResultsHint}</span>
              </div>
            ) : (
              <div className="settings-page-head">
                <span className="settings-page-title">
                  <h3><Hl text={sections.find((item) => item.id === section)?.title ?? ''} /></h3>
                  {section === 'language' ? <HelpTip hint={pack.settingsPackHint} /> : null}
                </span>
                {section === 'shortcuts' ? (
                  <button type="button" className="icon-btn" aria-label={pack.settingsShortcutReset} onClick={() => resetShortcuts()}>
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            )}
            {sections.length > 0 ? (
            <AxisScroll className="settings-scroll" shade watch={`${section}:${prefs.tokens.length}:${packs.length}:${operatorsOn}:${editId ?? ''}:${settle}`}>
              {(ref) => (
                <div ref={ref} className="cmd-scroll-body settings-scroll-body">
            {section === 'language' ? (
              <section className="settings-page">
                <ListCard
                  split
                  toolbar={
                    <>
                      <span className="settings-card-tools">
                        <button type="button" className="btn" disabled={loadingPack} onClick={() => void loadPack()}>
                          <ImportIcon />
                          <Hl text={pack.settingsPackLoad} />
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void window.musicTagEditor?.saveText({ text: languagePackTemplate(menuLocaleOf(locale)), name: 'language-pack.json' })}
                        >
                          <SampleIcon />
                          <Hl text={pack.settingsPackSample} />
                        </button>
                      </span>
                      <Hint label={pack.settingsPackCheck}>
                        <button type="button" className="icon-btn" aria-label={pack.settingsPackCheck} onClick={checkPacks}>
                          <CircleCheckIcon />
                        </button>
                      </Hint>
                    </>
                  }
                >
                  <LanguageTable locale={locale} marks={packMarks} onSelect={setLocale} />
                </ListCard>
                {packBroken.length > 0 ? <p className="settings-hint" role="alert">{pack.settingsPackBroken}: {packBroken.join(', ')}</p> : null}
              </section>
            ) : null}
            {section === 'shortcuts' ? (
              <section className="settings-page">
                <ul className="settings-list">
                  {SHORTCUTS.map((item) => (
                    <ShortcutRow key={item.id} id={item.id} label={String(pack[LABEL[item.id]])} capture={capture} onCapture={setCapture} />
                  ))}
                </ul>
              </section>
            ) : null}
            {section === 'operators' ? (
              <section className="settings-page settings-ops">
                <SettingSwitch title={pack.settingsOperators} hint={pack.fileNameBody} tip on={operatorsOn} onChange={setAllOperators} />
                <Collapse open={operatorsOn} page>
                    <Accordion
                      title={pack.settingsCustom}
                      count={prefs.tokens.length}
                      defaultOpen
                      toolbar={
                        <form
                          className="settings-add"
                          onSubmit={(event) => {
                            event.preventDefault()
                            if (!addToken(name, value)) {
                              notify({ kind: 'err', text: pack.settingsTokenReserved })
                              return
                            }
                            setName('')
                            setValue('')
                          }}
                        >
                          <input className="settings-input" value={name} placeholder={pack.settingsTokenName} aria-label={pack.settingsTokenName} onChange={(event) => setName(event.target.value)} />
                          <input className="settings-input grow" value={value} placeholder={pack.settingsTokenValue} aria-label={pack.settingsTokenValue} onChange={(event) => setValue(event.target.value)} />
                          <button type="submit" className="icon-btn accent" aria-label={pack.settingsTokenAdd} disabled={tokenNameError(name)}>
                            <PlusIcon />
                          </button>
                        </form>
                      }
                    >
                      {prefs.tokens.length > 0 ? (
                        <ul className="ops-list">
                          {prefs.tokens.map((item) => (
                            item.id === editId ? (
                              <li key={item.id} className="ops-edit">
                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault()
                                    if (updateToken(item.id, editName, editValue)) setEditId(null)
                                    else notify({ kind: 'err', text: pack.settingsTokenReserved })
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key !== 'Escape') return
                                    event.stopPropagation()
                                    setEditId(null)
                                  }}
                                >
                                  <input className="settings-input" autoFocus={editFocus === 'name'} value={editName} placeholder={pack.settingsTokenName} aria-label={pack.settingsTokenName} onChange={(event) => setEditName(event.target.value)} />
                                  <input className="settings-input" autoFocus={editFocus === 'value'} value={editValue} placeholder={pack.settingsTokenValue} aria-label={pack.settingsTokenValue} onChange={(event) => setEditValue(event.target.value)} />
                                  <span className="ops-edit-actions">
                                    <button type="submit" className="icon-btn accent" aria-label={pack.settingsTokenSave} disabled={tokenNameError(editName, item.id)}>
                                      <CheckIcon />
                                    </button>
                                    <button type="button" className="icon-btn" aria-label={pack.settingsTokenCancel} onClick={() => setEditId(null)}>
                                      <CloseIcon />
                                    </button>
                                  </span>
                                </form>
                              </li>
                            ) : (
                            <li
                              key={item.id}
                              className={item.enabled ? undefined : 'is-off'}
                              onDoubleClick={(event) => {
                                if (!(event.target instanceof Element) || event.target.closest('button')) return
                                window.getSelection()?.removeAllRanges()
                                startEdit(item, event.target.closest('.clip') ? 'value' : 'name')
                              }}
                            >
                              <code><Hl text={`%${item.name}%`} /></code>
                              <span className="clip"><Hl text={item.value} /></span>
                              <RowMenu label={pack.menuMore} onCloseAutoFocus={(event) => { if (editing.current) { event.preventDefault(); editing.current = false } }}>
                                <DropdownMenuItem onSelect={() => {
                                  editing.current = true
                                  startEdit(item)
                                }}>
                                  {pack.settingsTokenEdit}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setTokenEnabled(item.id, !item.enabled)}>
                                  {item.enabled ? pack.settingsTokenDisable : pack.settingsTokenEnable}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => removeToken(item.id)}>
                                  <TrashIcon />
                                  {pack.removeOne}
                                </DropdownMenuItem>
                              </RowMenu>
                            </li>
                            )
                          ))}
                        </ul>
                      ) : null}
                    </Accordion>
                    <Accordion title={pack.settingsBuiltin} count={NAME_TOKENS.length}>
                      <ul className="ops-list">
                        {NAME_TOKENS.map((item) => (
                          <li key={item.token}>
                            <code><Hl text={item.token} /></code>
                            <span className="clip">{String(pack[TOKEN_LABEL[item.token] ?? 'settingsOperators'])}</span>
                          </li>
                        ))}
                      </ul>
                    </Accordion>
                    <p className="settings-kicker"><Hl text={pack.settingsNumbering} /></p>
                    <NumberStep label={pack.settingsNumberStart} hint={pack.settingsNumberStartHint} value={prefs.numberStart} min={0} max={9999} onChange={setNumberStart} />
                    <NumberStep label={pack.settingsNumberWidth} hint={pack.settingsNumberAuto} value={prefs.numberWidth} min={0} max={6} onChange={setNumberWidth} />
                </Collapse>
                <Collapse open={!operatorsOn} page>
                  <p className="settings-hint">{pack.settingsTokenOff}</p>
                </Collapse>
              </section>
            ) : null}
            {section === 'writing' ? (
              <section className="settings-page">
                <SettingSwitch title={pack.settingsConfirmWrite} hint={pack.settingsConfirmWriteHint} on={prefs.confirmWrite} onChange={setConfirmWrite} />
                <SettingSwitch title={pack.settingsConfirmClose} hint={pack.settingsConfirmCloseHint} on={prefs.confirmClose} onChange={setConfirmClose} />
                <SettingSwitch title={pack.settingsConfirmReset} hint={pack.settingsConfirmResetHint} on={prefs.confirmReset} onChange={setConfirmReset} />
                <SettingSwitch title={pack.settingsConfirmClear} hint={pack.settingsConfirmClearHint} on={prefs.confirmClearLoad} onChange={setConfirmClearLoad} />
              </section>
            ) : null}
            {section === 'playback' ? (
              <section className="settings-page">
                <SettingSwitch title={pack.settingsRememberVolume} hint={pack.settingsRememberVolumeHint} on={prefs.rememberVolume} onChange={setRememberVolume} />
                <SettingSwitch
                  title={pack.settingsThrottle}
                  hint={pack.settingsThrottleHint}
                  on={app.settings.backgroundThrottling}
                  onChange={(next) => setAppSetting('backgroundThrottling', next)}
                />
              </section>
            ) : null}
            {section === 'system' ? (
              <section className="settings-page">
                {isMac ? null : (
                <div className="settings-row">
                  <span className="settings-row-copy">
                    <RowTitle title={pack.settingsMenu} />
                    <span>{pack.settingsMenuHint}</span>
                  </span>
                  <SettingSelect
                    label={pack.settingsMenu}
                    value={app.settings.menuBar}
                    options={[
                      { value: 'icon', label: pack.settingsMenuIcon },
                      { value: 'bar', label: pack.settingsMenuBar }
                    ]}
                    onChange={(mode) => setAppSetting('menuBar', mode)}
                  />
                </div>
                )}
                <SettingSwitch
                  title={pack.settingsFormatBadges}
                  hint={pack.settingsFormatBadgesHint}
                  on={prefs.showFormatBadges}
                  onChange={setShowFormatBadges}
                />
                <SettingSwitch
                  title={pack.settingsHardware}
                  hint={hardwarePending ? pack.settingsHardwareRestart : pack.settingsHardwareHint}
                  on={app.settings.hardwareAcceleration}
                  onChange={(next) => setAppSetting('hardwareAcceleration', next)}
                />
                <SettingSwitch
                  title={pack.settingsSpellcheck}
                  hint={pack.settingsSpellcheckHint}
                  on={app.settings.spellcheck}
                  onChange={(next) => setAppSetting('spellcheck', next)}
                />
                {isLinux ? null : (
                <SettingSwitch
                  title={pack.settingsLogin}
                  hint={pack.settingsLoginHint}
                  on={app.settings.openAtLogin}
                  onChange={(next) => setAppSetting('openAtLogin', next)}
                />
                )}
                <SettingSwitch
                  title={pack.settingsOnTop}
                  hint={pack.settingsOnTopHint}
                  on={app.settings.alwaysOnTop}
                  onChange={(next) => setAppSetting('alwaysOnTop', next)}
                />
                <SettingSwitch
                  title={pack.settingsRestore}
                  hint={pack.settingsRestoreHint}
                  on={app.settings.restoreBounds}
                  onChange={(next) => setAppSetting('restoreBounds', next)}
                />
                <div className="settings-row">
                  <span className="settings-row-copy">
                    <RowTitle title={pack.settingsZoom} />
                  </span>
                  <SettingSelect
                    label={pack.settingsZoom}
                    value={String(app.settings.zoom)}
                    options={ZOOM_STEPS.map((step) => ({ value: String(step), label: String(Math.round(step * 100)) }))}
                    onChange={(step) => setAppSetting('zoom', Number(step) as ZoomStep)}
                  />
                </div>
              </section>
            ) : null}
            {section === 'updates' ? <UpdatePage /> : null}
                </div>
              )}
            </AxisScroll>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </SettleContext.Provider>
    </FindContext.Provider>
  )
}

function SettingSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  const current = options.find((option) => option.value === value)?.label
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger className="settings-select" size="sm" aria-label={label}>
        <SelectValue>{current}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function NumberStep({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const { pack } = useI18n()
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value
  const timer = useRef<number | null>(null)
  const limit = (raw: number) => Math.max(min, Math.min(max, raw))
  const clamp = (raw: string) => limit(Number(raw))
  const apply = (next: number) => {
    const clamped = limit(next)
    if (clamped === valueRef.current) return
    valueRef.current = clamped
    onChange(clamped)
  }
  const stop = () => {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  /** Нажатие меняет значение сразу; если шеврон удерживать, значение идёт дальше и ускоряется. */
  const hold = (dir: 1 | -1) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft(null)
    stop()
    apply(valueRef.current + dir)
    let delay = 380
    const repeat = () => {
      const next = limit(valueRef.current + dir)
      if (next === valueRef.current) {
        timer.current = null
        return
      }
      apply(next)
      delay = delay > 120 ? 120 : Math.max(40, delay * 0.9)
      timer.current = window.setTimeout(repeat, delay)
    }
    timer.current = window.setTimeout(repeat, delay)
  }
  const commit = () => {
    if (draft !== null && draft !== '') apply(clamp(draft))
    setDraft(null)
  }
  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <RowTitle title={label} hint={hint} htmlFor={id} />
      </span>
      <div className="settings-step">
        <button
          type="button"
          className="settings-step-btn"
          aria-label={pack.less}
          disabled={value <= min}
          onPointerDown={hold(-1)}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onClick={(event) => { if (event.detail === 0) { setDraft(null); apply(valueRef.current - 1) } }}
        >
          <YearPrevIcon />
        </button>
        <input
          id={id}
          className="settings-input"
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? String(value)}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => { if (/^\d{0,4}$/.test(event.target.value)) setDraft(event.target.value) }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            else if (event.key === 'Escape' && draft !== null) { event.stopPropagation(); setDraft(null) }
            else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              setDraft(null)
              apply(valueRef.current + (event.key === 'ArrowUp' ? 1 : -1))
            }
          }}
        />
        <button
          type="button"
          className="settings-step-btn"
          aria-label={pack.moreNum}
          disabled={value >= max}
          onPointerDown={hold(1)}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onClick={(event) => { if (event.detail === 0) { setDraft(null); apply(valueRef.current + 1) } }}
        >
          <YearNextIcon />
        </button>
      </div>
    </div>
  )
}

/** Плавное появление и исчезновение блока (общий Collapse); после анимации прокрутка и тени пересчитываются. */
function Collapse({ open, page = false, children }: { open: boolean; page?: boolean; children: ReactNode }) {
  const settled = useContext(SettleContext)
  return (
    <SharedCollapse open={open} innerClassName={page ? 'settings-page settings-ops' : undefined} onSettled={settled}>
      {children}
    </SharedCollapse>
  )
}

/** Аккордеон: шеврон поворачивается так же, как в «Информации» (.info-chevron). */
function Accordion({ title, count, defaultOpen = false, toolbar, children }: { title: string; count?: number; defaultOpen?: boolean; toolbar?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  return (
    <div className="settings-acc">
      <button type="button" className="settings-acc-head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((prev) => !prev)}>
        <span className="settings-acc-label">
          <ChevronRightIcon size={14} className={open ? 'info-chevron open' : 'info-chevron'} />
          <span className="settings-acc-title"><Hl text={title} /></span>
          {count !== undefined ? <span className="settings-count">{count}</span> : null}
        </span>
      </button>
      <Collapse open={open}>
        <div id={bodyId} className="settings-acc-body">
          {toolbar ? <div className="settings-card-bar">{toolbar}</div> : null}
          {children}
        </div>
      </Collapse>
    </div>
  )
}

/** Карточка-список: сверху панель действий (toolbar), под ней сам список или таблица. */
function ListCard({ toolbar, children, split }: { toolbar?: ReactNode; children: ReactNode; split?: boolean }) {
  return (
    <div className="settings-card">
      {toolbar ? <div className={split ? 'settings-card-bar split' : 'settings-card-bar'}>{toolbar}</div> : null}
      {children}
    </div>
  )
}

function RowMenu({ label, children, onCloseAutoFocus }: { label: string; children: ReactNode; onCloseAutoFocus?: (event: Event) => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="icon-btn" aria-label={label} onClick={(event) => event.stopPropagation()}>
          <MoreIcon />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Ручка-подсказка: за строку можно тянуть в любом месте (две колонки точек). */
function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {[7, 12, 17].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  )
}

function SettingSwitch({ title, hint, tip = false, on, onChange }: { title: string; hint: string; tip?: boolean; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <RowTitle title={title} hint={tip ? hint : undefined} />
        {tip ? null : <span>{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={title} className={on ? 'settings-switch on' : 'settings-switch'} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  )
}

type LangDrag = { id: string; from: number; to: number; dy: number; h: number; settling: boolean }

/** Язык приложения — строка на первом месте: перетащили пакет наверх, он и выбран. Тянуть можно за любое свободное место строки. */
function LanguageTable({ locale, marks, onSelect }: { locale: ActiveLocale; marks: Record<string, boolean> | null; onSelect: (next: ActiveLocale) => void }) {
  const { pack } = useI18n()
  const prefs = usePrefs()
  const dropped = useRef('')
  const packs = languagePacks()
  const baseLabel = (base: 'ru' | 'en') => (base === 'en' ? 'English' : 'Русский')
  const dropPack = (id: string) => {
    if (dropped.current === id) return
    dropped.current = id
    window.setTimeout(() => { if (dropped.current === id) dropped.current = '' }, 300)
    removeLanguagePack(id)
  }
  const natural: { id: string; name: string; base: string; locale: ActiveLocale; removable: boolean }[] = [
    { id: 'ru', name: 'Русский', base: pack.settingsPackBuiltin, locale: 'ru', removable: false },
    { id: 'en', name: 'English', base: pack.settingsPackBuiltin, locale: 'en', removable: false },
    ...packs.map((item) => ({ id: item.id, name: item.name, base: baseLabel(item.base), locale: `pack:${item.id}` as const, removable: true }))
  ]
  // сохранённый порядок; новые пакеты, которых там ещё нет, идут в конец в естественном порядке
  const rank = (id: string) => {
    const at = prefs.languageOrder.indexOf(id)
    return at === -1 ? Number.MAX_SAFE_INTEGER : at
  }
  const rows = natural
    .map((row, index) => ({ row, index }))
    .sort((left, right) => (rank(left.row.id) === rank(right.row.id) ? left.index - right.index : rank(left.row.id) < rank(right.row.id) ? -1 : 1))
    .map((item) => item.row)
  // текущий язык всегда наверху (язык могли сменить не здесь, например загрузкой пакета)
  const currentAt = rows.findIndex((row) => row.locale === locale)
  if (currentAt > 0) rows.unshift(...rows.splice(currentAt, 1))

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const localeRef = useRef(locale)
  localeRef.current = locale
  const dragRef = useRef<{ id: string; from: number; to: number; startY: number; h: number; active: boolean } | null>(null)
  const settleTimer = useRef<number | null>(null)
  const [drag, setDrag] = useState<LangDrag | null>(null)
  useEffect(() => () => { if (settleTimer.current !== null) window.clearTimeout(settleTimer.current) }, [])

  const reorder = (from: number, to: number) => {
    const list = rowsRef.current
    const ids = list.map((item) => item.id)
    if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    const first = list.find((item) => item.id === ids[0])
    if (first && first.locale !== localeRef.current) onSelect(first.locale)
    setLanguageOrder(ids)
  }

  const rowDown = (index: number) => (event: ReactPointerEvent<HTMLLIElement>) => {
    if (event.button !== 0 || settleTimer.current !== null) return
    // события из меню «⋯» (оно в портале) и с кнопок — не перетаскивание
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return
    if (event.target.closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: rowsRef.current[index].id, from: index, to: index, startY: event.clientY, h: event.currentTarget.getBoundingClientRect().height, active: false }
  }

  const rowMove = (event: ReactPointerEvent<HTMLLIElement>) => {
    const state = dragRef.current
    if (!state) return
    const raw = event.clientY - state.startY
    if (!state.active) {
      if (Math.abs(raw) < 4) return
      state.active = true
    }
    const last = rowsRef.current.length - 1
    const dy = Math.max(-state.from * state.h, Math.min((last - state.from) * state.h, raw))
    const to = Math.max(0, Math.min(last, state.from + Math.round(dy / state.h)))
    state.to = to
    setDrag({ id: state.id, from: state.from, to, dy, h: state.h, settling: false })
  }

  const rowEnd = () => {
    const state = dragRef.current
    if (!state) return
    dragRef.current = null
    if (!state.active) return
    // строка плавно доезжает до своей ячейки, и только потом порядок (и язык) записывается
    setDrag({ id: state.id, from: state.from, to: state.to, dy: (state.to - state.from) * state.h, h: state.h, settling: true })
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null
      reorder(state.from, state.to)
      setDrag(null)
    }, 170)
  }

  const rowKey = (index: number, id: string) => (event: ReactKeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (!step) return
    event.preventDefault()
    event.stopPropagation()
    reorder(index, index + step)
    requestAnimationFrame(() => document.getElementById(`lang-row-${id}`)?.focus())
  }

  const shiftOf = (index: number): number => {
    if (!drag) return 0
    if (index === drag.from) return drag.dy
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.h
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.h
    return 0
  }

  return (
    <ul className="lang-list" aria-label={pack.language}>
      {rows.map((row, index) => {
        const lifted = drag?.id === row.id
        const classes = ['lang-row', lifted ? 'lifted' : drag ? 'shifting' : '', lifted && drag?.settling ? 'settling' : ''].filter(Boolean).join(' ')
        return (
          <li
            key={row.locale}
            id={`lang-row-${row.id}`}
            className={classes}
            style={drag ? { transform: `translateY(${shiftOf(index)}px)` } : undefined}
            tabIndex={0}
            aria-label={`${row.name}. ${pack.settingsPackMove}`}
            onPointerDown={rowDown(index)}
            onPointerMove={rowMove}
            onPointerUp={rowEnd}
            onPointerCancel={rowEnd}
            onKeyDown={rowKey(index, row.id)}
          >
            <span className="lang-grip"><GripIcon /></span>
            <span className="lang-text">
              <span className="lang-title">
                <span className="lang-name"><Hl text={row.name} /></span>
                {marks && marks[row.id] === true ? <span className="settings-tag">{pack.settingsPackIntact}</span> : null}
                {marks && marks[row.id] === false ? <span className="settings-tag bad">{pack.settingsPackDamaged}</span> : null}
              </span>
              <span className="lang-base"><Hl text={row.base} /></span>
            </span>
            <RowMenu label={pack.menuMore}>
              <DropdownMenuItem disabled={index === 0} onSelect={() => reorder(index, 0)}>
                {pack.settingsPackUse}
              </DropdownMenuItem>
              {row.removable ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onPointerUp={(event) => {
                      if (event.button !== 0) return
                      dropPack(row.id)
                    }}
                    onSelect={() => dropPack(row.id)}
                  >
                    <TrashIcon />
                    {pack.removeOne}
                  </DropdownMenuItem>
                </>
              ) : null}
            </RowMenu>
          </li>
        )
      })}
    </ul>
  )
}

function sameReleases(left: readonly ReleaseInfo[], right: readonly ReleaseInfo[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return other !== undefined && item.tag === other.tag && item.version === other.version && item.publishedAt === other.publishedAt && item.prerelease === other.prerelease
  })
}

function UpdatePage() {
  const { pack, locale } = useI18n()
  const prefs = usePrefs()
  const [current, setCurrent] = useState('')
  const [versions, setVersions] = useState<ReleaseInfo[]>([])
  const [checked, setChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void window.musicTagEditor?.appVersion().then((version) => {
      if (live) setCurrent(version)
    }).catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const check = async () => {
    if (!window.musicTagEditor || checking) return
    setChecking(true)
    setFailed(false)
    try {
      const result = await window.musicTagEditor.checkUpdates()
      setCurrent((prev) => (prev === result.current ? prev : result.current))
      setVersions((prev) => (sameReleases(prev, result.versions) ? prev : result.versions))
      setChecked(true)
    } catch {
      setFailed(true)
    } finally {
      setChecking(false)
    }
  }

  const dateOf = (iso: string) => {
    if (!iso) return '—'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '—'
    return new Intl.DateTimeFormat(menuLocaleOf(locale), { dateStyle: 'medium' }).format(date)
  }

  const noteOf = (item: ReleaseInfo) => {
    if (item.prerelease) return pack.settingsUpdatePrerelease
    if (current && compareVersions(item.version, current) === 0) return pack.settingsUpdateCurrentBadge
    return ''
  }

  const ahead = (item: ReleaseInfo) => Boolean(current) && !item.prerelease && compareVersions(item.version, current) > 0

  const status = failed
    ? pack.settingsUpdateFail
    : !checked
      ? ''
      : versions.length === 0
        ? pack.settingsUpdateNone
        : hasNewer(current, versions)
          ? pack.settingsUpdateNewer
          : pack.settingsUpdateLatest

  return (
    <section className="settings-page">
      <div className="settings-row">
        <span className="settings-row-copy">
          <RowTitle title={pack.settingsUpdateCurrent} />
        </span>
        <span className="settings-version">{current || '—'}</span>
      </div>
      <SettingSwitch title={pack.settingsUpdateStartup} hint={pack.settingsUpdateStartupHint} on={prefs.checkUpdates} onChange={setCheckUpdates} />
      <div className="settings-actions">
        <button type="button" className="btn primary" disabled={checking} onClick={() => void check()}>
          <RefreshIcon className={checking ? 'settings-spin' : undefined} />
          <Hl text={pack.settingsUpdateCheck} />
        </button>
        <button type="button" className="btn" onClick={() => void window.musicTagEditor?.openReleases()}>
          <OpenExternalIcon />
          <Hl text={pack.settingsUpdateOpen} />
        </button>
      </div>
      {checking ? <p className="sr-only" role="status">{pack.settingsUpdateChecking}</p> : null}
      {status ? <p className="settings-hint" role={failed ? 'alert' : 'status'}>{status}</p> : null}
      {versions.length > 0 ? (
        <table className="settings-table">
          <thead>
            <tr>
              <th>{pack.settingsUpdateVersion}</th>
              <th>{pack.settingsUpdateWhen}</th>
              <th className="col-note"><span className="sr-only">{pack.settingsUpdates}</span></th>
              <th className="col-fit"><span className="sr-only">{pack.settingsUpdateRelease}</span></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((item) => (
              <tr key={item.tag}>
                <td><span className="clip">{item.version}</span></td>
                <td><span className="clip">{dateOf(item.publishedAt)}</span></td>
                <td className="note">{ahead(item) ? <span className="settings-tag">{pack.settingsUpdateAhead}</span> : noteOf(item)}</td>
                <td>
                  <button type="button" className="icon-btn" aria-label={pack.settingsUpdateRelease} onClick={() => void window.musicTagEditor?.openRelease(item.tag)}>
                    <OpenExternalIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}

function ShortcutRow({ id, label, capture, onCapture }: { id: ShortcutId; label: string; capture: ShortcutId | null; onCapture: (id: ShortcutId | null) => void }) {
  const { pack } = useI18n()
  const chord = useShortcut(id)
  const live = capture === id
  return (
    <li className="settings-shortcut">
      <span><Hl text={label} /></span>
      <button type="button" className={live ? 'settings-key on' : 'settings-key'} onClick={() => onCapture(live ? null : id)}>
        {live ? pack.settingsPressKeys : formatChord(chord) || pack.settingsNone}
      </button>
    </li>
  )
}