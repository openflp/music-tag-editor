export const TITLEBAR_BACKGROUND = '#141414'
export const TITLEBAR_FOREGROUND = '#f5f5f7'
export const TITLEBAR_HOVER = '#2a2a2a'
export const TITLEBAR_OVERLAY_HEIGHT = 34
export const TITLEBAR_SEARCH_MAX_WIDTH_PX = 480
export const TITLEBAR_SEARCH_MIN_WIDTH_PX = 60
export const TITLEBAR_SEARCH_WIDTH_VW = 0.38
/** Gear button plus its padding, reserved so the search stays centered. */
export const TITLEBAR_SETTINGS_WIDTH_PX = 40
/** Sidebar toggle next to settings, always reserved in the titlebar. */
export const TITLEBAR_SIDEBAR_TOGGLE_WIDTH_PX = 30
/** Player toggle next to the sidebar toggle, always reserved in the titlebar. */
export const TITLEBAR_PLAYER_TOGGLE_WIDTH_PX = 30
export const TITLEBAR_OVERLAY_FALLBACK_PX = 138
export const WINDOW_MIN_WIDTH = 760
export const WINDOW_MIN_HEIGHT = 560

export const TITLEBAR_LEFT_ID = 'mte-titlebar-left'
export const TITLEBAR_CENTER_ID = 'mte-titlebar-center'
export const TITLEBAR_RIGHT_ID = 'mte-titlebar-right'

const REGION_COLUMNS =
  'minmax(0, 1fr) minmax(0, 1fr) minmax(calc(var(--mte-settings-width, 40px) + var(--mte-sidebar-toggle-width, 30px) + var(--mte-player-toggle-width, 30px) + var(--mte-overlay-width, 138px) + var(--mte-window-controls-width, 0px)), 1fr)'

function region(id: string): HTMLDivElement {
  const existing = document.getElementById(id)
  if (existing instanceof HTMLDivElement) return existing
  const node = document.createElement('div')
  node.id = id
  return node
}

function isRegion(node: Element): boolean {
  return node.id === TITLEBAR_LEFT_ID || node.id === TITLEBAR_CENTER_ID || node.id === TITLEBAR_RIGHT_ID
}

function isDragRegion(node: { classList?: { contains: (name: string) => boolean } }): boolean {
  return Boolean(node.classList?.contains('cet-drag-region'))
}

export function titlebarOverlayWidthPx(windowWidth: number, areaX: number, areaWidth: number): number {
  return Math.max(0, Math.round(windowWidth - areaX - areaWidth))
}

export function titlebarInFlowWindowControlsPx(overlay: number, measuredControlsWidth: number): number {
  if (overlay > 0) return 0
  return Math.max(0, Math.round(measuredControlsWidth))
}

export function titlebarRightReservePx(settings: number, overlay: number, inFlowWindowControls: number): number {
  return settings + overlay + inFlowWindowControls
}

export function ensureTitlebarRegions(bar: HTMLElement): {
  left: HTMLDivElement
  center: HTMLDivElement
  right: HTMLDivElement
} {
  bar.style.display = 'grid'
  bar.style.gridTemplateColumns = REGION_COLUMNS
  bar.style.alignItems = 'center'
  bar.style.justifyContent = 'stretch'
  const left = region(TITLEBAR_LEFT_ID)
  const center = region(TITLEBAR_CENTER_ID)
  const right = region(TITLEBAR_RIGHT_ID)
  const icon = bar.querySelector('.cet-icon, .window-appicon')
  const controls = bar.querySelector('.cet-window-controls')
  if (icon instanceof HTMLElement && icon.parentElement !== left) left.prepend(icon)
  if (controls instanceof HTMLElement && controls.parentElement !== right) right.append(controls)
  const drag = bar.querySelector('.cet-drag-region')
  if (drag instanceof HTMLElement) {
    drag.style.display = ''
    drag.removeAttribute('aria-hidden')
    bar.prepend(drag)
  }
  for (const child of [...bar.children]) {
    if (!(child instanceof HTMLElement) || isRegion(child) || isDragRegion(child)) continue
    child.style.display = 'none'
    child.setAttribute('aria-hidden', 'true')
  }
  if (left.parentElement !== bar || center.parentElement !== bar || right.parentElement !== bar) {
    bar.append(left, center, right)
  } else if (left.nextElementSibling !== center || center.nextElementSibling !== right) {
    bar.append(left, center, right)
  }
  return { left, center, right }
}

export function syncTitlebarOverlayVars(
  root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement
): number {
  if (!root || typeof document === 'undefined') return TITLEBAR_OVERLAY_FALLBACK_PX
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:fixed;left:env(titlebar-area-x,0px);width:env(titlebar-area-width,100%);top:0;height:0;pointer-events:none;visibility:hidden'
  document.documentElement.append(probe)
  const overlay = titlebarOverlayWidthPx(window.innerWidth, probe.offsetLeft, probe.offsetWidth)
  probe.remove()
  const controls = document.querySelector('.cet-window-controls')
  let measured = 0
  if (controls instanceof HTMLElement) {
    if (overlay > 0) {
      controls.style.display = 'none'
      controls.setAttribute('aria-hidden', 'true')
    } else {
      controls.style.display = ''
      controls.removeAttribute('aria-hidden')
      measured = controls.offsetWidth
    }
  }
  const windowControls = titlebarInFlowWindowControlsPx(overlay, measured)
  root.style.setProperty('--mte-overlay-width', `${overlay}px`)
  root.style.setProperty('--mte-settings-width', `${TITLEBAR_SETTINGS_WIDTH_PX}px`)
  root.style.setProperty('--mte-sidebar-toggle-width', `${TITLEBAR_SIDEBAR_TOGGLE_WIDTH_PX}px`)
  root.style.setProperty('--mte-player-toggle-width', `${TITLEBAR_PLAYER_TOGGLE_WIDTH_PX}px`)
  root.style.setProperty('--mte-window-controls-width', `${windowControls}px`)
  return overlay
}