import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

// Раньше каждый FadeText держал useState(fade) + свой ResizeObserver и читал размеры прямо в layout-эффекте.
// На списке из 30+ строк это десятки sync-обновлений в одном коммите (setFade из layout-эффекта) и десятки
// принудительных пересчётов раскладки при каждом появлении строки при прокрутке — отсюда «Maximum update depth»
// и тяжёлая прокрутка. Теперь: без React-состояния, один общий ResizeObserver, все чтения размеров идут пачкой
// и только потом все записи (без layout thrashing). Атрибут data-fade пишется прямо в DOM; CSS смотрит только на 'true'.

const pending = new Set<HTMLElement>()
let scheduled = false
let shared: ResizeObserver | null = null

function flush(): void {
  scheduled = false
  if (!pending.size) return
  const batch = [...pending]
  pending.clear()
  const overflowing = batch.map((node) => node.isConnected && node.scrollWidth - node.clientWidth > 1)
  batch.forEach((node, index) => {
    const next = overflowing[index] ? 'true' : 'false'
    if (node.dataset.fade !== next) node.dataset.fade = next
  })
}

function queue(node: HTMLElement): void {
  pending.add(node)
  if (scheduled) return
  scheduled = true
  queueMicrotask(flush)
}

function observer(): ResizeObserver {
  if (!shared) {
    shared = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target instanceof HTMLElement) pending.add(entry.target)
      }
      flush()
    })
  }
  return shared
}

export function FadeText({ children, className, side = 'end' }: { children: ReactNode; className?: string; side?: 'end' | 'start' }) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const watcher = observer()
    watcher.observe(node)
    return () => {
      watcher.unobserve(node)
      pending.delete(node)
    }
  }, [])

  // изменился текст без изменения ширины узла — ResizeObserver не сработает, перемеряем сами
  useEffect(() => {
    const node = ref.current
    if (node) queue(node)
  }, [children])

  return (
    <span ref={ref} className={className ? `fade-text ${className}` : 'fade-text'} data-side={side}>
      {children}
    </span>
  )
}