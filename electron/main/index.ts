import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, screen, session, shell, utilityProcess, type UtilityProcess } from 'electron'
import { packFor, type LocaleId } from '@shared/i18n'
import { parseLanguagePack } from '@shared/language-pack'
import { IPC, REPOSITORY_URL, type AppSettings, type HistoryMap, type MenuCommand, type NativeShortcuts, type TrackSnapshot, type WriteJob, type WriteResult } from '@shared/types'
import { readStoredRhythm } from '../services/rhythm'
import { TITLEBAR_BACKGROUND, TITLEBAR_FOREGROUND, TITLEBAR_OVERLAY_HEIGHT, WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from '@shared/titlebar'
import { installMediaProtocol, registerMediaScheme } from './media'
import { attachTitlebar } from './titlebar'
import { copyFileList, copyPlainText } from '../services/clipboard'
import { readTracks } from '../services/library'
import { readAppSettings, readBounds, readHistory, pushHistory, writeAppSettings, writeBounds } from '../services/settings'
import { coverKey, readCoverOnly, readTrack, writeTrack } from '../services/tag-io'
import { orderWrites } from '@shared/filename'
import { fetchVersions } from '../services/updates'
import { assertAccelerator, assertAppSettings, assertAudioFilePath, assertCloseConfirm, assertCoverInput, assertDirectoryPath, assertDragFiles, assertPathList, assertReleaseTag, assertReleasesUrl, assertRepositoryUrl, assertTextExport, assertWriteJob, assertWriteJobs, extensionForMime, isImagePath, issueReportUrl, mimeFromImagePath } from '../services/validate'
import { MAX_COVER_BYTES, type CoverArt } from '@shared/types'

const here = dirname(fileURLToPath(import.meta.url))

const DRAG_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const DRAG_COVER_SIDE = 64

let fallbackDragImage: Electron.NativeImage | null = null

// Запасная иконка (у трека нет обложки или её не удалось прочитать): иконка приложения, затем DRAG_PNG.
function fallbackDragIcon(): Electron.NativeImage {
  if (fallbackDragImage && !fallbackDragImage.isEmpty()) return fallbackDragImage
  const file = resolveAppIcon('icon.png')
  const fromApp = file ? nativeImage.createFromPath(file) : nativeImage.createEmpty()
  const base = fromApp.isEmpty() ? nativeImage.createFromBuffer(DRAG_PNG) : fromApp
  const icon = base.resize({ width: 48, height: 48 })
  if (icon.isEmpty()) throw new Error('Пустая иконка перетаскивания')
  fallbackDragImage = icon
  return icon
}

// Иконка под курсором — обложка перетаскиваемого трека (из файла), с сохранением пропорций.
// nativeImage читает только PNG и JPEG: для остальных форматов и треков без обложки берётся запасная иконка.
function dragIcon(filePath: string): Electron.NativeImage {
  try {
    const cover = readCoverOnly(filePath)
    if (cover && cover.dataBase64) {
      const image = nativeImage.createFromBuffer(Buffer.from(cover.dataBase64, 'base64'))
      if (!image.isEmpty()) {
        const { width, height } = image.getSize()
        const scale = DRAG_COVER_SIDE / Math.max(width, height)
        const icon = image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale))
        })
        if (!icon.isEmpty()) return icon
      }
    }
  } catch (error) {
    console.error('drag cover failed', error)
  }
  return fallbackDragIcon()
}

function resolveAppIcon(file: string): string | undefined {
  const candidates = [
    join(here, '../../src/renderer/public', file),
    join(app.getAppPath(), 'out/renderer', file)
  ]
  return candidates.find((candidate) => existsSync(candidate))
}
let win: BrowserWindow | null = null
let crashDialog = false
let locale: LocaleId = 'ru'
let allowClose = false
let quitting = false // идёт выход из приложения (Cmd+Q / app.quit)
let pendingQuit = false // закрытие окна прервано подтверждением; после него надо дойти до выхода
let hardwareLive = true

try {
  hardwareLive = readAppSettings().hardwareAcceleration
} catch (error) {
  console.error(error)
}
if (!hardwareLive) app.disableHardwareAcceleration()

