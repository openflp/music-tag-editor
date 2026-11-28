import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Плавное появление и исчезновение блока: высота, прозрачность и размытие
 * (стили — .settings-collapse). После ухода блок размонтируется.
 * onSettled вызывается, когда высота устоялась: родитель может пересчитать прокрутку и тени.
 */
export function Collapse({
  open,
  innerClassName,
  onSettled,
  children
}: {
  open: boolean
  innerClassName?: string
  onSettled?: () => void
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled
  const first = useRef(true)
  useEffect(() => {
    const initial = first.current
    first.current = false
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      const done = initial ? undefined : window.setTimeout(() => settledRef.current?.(), 320)
      return () => {
        cancelAnimationFrame(frame)
        if (done !== undefined) window.clearTimeout(done)
      }
    }
    setShown(false)
    if (initial) return
    const timer = window.setTimeout(() => {
      setMounted(false)
      settledRef.current?.()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [open])
  if (!mounted) return null
  return (
    <div className="settings-collapse" data-open={shown} aria-hidden={shown ? undefined : true}>
      <div className={innerClassName}>{children}</div>
    </div>
  )
}
