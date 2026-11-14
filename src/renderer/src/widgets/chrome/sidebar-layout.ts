const SIDEBAR_OPEN_KEY = 'mte.layout.sidebarOpen'
const PLAYER_OPEN_KEY = 'mte.layout.playerOpen'
const SIDEBAR_WIDTH_KEY = 'mte.layout.sidebarWidth'

export const SIDEBAR_WIDTH_DEFAULT = 300

function readFlag(key: string): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    // private mode / missing storage
  }
  return true
}

function writeFlag(key: string, open: boolean): void {
  try {
    localStorage.setItem(key, open ? '1' : '0')
  } catch {
    // ignore
  }
}

export const readSidebarOpen = (): boolean => readFlag(SIDEBAR_OPEN_KEY)
export const writeSidebarOpen = (open: boolean): void => writeFlag(SIDEBAR_OPEN_KEY, open)
export const readPlayerOpen = (): boolean => readFlag(PLAYER_OPEN_KEY)
export const writePlayerOpen = (open: boolean): void => writeFlag(PLAYER_OPEN_KEY, open)

// Raw value: SidebarResizer clamps it to its own min/max on mount.
export function readSidebarWidth(): number {
  try {
    const value = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    if (Number.isFinite(value) && value > 0) return Math.round(value)
  } catch {
    // private mode / missing storage
  }
  return SIDEBAR_WIDTH_DEFAULT
}

export function writeSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // ignore
  }
}