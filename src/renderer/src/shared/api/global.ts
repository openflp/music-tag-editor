import type { MusicApi } from './window'

declare global {
  interface Window {
    musicTagEditor: MusicApi
  }
}

export {}
