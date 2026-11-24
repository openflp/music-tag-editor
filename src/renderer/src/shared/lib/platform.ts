// @/shared/lib/platform.ts
type Platform = NodeJS.Platform

export const platform: Platform =
  (typeof window !== 'undefined' ? window.musicTagEditor?.platform : undefined) ?? 'win32'

export const isMac = platform === 'darwin'
export const isLinux = platform === 'linux'
export const isWindows = platform === 'win32'
