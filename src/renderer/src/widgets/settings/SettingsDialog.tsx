import { isLinux, isMac } from '@/shared/lib/platform'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { NAME_TOKENS } from '@shared/filename'
import type { Pack } from '@shared/i18n'
import { languagePackTemplate } from '@shared/language-pack'
import { ZOOM_STEPS, type ZoomStep } from '@shared/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  setNumberStart,
  setNumberWidth,
  setRememberVolume,
  setShowFormatBadges,
  chordFromEvent,
  formatChord,
  setShortcut,
  shortcutOf,
  tokenNameError,
  usePrefs,
  useShortcut,
  type ShortcutId
} from '@/features/settings/prefs'
import { languagePacks, menuLocaleOf, removeLanguagePack, saveLanguagePack, useI18n } from '@/shared/i18n'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { CloseIcon, ImportIcon, PlusIcon, SampleIcon, SearchIcon, TrashIcon, YearNextIcon, YearPrevIcon } from '@/shared/ui/icons'

const SIDE_MIN = 148
const SIDE_MAX = 260

const LABEL: Record<ShortcutId, keyof Pack> = {
  open: 'openFiles',
  folder: 'openFolder',
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
  remove: 'removeMany'
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

export type SettingsSection = 'language' | 'shortcuts' | 'operators' | 'writing' | 'playback' | 'system'
type SectionId = SettingsSection

function keepSelect(event: { preventDefault: () => void; target: EventTarget | null }) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('[data-slot="select-content"]')) event.preventDefault()
}

