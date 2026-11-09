import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'

function useAxisScroll(watch: string) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const railY = useRef<HTMLDivElement>(null)
  const railX = useRef<HTMLDivElement>(null)
  const thumbY = useRef<HTMLDivElement>(null)
  const thumbX = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const ids = useRef({ y: '', x: '' })
  const hideTimer = useRef(0)
  const drag = useRef<{ axis: 'x' | 'y'; pointer: number; start: number } | null>(null)
  const overThumb = useRef(false)
  const overBody = useRef(false)
  const barOnRef = useRef(false)
  const [overflow, setOverflow] = useState({ x: false, y: false })
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const [barOn, setBarOn] = useState(false)

  if (!ids.current.y) {
    const token = Math.random().toString(36).slice(2, 8)
    ids.current = { y: `cmd-thumb-y-${token}`, x: `cmd-thumb-x-${token}` }
  }

  const place = () => {
    const el = bodyRef.current
    if (!el) return
    const maxY = el.scrollHeight - el.clientHeight
    const maxX = el.scrollWidth - el.clientWidth
    const next = { y: maxY > 1, x: maxX > 1 }
    const edge = { top: next.y && el.scrollTop > 1, bottom: next.y && el.scrollTop < maxY - 1 }
    setOverflow((prev) => (prev.x === next.x && prev.y === next.y ? prev : next))
    setEdges((prev) => (prev.top === edge.top && prev.bottom === edge.bottom ? prev : edge))
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    const yRail = railY.current
    const yThumb = thumbY.current
    const xRail = railX.current
    const xThumb = thumbX.current
    let yRule = ''
    let xRule = ''
    if (next.y && yRail && yThumb) {
      const track = yRail.clientHeight
      const height = Math.max(28, Math.min(track, (el.clientHeight / el.scrollHeight) * track))
      const y = (el.scrollTop / Math.max(1, maxY)) * Math.max(0, track - height)
      yRule = `#${ids.current.y}{height:${height}px;transform:translateY(${y}px)}`
    }
    if (next.x && xRail && xThumb) {
      const track = xRail.clientWidth
      const width = Math.max(28, Math.min(track, (el.clientWidth / el.scrollWidth) * track))
      const x = (el.scrollLeft / Math.max(1, maxX)) * Math.max(0, track - width)
      xRule = `#${ids.current.x}{width:${width}px;transform:translateX(${x}px)}`
    }
    sheetRef.current.replaceSync(`${yRule}${xRule}`)
  }

  const reveal = () => {
    const el = bodyRef.current
    if (!el) return
    const can = el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1
    if (!can) return
    if (!barOnRef.current) {
      barOnRef.current = true
      setBarOn(true)
    }
    window.clearTimeout(hideTimer.current)
    if (overBody.current || overThumb.current || drag.current) return
    hideTimer.current = window.setTimeout(() => {
      if (overBody.current || overThumb.current || drag.current) return
      barOnRef.current = false
      setBarOn(false)
    }, 800)
  }

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    place()
    const onScroll = () => {
      place()
      reveal()
    }
    const onEnter = () => {
      overBody.current = true
      reveal()
    }
    const onLeave = () => {
      overBody.current = false
      reveal()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    const observer = new ResizeObserver(() => place())
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      observer.disconnect()
    }
  }, [watch, overflow.x, overflow.y])

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimer.current)
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  const onThumbDown = (axis: 'x' | 'y') => (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = bodyRef.current
    if (!el) return
    drag.current = { axis, pointer: axis === 'y' ? event.clientY : event.clientX, start: axis === 'y' ? el.scrollTop : el.scrollLeft }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.currentTarget.classList.add('dragging')
    reveal()
  }

  const onThumbMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const el = bodyRef.current
    if (!state || !el) return
    if (state.axis === 'y') {
      const rail = railY.current
      const thumb = thumbY.current
      if (!rail || !thumb) return
      const max = el.scrollHeight - el.clientHeight
      const travel = Math.max(1, rail.clientHeight - thumb.getBoundingClientRect().height)
      el.scrollTop = state.start + ((event.clientY - state.pointer) / travel) * max
      return
    }
    const rail = railX.current
    const thumb = thumbX.current
    if (!rail || !thumb) return
    const max = el.scrollWidth - el.clientWidth
    const travel = Math.max(1, rail.clientWidth - thumb.getBoundingClientRect().width)
    el.scrollLeft = state.start + ((event.clientX - state.pointer) / travel) * max
  }

  const onThumbUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null
    event.currentTarget.classList.remove('dragging')
    reveal()
  }

  const rails = (
    <>
      {overflow.y ? (
        <div ref={railY} className={barOn ? `cmd-rail cmd-rail-y live${overflow.x ? ' cross' : ''}` : `cmd-rail cmd-rail-y${overflow.x ? ' cross' : ''}`}>
          <div
            id={ids.current.y}
            ref={thumbY}
            className="cmd-thumb-y"
            onPointerDown={onThumbDown('y')}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerEnter={() => {
              overThumb.current = true
            }}
            onPointerLeave={() => {
              overThumb.current = false
              reveal()
            }}
          />
        </div>
      ) : null}
      {overflow.x ? (
        <div ref={railX} className={barOn ? `cmd-rail cmd-rail-x live${overflow.y ? ' cross' : ''}` : `cmd-rail cmd-rail-x${overflow.y ? ' cross' : ''}`}>
          <div
            id={ids.current.x}
            ref={thumbX}
            className="cmd-thumb-x"
            onPointerDown={onThumbDown('x')}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerEnter={() => {
              overThumb.current = true
            }}
            onPointerLeave={() => {
              overThumb.current = false
              reveal()
            }}
          />
        </div>
      ) : null}
    </>
  )

  return { bodyRef, rails, edges }
}

export function AxisScroll({
  className,
  watch,
  shade,
  children
}: {
  className?: string
  watch: string
  shade?: boolean
  children: (ref: RefObject<HTMLDivElement | null>) => ReactNode
}) {
  const scroll = useAxisScroll(watch)
  return (
    <div className={className ? `cmd-scroll ${className}` : 'cmd-scroll'}>
      {children(scroll.bodyRef)}
      {shade ? (
        <>
          <div className={scroll.edges.top ? 'cmd-edge top on' : 'cmd-edge top'} />
          <div className={scroll.edges.bottom ? 'cmd-edge bottom on' : 'cmd-edge bottom'} />
        </>
      ) : null}
      {scroll.rails}
    </div>
  )
}
