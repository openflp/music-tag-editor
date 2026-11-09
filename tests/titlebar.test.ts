import { titlebarInFlowWindowControlsPx, titlebarOverlayWidthPx, titlebarRightReservePx } from '@shared/titlebar'

describe('titlebar overlay', () => {
  it('measures the native caption buttons from the titlebar area', () => {
    expect(titlebarOverlayWidthPx(1200, 0, 1062)).toBe(138)
    expect(titlebarOverlayWidthPx(800, 0, 800)).toBe(0)
  })

  it('hides in-flow buttons when the system overlay is present', () => {
    expect(titlebarInFlowWindowControlsPx(138, 140)).toBe(0)
    expect(titlebarInFlowWindowControlsPx(0, 138)).toBe(138)
  })

  it('reserves settings, overlay and drawn buttons on the right', () => {
    expect(titlebarRightReservePx(40, 138, 0)).toBe(178)
    expect(titlebarRightReservePx(40, 0, 138)).toBe(178)
  })
})
