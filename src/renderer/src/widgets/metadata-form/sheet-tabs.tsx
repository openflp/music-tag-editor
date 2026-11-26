import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

// 2px — gap у .sheet-tabs, 30px — ширина кнопки «…» (.sheet-tab-more)
const GAP = 2
const MORE_W = 30

type Props<T extends string> = {
  ids: readonly T[]
  labels: Record<T, string>
  active: T
  onSelect: (id: T) => void
  label: string
  moreLabel: string
}

/**
 * Вкладки, которые не поместились, уходят в меню «…» — как пункты menubar в titlebar.
 * Скрытые вкладки остаются в DOM и плавно схлопываются до нуля ширины (см. [data-overflow]),
 * поэтому их ширину всегда можно измерить, а Radix не теряет их из списка.
 * Активная вкладка не попадает в меню никогда: если она не влезает, вытесняет последнюю видимую.
 * Использовать внутри <Tabs>.
 */
export function SheetTabs<T extends string>({ ids, labels, active, onSelect, label, moreLabel }: Props<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState<readonly T[]>([])
  // естественная ширина каждой вкладки (px) — от неё анимируется min-width при показе/скрытии
  const [widths, setWidths] = useState<Record<string, number>>({})
  // плавность включаем только после первой раскладки, иначе вкладки «схлопываются» при монтировании
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setAnimate(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [])
  const key = ids.map((id) => labels[id]).join('\u0000')

  const measure = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const own = getComputedStyle(list)
    const avail = list.clientWidth - parseFloat(own.paddingLeft) - parseFloat(own.paddingRight)
    if (avail <= 0) return

    // естественная ширина вкладки: текст + её padding + border (не растянутая flex-ом)
    const widths = ids.map((id) => {
      const tab = list.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)
      const text = tab?.querySelector<HTMLElement>('.sheet-tab-label')
      if (!tab || !text) return 0
      const style = getComputedStyle(tab)
      const extra =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      return text.offsetWidth + 1 + extra
    })

    setWidths((prev) => {
      const next: Record<string, number> = {}
      ids.forEach((id, i) => {
        if (widths[i] > 0) next[id] = widths[i]
      })
      const same = Object.keys(next).length === Object.keys(prev).length && ids.every((id) => (next[id] ?? 0) === (prev[id] ?? 0))
      return same ? prev : next
    })

    const sum = (list: number[]) => list.reduce((total, i) => total + widths[i], 0) + GAP * Math.max(0, list.length - 1)
    const all = ids.map((_, i) => i)
    let shown = all

    if (sum(all) > avail) {
      const room = avail - MORE_W - GAP
      const current = Math.max(0, ids.indexOf(active))
      let pick: number[] = []
      for (const i of all) {
        if (sum([...pick, i]) > room) break
        pick.push(i)
      }
      if (!pick.includes(current)) {
        while (pick.length && sum([...pick, current]) > room) pick.pop()
        pick = [...pick, current].sort((a, b) => a - b)
      }
      shown = pick
    }

    const next = ids.filter((_, i) => !shown.includes(i))
    setHidden((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next))
  }, [ids, active])

  useLayoutEffect(() => {
    measure()
  }, [measure, key])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(list)
    list.querySelectorAll('.sheet-tab-label').forEach((node) => observer.observe(node))
    // шрифт мог догрузиться уже после первой раскладки
    void document.fonts?.ready.then(() => measure())
    return () => observer.disconnect()
  }, [measure, key])

  return (
    <TabsList ref={listRef} aria-label={label} variant="line" className="sheet-tabs" data-animate={animate ? 'true' : undefined}>
      {ids.map((id) => {
        const off = hidden.includes(id)
        return (
          <TabsTrigger
            key={id}
            value={id}
            className="sheet-tab"
            data-tab-id={id}
            data-overflow={off ? 'true' : undefined}
            style={widths[id] ? ({ '--tab-w': `${widths[id]}px` } as CSSProperties) : undefined}
            // скрытая вкладка не должна ловить фокус стрелками (Radix пропускает disabled)
            disabled={off}
            aria-hidden={off || undefined}
          >
            <span className="sheet-tab-label">{labels[id]}</span>
          </TabsTrigger>
        )
      })}
      {/* «…» всегда в DOM: при пустом списке схлопывается в ноль, а не пропадает рывком */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="sheet-tab-more"
            aria-label={moreLabel}
            data-empty={hidden.length ? undefined : 'true'}
            disabled={!hidden.length}
            aria-hidden={hidden.length ? undefined : true}
            tabIndex={hidden.length ? undefined : -1}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          {hidden.map((id) => (
            <DropdownMenuItem key={id} onSelect={() => onSelect(id)}>
              {labels[id]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TabsList>
  )
}