function sectionText(id: SectionId, pack: Pack, extra: string): string {
  if (id === 'language') return `${pack.language} ${pack.settingsPacks} ${pack.settingsPackLoad} ${extra} русский english`
  if (id === 'shortcuts') return `${pack.settingsShortcuts} ${extra}`
  if (id === 'operators') {
    return `${pack.settingsOperators} ${pack.settingsNumbering} ${pack.settingsNumberStart} ${pack.settingsNumberWidth} ${NAME_TOKENS.map((item) => item.token).join(' ')} ${extra}`
  }
  if (id === 'writing') return `${pack.settingsWriting} ${pack.settingsConfirmWrite} ${pack.settingsConfirmClose} ${pack.settingsConfirmReset} ${pack.settingsConfirmClear}`
  if (id === 'playback') return `${pack.settingsPlayback} ${pack.settingsRememberVolume} ${pack.settingsThrottle}`
  return `${pack.settingsSystem} ${pack.settingsMenu} ${pack.settingsMenuIcon} ${pack.settingsMenuBar} ${pack.settingsFormatBadges} ${pack.settingsHardware} ${pack.settingsSpellcheck} ${pack.settingsZoom} ${pack.settingsLogin} ${pack.settingsOnTop} ${pack.settingsRestore}`
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
  const [loadingPack, setLoadingPack] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const widthRef = useRef(176)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const packs = languagePacks()

  const shortcutWords = SHORTCUTS.map((item) => `${String(pack[LABEL[item.id]])} ${shortcutOf(item.id)}`).join(' ')
  const tokenWords = prefs.tokens.map((item) => `${item.name} ${item.value}`).join(' ')
  const sections = useMemo(() => {
    const rows: { id: SectionId; title: string; text: string }[] = [
      { id: 'language', title: pack.language, text: sectionText('language', pack, packs.map((item) => item.name).join(' ')) },
      { id: 'shortcuts', title: pack.settingsShortcuts, text: sectionText('shortcuts', pack, shortcutWords) },
      { id: 'operators', title: pack.settingsOperators, text: sectionText('operators', pack, tokenWords) },
      { id: 'writing', title: pack.settingsWriting, text: sectionText('writing', pack, '') },
      { id: 'playback', title: pack.settingsPlayback, text: sectionText('playback', pack, '') },
      { id: 'system', title: pack.settingsSystem, text: sectionText('system', pack, '') }
    ]
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => `${row.title} ${row.text}`.toLowerCase().includes(needle))
  }, [pack, packs, query, shortcutWords, tokenWords])

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

  const hardwarePending = app.settings.hardwareAcceleration !== app.hardwareAccelerationLive

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className="settings-window"
        data-no-track-nav=""
        showCloseButton={false}
        onPointerDownOutside={keepSelect}
        onFocusOutside={keepSelect}
      >
        <header className="settings-bar">
          <img className="settings-app-icon" alt="" src="icon.png" />
          <DialogTitle>{pack.settings}</DialogTitle>
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
                <div ref={ref} className="cmd-scroll-body settings-nav" role="tablist" aria-label={pack.settings}>
                  {sections.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={section === item.id}
                      className={section === item.id ? 'settings-nav-item on' : 'settings-nav-item'}
                      onClick={() => setSection(item.id)}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              )}
            </AxisScroll>
          </aside>
          <div className="settings-resizer" role="separator" aria-orientation="vertical" aria-label={pack.listWidth} onPointerDown={onResize} />
          <div className="settings-main" role="tabpanel">
            {sections.length === 0 ? (
              <div className="settings-empty">
                <span className="cmd-empty-title">{pack.noResults}</span>
                <span className="cmd-empty-hint">{pack.noResultsHint}</span>
              </div>
            ) : (
              <div className="settings-page-head">
                <h3>{sections.find((item) => item.id === section)?.title}</h3>
                {section === 'shortcuts' ? (
                  <button type="button" className="icon-btn" aria-label={pack.settingsShortcutReset} onClick={resetShortcuts}>
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            )}
            {sections.length > 0 ? (
            <AxisScroll className="settings-scroll" shade watch={`${section}:${prefs.tokens.length}:${packs.length}`}>
              {(ref) => (
                <div ref={ref} className="cmd-scroll-body settings-scroll-body">
            {section === 'language' ? (
              <section className="settings-page">
                <div className="settings-row">
                  <span className="settings-row-copy">
                    <b>{pack.language}</b>
                  </span>
                  <span className="settings-select-line">
                    <SettingSelect
                      label={pack.language}
                      value={locale}
                      options={[
                        { value: 'ru', label: 'Русский' },
                        { value: 'en', label: 'English' },
                        ...packs.map((item) => ({ value: `pack:${item.id}` as const, label: item.name }))
                      ]}
                      onChange={setLocale}
                    />
                    {locale.startsWith('pack:') ? (
                      <button type="button" className="icon-btn" aria-label={pack.removeOne} onClick={() => removeLanguagePack(locale.slice(5))}>
                        <CloseIcon />
                      </button>
                    ) : null}
                  </span>
                </div>
                {packs.length === 0 ? <p className="settings-hint">{pack.settingsPackEmpty}</p> : null}
                <p className="settings-hint">{pack.settingsPackHint}</p>
                <div className="settings-actions">
                  <button type="button" className="btn primary" disabled={loadingPack} onClick={() => void loadPack()}>
                    <ImportIcon />
                    {pack.settingsPackLoad}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void window.musicTagEditor?.saveText({ text: languagePackTemplate(menuLocaleOf(locale)), name: 'language-pack.json' })}
                  >
                    <SampleIcon />
                    {pack.settingsPackSample}
                  </button>
                </div>
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
              <section className="settings-page">
                <p className="settings-hint">{pack.fileNameBody}</p>
                <p className="settings-kicker">{pack.settingsNumbering}</p>
                <NumberStep label={pack.settingsNumberStart} value={prefs.numberStart} min={0} max={9999} onChange={setNumberStart} />
                <NumberStep label={pack.settingsNumberWidth} value={prefs.numberWidth} min={0} max={6} onChange={setNumberWidth} />
                <p className="settings-hint">{pack.settingsNumberAuto}</p>
                <p className="settings-kicker">{pack.settingsBuiltin}</p>
                <ul className="settings-list">
                  {NAME_TOKENS.map((item) => (
                    <li key={item.token} className="settings-token">
                      <code>{item.token}</code>
                      <span>{String(pack[TOKEN_LABEL[item.token] ?? 'settingsOperators'])}</span>
                    </li>
                  ))}
                </ul>
                <p className="settings-kicker">{pack.settingsCustom}</p>
                <ul className="settings-list">
                  {prefs.tokens.map((item) => (
                    <li key={item.id} className="settings-token">
                      <code>{`%${item.name}%`}</code>
                      <span>{item.value}</span>
                      <button type="button" className="icon-btn" aria-label={pack.removeOne} onClick={() => removeToken(item.id)}>
                        <CloseIcon />
                      </button>
                    </li>
                  ))}
                </ul>
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
                    <b>{pack.settingsMenu}</b>
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
                    <b>{pack.settingsZoom}</b>
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
                </div>
              )}
            </AxisScroll>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

function NumberStep({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const { pack } = useI18n()
  const commit = (raw: string) => {
    if (!/^\d{0,4}$/.test(raw)) return
    if (raw === '') return
    onChange(Math.max(min, Math.min(max, Number(raw))))
  }
  return (
    <div className="settings-field">
      <span>{label}</span>
      <div className="settings-step">
        <button type="button" className="settings-step-btn" aria-label={pack.less} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          <YearPrevIcon />
        </button>
        <input className="settings-input" inputMode="numeric" aria-label={label} value={String(value)} onChange={(event) => commit(event.target.value)} />
        <button type="button" className="settings-step-btn" aria-label={pack.moreNum} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          <YearNextIcon />
        </button>
      </div>
    </div>
  )
}

function SettingSwitch({ title, hint, on, onChange }: { title: string; hint: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <b>{title}</b>
        <span>{hint}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={title} className={on ? 'settings-switch on' : 'settings-switch'} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  )
}

function ShortcutRow({ id, label, capture, onCapture }: { id: ShortcutId; label: string; capture: ShortcutId | null; onCapture: (id: ShortcutId | null) => void }) {
  const { pack } = useI18n()
  const chord = useShortcut(id)
  const live = capture === id
  return (
    <li className="settings-shortcut">
      <span>{label}</span>
      <button type="button" className={live ? 'settings-key on' : 'settings-key'} onClick={() => onCapture(live ? null : id)}>
        {live ? pack.settingsPressKeys : formatChord(chord) || pack.settingsNone}
      </button>
    </li>
  )
}