import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function FadeText({ children, className, side = 'end' }: { children: ReactNode; className?: string; side?: 'end' | 'start' }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [fade, setFade] = useState(false)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setFade(node.scrollWidth - node.clientWidth > 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [children])

  return (
    <span ref={ref} className={className ? `fade-text ${className}` : 'fade-text'} data-fade={fade ? 'true' : 'false'} data-side={side}>
      {children}
    </span>
  )
}
