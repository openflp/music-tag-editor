/** Скрывать хвост меню, как в VS Code: кнопка «…» не входит в поток пунктов. */
export const TITLEBAR_MENU_HAMBURGER_HIDDEN_MIN = 5

export function packTitlebarMenuOverflow(input: {
  itemWidths: number[]
  available: number
  overflowWidth: number
  gap?: number
  hamburgerHiddenMin?: number
}): { shown: number; used: number } {
  const widths = input.itemWidths
  const available = Math.max(0, input.available)
  const gap = input.gap ?? 0
  const hamburgerHiddenMin = input.hamburgerHiddenMin ?? TITLEBAR_MENU_HAMBURGER_HIDDEN_MIN
  let used = 0
  let shown = 0
  for (const width of widths) {
    const next = shown === 0 ? width : used + gap + width
    if (next > available) break
    used = next
    shown += 1
  }
  if (shown === widths.length) return { shown, used }
  while (shown > 0 && used + gap + input.overflowWidth > available) {
    shown -= 1
    used -= widths[shown] ?? 0
    if (shown > 0) used -= gap
  }
  const hidden = widths.length - shown
  if (hidden >= hamburgerHiddenMin) return { shown: 0, used: 0 }
  return { shown, used: Math.max(0, used) }
}
