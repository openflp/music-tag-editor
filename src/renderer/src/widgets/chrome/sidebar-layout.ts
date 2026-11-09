const SIDEBAR_OPEN_KEY = 'mte.layout.sidebarOpen'

export function readSidebarOpen(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_OPEN_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    // private mode / missing storage
  }
  return true
}

export function writeSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, open ? '1' : '0')
  } catch {
    // ignore
  }
}

const PLAYER_OPEN_KEY = 'mte.layout.playerOpen'

export function readPlayerOpen(): boolean {
  try {
    const raw = localStorage.getItem(PLAYER_OPEN_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    // private mode / missing storage
  }
  return true
}

export function writePlayerOpen(open: boolean): void {
  try {
    localStorage.setItem(PLAYER_OPEN_KEY, open ? '1' : '0')
  } catch {
    // ignore
  }
}