function rememberBounds(): void {
  if (!win || !readAppSettings().restoreBounds) return
  const bounds = win.getBounds()
  writeBounds({ ...bounds, maximized: win.isMaximized() })
}

function applyLiveSettings(settings: AppSettings): void {
  try {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
  } catch (error) {
    console.error(error)
  }
  session.defaultSession.setSpellCheckerEnabled(settings.spellcheck)
  if (!win) return
  win.setAlwaysOnTop(settings.alwaysOnTop)
  win.webContents.setBackgroundThrottling(settings.backgroundThrottling)
  win.webContents.setZoomFactor(settings.zoom)
}

function L() {
  return packFor(locale)
}

let accelerators: NativeShortcuts = {
  open: 'CmdOrCtrl+O',
  folder: 'CmdOrCtrl+Shift+O',
  openFile: 'CmdOrCtrl+Enter',
  formatBadges: 'CmdOrCtrl+Shift+F',
  save: 'CmdOrCtrl+S',
  undo: 'CmdOrCtrl+Z',
  redo: 'CmdOrCtrl+Y'
}

function sendMenu(command: MenuCommand): void {
  win?.webContents.send(IPC.menu, command)
}

function macTemplate(text: ReturnType<typeof L>): Electron.MenuItemConstructorOptions[] {
  const sep: Electron.MenuItemConstructorOptions = { type: 'separator' }
  // Шорткаты, которых main не знает (палитра, настройки...), живут в renderer: здесь только подписи.
  const cmd = (label: string, command: MenuCommand, accelerator?: string): Electron.MenuItemConstructorOptions => ({
    label,
    accelerator: accelerator || undefined,
    click: () => sendMenu(command)
  })
  return [
    { role: 'appMenu' },
    {
      label: text.file,
      submenu: [
        cmd(text.openFiles, 'open', accelerators.open),
        cmd(text.openFolder, 'folder', accelerators.folder),
        sep,
        cmd(text.writeTags, 'save', accelerators.save),
        cmd(text.refresh, 'refresh'),
        sep,
        cmd(text.revealFile, 'reveal'),
        cmd(text.openFile, 'openFile', accelerators.openFile),
        sep,
        cmd(text.removeOne, 'remove'),
        cmd(text.clearList, 'clear'),
        sep,
        { role: 'close' }
      ]
    },
    {
      label: text.edit,
      submenu: [
        cmd(text.undo, 'undo', accelerators.undo),
        cmd(text.redo, 'redo', accelerators.redo),
        sep,
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: text.view,
      submenu: [
        cmd(text.searchCommands, 'palette'),
        cmd(text.settings, 'settings'),
        sep,
        // TODO: подпись «показать/скрыть» зависит от состояния renderer — нужен отдельный IPC
        cmd(text.showList, 'toggleSidebar'),
        cmd(text.showPlayer, 'togglePlayer'),
        cmd(text.settingsFormatBadges, 'formatBadges', accelerators.formatBadges),
        cmd(text.play, 'play'),
        sep,
        cmd(text.prevFile, 'prev'),
        cmd(text.nextFile, 'next'),
        sep,
        {
          label: text.sections,
          submenu: [
            cmd(text.tabMain, 'tab:main'),
            cmd(text.tabNote, 'tab:note'),
            cmd(text.tabLyrics, 'tab:lyrics'),
            cmd(text.tabInfo, 'tab:detail'),
            cmd(text.tabFile, 'tab:file')
          ]
        },
        sep,
        cmd(text.nativeZoomIn, 'zoomIn'),
        cmd(text.nativeZoomOut, 'zoomOut'),
        cmd(text.nativeZoom, 'zoomReset'),
        { role: 'togglefullscreen' },
        sep,
        cmd(text.nativeReload, 'reload'),
        { role: 'toggleDevTools', label: text.nativeDevtools }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        cmd(text.settingsShortcuts, 'helpShortcuts'),
        { label: text.github, click: () => void shell.openExternal(REPOSITORY_URL) },
        { label: text.crashReport, click: () => void shell.openExternal(issueReportUrl('', text.crashTitle)) }
      ]
    }
  ]
}

function buildMenu(): void {
  const text = L()
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate(macTemplate(text)))
    return
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: text.file,
      submenu: [
        { label: text.nativeOpen, accelerator: accelerators.open || undefined, click: () => sendMenu('open') },
        { label: text.openFolder, accelerator: accelerators.folder || undefined, click: () => sendMenu('folder') },
        { label: text.openFile, accelerator: accelerators.openFile || undefined, click: () => sendMenu('openFile') },
        { label: text.settingsFormatBadges, accelerator: accelerators.formatBadges || undefined, click: () => sendMenu('formatBadges') },
        { label: text.play, click: () => sendMenu('play') },
        { type: 'separator' },
        { label: text.writeTags, accelerator: accelerators.save || undefined, click: () => sendMenu('save') },
        { type: 'separator' },
        { label: text.nativeUndo, accelerator: accelerators.undo || undefined, click: () => sendMenu('undo') },
        { label: text.nativeRedo, accelerator: accelerators.redo || undefined, click: () => sendMenu('redo') },
        { label: text.nativePrev, click: () => sendMenu('prev') },
        { label: text.nativeNext, click: () => sendMenu('next') },
        { type: 'separator' },
        { label: text.nativeQuit, click: () => sendMenu('quit') }
      ]
    },
    {
      label: text.view,
      submenu: [
        { label: text.nativeReload, click: () => sendMenu('reload') },
        { role: 'toggleDevTools', label: text.nativeDevtools },
        { type: 'separator' },
        { label: text.nativeZoom, click: () => sendMenu('zoomReset') },
        { label: text.nativeZoomIn, click: () => sendMenu('zoomIn') },
        { label: text.nativeZoomOut, click: () => sendMenu('zoomOut') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function installCsp(): void {
  const dev = Boolean(process.env.ELECTRON_RENDERER_URL)
  // В dev Vite вставляет inline-преамбулу React Refresh. В сборке Monaco
  // поднимает воркер через blob и дописывает стили темы в <style>.
  const policy = dev
    ? "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src media:; connect-src 'self' media: ws: http://localhost:*"
    : "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src media:; connect-src 'self' media:; object-src 'none'; base-uri 'self'; frame-src 'none'"
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

async function createWindow(): Promise<void> {
  allowClose = false
  const appSettings = readAppSettings()
  const saved = appSettings.restoreBounds ? readBounds() : undefined
  const area = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(Math.max(saved?.width ?? 1280, WINDOW_MIN_WIDTH), area.width)
  const height = Math.min(Math.max(saved?.height ?? 800, WINDOW_MIN_HEIGHT), area.height)
  nativeTheme.themeSource = 'dark'
  const windowIcon = resolveAppIcon(process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  if (process.platform === 'darwin') {
    const dockIcon = resolveAppIcon('icon.png')
    if (dockIcon) app.dock?.setIcon(dockIcon)
  }
  win = new BrowserWindow({
    icon: windowIcon,
    width,
    height,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    x: saved?.x,
    y: saved?.y,
    show: false,
    backgroundColor: TITLEBAR_BACKGROUND,
    // macOS: frame:false убирает светофор, поэтому там frame:true + скрытый заголовок
    frame: process.platform === 'darwin',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: Math.round((TITLEBAR_OVERLAY_HEIGHT - 12) / 2) } } : {}),
    titleBarOverlay:
      process.platform === 'win32'
        ? {
            // прозрачный фон: кнопки окна рисует ОС поверх страницы, и непрозрачный цвет не затемняется оверлеем диалога
            color: '#00000000',
            symbolColor: TITLEBAR_FOREGROUND,
            height: TITLEBAR_OVERLAY_HEIGHT
          }
        : false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: appSettings.backgroundThrottling,
      spellcheck: appSettings.spellcheck
    }
  })
  win.setAlwaysOnTop(appSettings.alwaysOnTop)
  if (saved?.maximized) win.maximize()
  try {
    await attachTitlebar(win)
  } catch (error) {
    console.error('Titlebar failed', error)
  }
  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  win.on('close', (event) => {
    if (!win) return
    const pageReady = !win.webContents.isLoading() && !win.webContents.isCrashed()
    if (allowClose || !pageReady) {
      rememberBounds()
      return
    }
    event.preventDefault()
    pendingQuit = quitting
    quitting = false
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send(IPC.closeQuery)
  })
  win.webContents.on('did-finish-load', () => {
    win?.webContents.setZoomFactor(readAppSettings().zoom)
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('render-process-gone', (_event, details) => {
    if (!win || crashDialog || details.reason === 'clean-exit') return
    crashDialog = true
    const text = L()
    const body = `${details.reason}\nexit ${details.exitCode}`
    void dialog
      .showMessageBox(win, {
        type: 'error',
        title: text.crashTitle,
        message: text.crashTitle,
        detail: `${text.crashLead}\n\n${body}`,
        buttons: [text.crashReload, text.crashReport],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      .then(async (result) => {
        if (result.response === 1) await shell.openExternal(issueReportUrl(body, text.crashTitle))
        if (!win?.isDestroyed()) win?.webContents.reload()
      })
      .finally(() => {
        crashDialog = false
      })
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(here, '../renderer/index.html'))
}

function writeWithUtility(jobs: WriteJob[]): Promise<WriteResult[]> {
  const writerPath = join(here, 'writer.js')
  return new Promise((resolve, reject) => {
    let child: UtilityProcess
    try {
      child = utilityProcess.fork(writerPath, [], { serviceName: 'tag-writer', stdio: 'pipe' })
    } catch (error) {
      reject(error)
      return
    }
    let settled = false
    const finish = (error?: Error, results?: WriteResult[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(results ?? [])
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(new Error('Запись заняла слишком много времени'))
    }, 10 * 60 * 1000)
    child.on('message', (message: { type?: string; results?: WriteResult[]; current?: number; total?: number; path?: string }) => {
      if (message?.type === 'progress' && message.path && message.current && message.total) {
        win?.webContents.send(IPC.progress, { current: message.current, total: message.total, path: message.path })
      }
      if (message?.type === 'done') finish(undefined, message.results ?? [])
    })
    child.once('exit', (code) => {
      if (!settled && code !== 0) finish(new Error('Процесс записи остановился'))
    })
    child.postMessage({ jobs })
  })
}

async function writeAll(jobs: WriteJob[]): Promise<WriteResult[]> {
  try {
    return await writeWithUtility(jobs)
  } catch (error) {
    console.error('Utility writer unavailable, writing in main', error)
    const planned = orderWrites(jobs, process.platform)
    const sequence = [
      ...planned.ready.map((job) => ({ job, blocked: false })),
      ...planned.blocked.map((job) => ({ job, blocked: true }))
    ]
    const results: WriteResult[] = []
    for (let index = 0; index < sequence.length; index += 1) {
      const item = sequence[index]
      win?.webContents.send(IPC.progress, { current: index + 1, total: sequence.length, path: item.job.path })
      results.push(
        item.blocked
          ? { path: item.job.path, ok: false, code: 'invalid', error: 'Имя совпадает с другим файлом' }
          : await writeTrack(item.job)
      )
    }
    return results
  }
}

type ReaderRequest = { kind: 'read'; inputs: string[] } | { kind: 'details'; paths: string[] } | { kind: 'covers'; paths: string[] }
type CoverItem = { path: string; cover: CoverArt | null }

class ReadCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'ReadCancelled'
  }
}

let readEpoch = 0
const readers = new Set<{ kind: ReaderRequest['kind']; cancel: () => void }>()

function cancelTagReads(): void {
  readEpoch += 1
  for (const reader of readers) {
    if (reader.kind === 'read') reader.cancel()
  }
}

// Читаем теги в отдельном процессе (как запись): taglib синхронный и на тысячах файлов
// иначе вешает main — а с ним окно и перетаскивание.
function readWithUtility(request: ReaderRequest, onBatch: (tracks: TrackSnapshot[]) => void, onCovers?: (items: CoverItem[]) => void): Promise<void> {
  const workerPath = join(here, 'writer.js')
  return new Promise((resolve, reject) => {
    let child: UtilityProcess | undefined
    let settled = false
    let cancelled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      readers.delete(entry)
      clearTimeout(timer)
      child?.kill()
      if (error) reject(error)
      else resolve()
    }
    const entry = {
      kind: request.kind,
      cancel: () => {
        cancelled = true
        finish(new ReadCancelled())
      }
    }
    const timer = setTimeout(() => finish(new Error('Чтение заняло слишком много времени')), 10 * 60 * 1000)
    try {
      child = utilityProcess.fork(workerPath, [], { serviceName: 'tag-reader', stdio: 'pipe' })
    } catch (error) {
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error('Не удалось прочитать файлы'))
      return
    }
    readers.add(entry)
    child.on('message', (message: { type?: string; tracks?: TrackSnapshot[]; items?: CoverItem[]; message?: string }) => {
      if (cancelled) return
      if (message?.type === 'batch' && Array.isArray(message.tracks)) onBatch(message.tracks)
      else if (message?.type === 'covers' && Array.isArray(message.items)) onCovers?.(message.items)
      else if (message?.type === 'done') finish()
      else if (message?.type === 'error') finish(new Error(message.message || 'Не удалось прочитать файлы'))
    })
    child.once('exit', () => {
      if (cancelled || settled) return
      finish(new Error('Процесс чтения остановился'))
    })
    child.postMessage(request)
  })
}

async function readAll(inputs: string[], onBatch: (tracks: TrackSnapshot[]) => void): Promise<void> {
  const epoch = readEpoch
  const cancelled = () => epoch !== readEpoch
  let started = false
  try {
    await readWithUtility({ kind: 'read', inputs }, (tracks) => {
      if (cancelled()) return
      started = true
      onBatch(tracks)
    })
  } catch (error) {
    if (cancelled() || error instanceof ReadCancelled) return
    // уже что-то отдали — повторять нельзя, иначе пойдут дубли
    if (started) throw error
    console.error('Utility reader unavailable, reading in main', error)
    await readTracks(inputs, (tracks) => {
      if (!cancelled()) onBatch(tracks)
    }, { lite: true, cancelled })
  }
}

// до стольких файлов быстрее и проще прочитать прямо в main, чем поднимать процесс
const DETAILS_INLINE = 6
const COVERS_INLINE = 3

async function existingDirectory(payload: unknown): Promise<string> {
  const dir = assertDirectoryPath(payload)
  try {
    const info = await stat(dir)
    if (!info.isDirectory()) throw new Error('Папка не найдена')
  } catch (error) {
    if (error instanceof Error && error.message === 'Папка не найдена') throw error
    throw new Error('Папка не найдена')
  }
  return dir
}

async function existingAudioFile(payload: unknown): Promise<string> {
  const filePath = assertAudioFilePath(payload)
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('Файл не найден')
  } catch (error) {
    if (error instanceof Error && error.message === 'Файл не найден') throw error
    throw new Error('Файл не найден')
  }
  return filePath
}

function registerIpc(): void {
  ipcMain.handle(IPC.openFiles, async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: L().dialogOpenFiles,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Музыка', extensions: ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'aif', 'aiff', 'wma'] }]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(IPC.openFolder, async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: L().dialogOpenFolder,
      properties: ['openDirectory']
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(IPC.pickFolder, async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: L().dialogDest,
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.on(IPC.cancelRead, () => {
    cancelTagReads()
  })

  ipcMain.handle(IPC.readTags, async (event, payload: unknown, options: unknown) => {
    const inputs = assertPathList(payload)
    const stream = Boolean(options && typeof options === 'object' && (options as { stream?: unknown }).stream === true)
    const collected: TrackSnapshot[] = []
    await readAll(inputs, (tracks) => {
      // итог копим всегда: в потоковом режиме им добирается то, что не дошло пачками
      // (рендерер отсекает дубли по пути)
      for (const track of tracks) collected.push(track)
      if (!stream) return
      if (!event.sender.isDestroyed()) event.sender.send(IPC.trackBatch, tracks)
    })
    return collected
  })

  // полные обложки по требованию: для миниатюр видимых строк и для показа выбранного трека
  ipcMain.handle(IPC.readCovers, async (_event, payload: unknown): Promise<CoverItem[]> => {
    const paths = assertPathList(payload)
    if (paths.length <= COVERS_INLINE) return paths.map((path) => ({ path, cover: readCoverOnly(path) }))
    const collected: CoverItem[] = []
    try {
      await readWithUtility(
        { kind: 'covers', paths },
        () => undefined,
        (items) => {
          for (const item of items) collected.push(item)
        }
      )
    } catch (error) {
      if (collected.length) throw error
      console.error('Utility reader unavailable, reading covers in main', error)
      return paths.map((path) => ({ path, cover: readCoverOnly(path) }))
    }
    return collected
  })

  // полные сведения (facts, encoder, tagTypes…) — только для выбранных треков, по запросу
  ipcMain.handle(IPC.readDetails, async (_event, payload: unknown) => {
    const paths = assertPathList(payload)
    if (paths.length <= DETAILS_INLINE) return paths.map((filePath) => readTrack(filePath, false, 'none'))
    const collected: TrackSnapshot[] = []
    try {
      await readWithUtility({ kind: 'details', paths }, (tracks) => {
        for (const track of tracks) collected.push(track)
      })
    } catch (error) {
      if (collected.length) throw error
      console.error('Utility reader unavailable, reading details in main', error)
      return paths.map((filePath) => readTrack(filePath, false, 'none'))
    }
    return collected
  })

  ipcMain.handle(IPC.readRhythm, async (_event, payload: unknown) => readStoredRhythm(assertAudioFilePath(payload)))

  ipcMain.handle(IPC.writeTags, async (_event, payload: unknown) => writeAll(assertWriteJobs(payload)))

  ipcMain.handle(IPC.openCover, async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: L().dialogCover,
      properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    if (!isImagePath(filePath)) throw new Error('Нужен файл изображения')
    const data = await readFile(filePath)
    if (data.byteLength > MAX_COVER_BYTES) throw new Error('Обложка больше 8 МБ')
    return { mime: mimeFromImagePath(filePath), bytes: data.byteLength, dataBase64: data.toString('base64'), key: coverKey(data) }
  })

  ipcMain.handle(IPC.saveCover, async (_event, payload: unknown) => {
    const cover = assertCoverInput(payload)
    const ext = extensionForMime(cover.mime)
    const result = await dialog.showSaveDialog(win!, {
      title: L().dialogSaveCover,
      defaultPath: `cover.${ext}`,
      filters: [{ name: 'Изображение', extensions: [ext] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, Buffer.from(cover.dataBase64, 'base64'))
    return true
  })

  ipcMain.handle(IPC.saveText, async (_event, payload: unknown) => {
    const file = assertTextExport(payload)
    const result = await dialog.showSaveDialog(win!, {
      title: L().dialogExport,
      defaultPath: file.name,
      filters: [{ name: 'Текст', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, file.text, 'utf8')
    return true
  })

  ipcMain.handle(IPC.saveCopy, async (_event, payload: unknown) => {
    const job = assertWriteJob(payload)
    const parsed = parse(job.path)
    const result = await dialog.showSaveDialog(win!, {
      title: L().dialogCopy,
      defaultPath: join(parsed.dir, `${parsed.name} (копия)${parsed.ext}`),
      filters: [{ name: parsed.ext.slice(1).toUpperCase() || 'Аудио', extensions: [parsed.ext.replace('.', '') || '*'] }]
    })
    if (result.canceled || !result.filePath) return { path: job.path, ok: false, code: 'cancelled', error: 'Сохранение отменено' }
    await copyFile(job.path, result.filePath)
    return writeTrack({ path: result.filePath, patch: job.patch, cover: job.cover })
  })

  // Асинхронный send из preload: рендерер не ждёт ответа и не зависает на время перетаскивания.
  ipcMain.on(IPC.dragFiles, (event, payload: unknown) => {
    try {
      const files = assertDragFiles(payload)
      if (!files.length) return
      event.sender.startDrag({ file: files[0], files, icon: dragIcon(files[0]) })
    } catch (error) {
      console.error('startDrag failed', error)
    }
  })

  ipcMain.handle(IPC.copyFiles, async (_event, payload: unknown) => {
    const files = assertDragFiles(payload)
    if (!files.length) throw new Error('Не удалось скопировать файл')
    await copyFileList(files)
  })

  ipcMain.handle(IPC.copyText, async (_event, payload: unknown) => {
    if (typeof payload !== 'string') throw new Error('Некорректный текст')
    await copyPlainText(payload)
  })

  ipcMain.handle(IPC.revealPath, async (_event, payload: unknown) => {
    shell.showItemInFolder(await existingAudioFile(payload))
  })

  ipcMain.handle(IPC.revealDir, async (_event, payload: unknown) => {
    const dir = await existingDirectory(payload)
    shell.showItemInFolder(dir)
  })

  ipcMain.handle(IPC.openPath, async (_event, payload: unknown) => {
    const error = await shell.openPath(await existingAudioFile(payload))
    if (error) throw new Error('Не удалось открыть файл')
  })

  ipcMain.handle(IPC.openDir, async (_event, payload: unknown) => {
    const error = await shell.openPath(await existingDirectory(payload))
    if (error) throw new Error('Не удалось открыть папку')
  })

  ipcMain.handle(IPC.openRepository, async (_event, payload: unknown) => {
    await shell.openExternal(assertRepositoryUrl(payload))
  })

  ipcMain.handle(IPC.openReleases, async (_event, payload: unknown) => {
    await shell.openExternal(assertReleasesUrl(payload))
  })

  ipcMain.handle(IPC.openRelease, async (_event, payload: unknown) => {
    await shell.openExternal(assertReleaseTag(payload))
  })

  ipcMain.handle(IPC.appVersion, () => app.getVersion())

  ipcMain.handle(IPC.checkUpdates, async () => ({ current: app.getVersion(), versions: await fetchVersions() }))

  ipcMain.handle(IPC.openIssues, async (_event, payload: unknown) => {
    await shell.openExternal(issueReportUrl(payload, L().crashTitle))
  })

  ipcMain.handle(IPC.reloadWindow, (event) => {
    if (!event.sender.isDestroyed()) event.sender.reload()
  })

  ipcMain.handle(IPC.closeConfirm, (_event, payload: unknown) => {
    assertCloseConfirm(payload)
    allowClose = true
    if (pendingQuit) {
      pendingQuit = false
      app.quit()
    } else win?.close()
  })
  ipcMain.handle(IPC.setShortcuts, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') throw new Error('Некорректное сочетание')
    const item = payload as Record<string, unknown>
    accelerators = {
      open: assertAccelerator(item.open),
      folder: assertAccelerator(item.folder),
      openFile: assertAccelerator(item.openFile),
      formatBadges: assertAccelerator(item.formatBadges),
      save: assertAccelerator(item.save),
      undo: assertAccelerator(item.undo),
      redo: assertAccelerator(item.redo)
    }
    buildMenu()
  })

  ipcMain.handle(IPC.setLocale, (_event, payload: unknown) => {
    locale = payload === 'en' ? 'en' : 'ru'
    buildMenu()
  })
  ipcMain.handle(IPC.getAppSettings, () => ({ settings: readAppSettings(), hardwareAccelerationLive: hardwareLive }))
  ipcMain.handle(IPC.setAppSettings, (_event, payload: unknown) => {
    const settings = writeAppSettings(assertAppSettings(payload))
    applyLiveSettings(settings)
    return { settings, hardwareAccelerationLive: hardwareLive }
  })
  ipcMain.handle(IPC.loadLanguagePack, async () => {
    const picked = await dialog.showOpenDialog({
      title: L().settingsPackLoad,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    const filePath = picked.filePaths[0]
    const info = await stat(filePath)
    if (!info.isFile() || info.size > 200_000) throw new Error('Некорректный языковой пакет')
    try {
      return parseLanguagePack(JSON.parse(await readFile(filePath, 'utf8')))
    } catch {
      throw new Error('Некорректный языковой пакет')
    }
  })
  ipcMain.handle(IPC.historyGet, () => readHistory())
  ipcMain.handle(IPC.historyPush, (_event, payload: Partial<HistoryMap>) => {
    if (!payload || typeof payload !== 'object') throw new Error('Некорректная история')
    return pushHistory(payload)
  })
}

registerMediaScheme()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  app.whenReady().then(() => {
    installCsp()
    installMediaProtocol()
    buildMenu()
    registerIpc()
    applyLiveSettings(readAppSettings())
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('before-quit', () => {
    quitting = true
  })
  // macOS: приложение живёт без окон, окно возвращает activate
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

export {}