import { TitlebarColor, createTitlebarOnDOMContentLoaded, type CustomTitlebar } from 'custom-electron-titlebar'
import { packFor, type LocaleId } from '@shared/i18n'
import {
  TITLEBAR_BACKGROUND,
  TITLEBAR_FOREGROUND,
  TITLEBAR_HOVER,
  TITLEBAR_OVERLAY_HEIGHT,
  TITLEBAR_SEARCH_MAX_WIDTH_PX,
  TITLEBAR_SEARCH_MIN_WIDTH_PX,
  TITLEBAR_SEARCH_WIDTH_VW,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  ensureTitlebarRegions,
  syncTitlebarOverlayVars
} from '@shared/titlebar'

function resolveTitlebarIconUrl(): string | undefined {
  try {
    const href = (globalThis as { location?: { href: string } }).location?.href
    if (!href) return undefined
    return new URL('app-icon.svg', href).href
  } catch {
    return undefined
  }
}

function applyTitlebarHeight(bar: CustomTitlebar): void {
  const px = `${TITLEBAR_OVERLAY_HEIGHT}px`
  const root = bar.titlebarElement
  root.style.height = px
  root.style.minHeight = px
  root.style.maxHeight = px
  root.style.lineHeight = '1'
  root.style.boxShadow = 'none'
  root.style.borderBottom = 'none'
  root.style.setProperty('--mte-titlebar-search-min', `${TITLEBAR_SEARCH_MIN_WIDTH_PX}px`)
  root.style.setProperty('--mte-titlebar-search-max', `${TITLEBAR_SEARCH_MAX_WIDTH_PX}px`)
  root.style.setProperty('--mte-titlebar-search-vw', `${TITLEBAR_SEARCH_WIDTH_VW * 100}vw`)
  const container = bar.containerElement
  container.style.top = px
  container.style.borderTop = 'none'
  container.style.overflow = 'hidden'
  const controls = root.querySelector('.cet-window-controls')
  const icon = root.querySelector('.cet-icon')
  if (controls instanceof HTMLElement) controls.style.height = px
  if (icon instanceof HTMLElement) icon.style.height = px
  bar.titleElement.style.display = 'none'
  root.removeAttribute('aria-hidden')
  ensureTitlebarRegions(root)
  syncTitlebarOverlayVars()
}

function storedLocale(): LocaleId {
  try {
    return localStorage.getItem('mte.locale') === 'en' ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

function windowTips(locale: LocaleId) {
  const text = packFor(locale)
  return { minimize: text.winMin, maximize: text.winMax, restoreDown: text.winRestore, close: text.winClose }
}

function applyWindowTips(bar: CustomTitlebar, locale: LocaleId): void {
  const tips = windowTips(locale)
  const host = bar as unknown as {
    currentOptions?: { tooltips?: typeof tips }
    controls?: { minimize?: HTMLElement; maximize?: HTMLElement; close?: HTMLElement }
  }
  if (host.currentOptions) host.currentOptions.tooltips = tips
  if (host.controls?.minimize) host.controls.minimize.title = tips.minimize
  if (host.controls?.close) host.controls.close.title = tips.close
  const maximize = host.controls?.maximize
  if (!maximize) return
  const restored = maximize.title === 'Восстановить' || maximize.title === 'Restore'
  maximize.title = restored ? tips.restoreDown : tips.maximize
}

export function initCustomTitlebar(): void {
  const titlebarIcon = resolveTitlebarIconUrl()
  const locale = storedLocale()
  void createTitlebarOnDOMContentLoaded({
    backgroundColor: TitlebarColor.fromHex(TITLEBAR_BACKGROUND),
    menuBarBackgroundColor: TitlebarColor.fromHex(TITLEBAR_BACKGROUND),
    itemBackgroundColor: TitlebarColor.fromHex(TITLEBAR_HOVER),
    svgColor: TitlebarColor.fromHex(TITLEBAR_FOREGROUND),
    ...(titlebarIcon ? { icon: titlebarIcon, iconSize: 16 as const } : {}),
    menuSeparatorColor: TitlebarColor.fromHex(TITLEBAR_HOVER),
    menuPosition: 'left',
    removeMenuBar: true,
    enableMnemonics: false,
    unfocusEffect: false,
    titleHorizontalAlignment: 'left',
    shadow: false,
    containerOverflow: 'hidden',
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    tooltips: windowTips(locale)
  }).then((bar) => {
    applyTitlebarHeight(bar)
    window.addEventListener('mte-locale', (event) => {
      const next = (event as CustomEvent).detail === 'en' ? 'en' : 'ru'
      applyWindowTips(bar, next)
    })
    window.addEventListener('resize', () => {
      syncTitlebarOverlayVars()
    })
    bar.onWindowFullScreen = (fullscreen: boolean) => {
      document.documentElement.toggleAttribute('data-titlebar-fullscreen', fullscreen)
      applyTitlebarHeight(bar)
    }
    const onMenuPosition = bar.updateMenuPosition.bind(bar)
    bar.updateMenuPosition = (position) => {
      const result = onMenuPosition(position)
      applyTitlebarHeight(bar)
      return result
    }
  })
}
