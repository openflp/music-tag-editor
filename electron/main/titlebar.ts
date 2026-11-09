import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserWindow } from 'electron'
import { setupTitlebarAndAttachToWindow } from 'custom-electron-titlebar/main'
import {
  TITLEBAR_BACKGROUND,
  TITLEBAR_FOREGROUND,
  TITLEBAR_OVERLAY_HEIGHT,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH
} from '@shared/titlebar'

const mainDir = fileURLToPath(new URL('.', import.meta.url))

export function resolveTitlebarThemePath(): string {
  const bundled = join(mainDir, 'titlebar.theme.json')
  if (existsSync(bundled)) return bundled
  return join(process.cwd(), 'electron/main/titlebar.theme.json')
}

function overlayOptions() {
  return {
    color: TITLEBAR_BACKGROUND,
    symbolColor: TITLEBAR_FOREGROUND,
    height: TITLEBAR_OVERLAY_HEIGHT
  }
}

function pinTitlebarOverlayHeight(window: BrowserWindow): void {
  if (process.platform !== 'win32' || typeof window.setTitleBarOverlay !== 'function') return
  const native = window.setTitleBarOverlay.bind(window)
  window.setTitleBarOverlay = (options) => {
    const next = options && typeof options === 'object' ? options : {}
    return native({ ...next, ...overlayOptions() })
  }
  try {
    window.setTitleBarOverlay(overlayOptions())
  } catch {
    // Overlay exists only on Windows. Other platforms use the titlebar buttons.
  }
}

export function attachTitlebar(window: BrowserWindow): Promise<() => void> {
  pinTitlebarOverlayHeight(window)
  return setupTitlebarAndAttachToWindow(window, {
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    themeConfigPath: resolveTitlebarThemePath()
  })
}
