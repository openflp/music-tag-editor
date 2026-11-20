import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { thumbBox } from '@/shared/ui/scroll-metrics'

function useAxisScroll(watch: string, extent: number | undefined, smooth: boolean) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const railY = useRef<HTMLDivElement>(null)
  const railX = useRef<HTMLDivElement>(null)
  const thumbY = useRef<HTMLDivElement>(null)
  const thumbX = useRef<HTMLDivElement>(null)
  const hideTimer = useRef(0)
  const drag = useRef<{ axis: 'x' | 'y'; pointer: number; start: number } | null>(null)
  const overThumb = useRef(false)
  const overBody = useRef(false)
  const barOnRef = useRef(false)
  const extentRef = useRef(extent)
  const smoothRef = useRef(smooth)
  const shown = useRef({ h: 0, w: 0 })
  const metrics = useRef({ viewH: 0, viewW: 0, railH: 0, railW: 0 })
  const scrollPos = useRef({ top: 0, left: 0 })
  const raf = useRef(0)
  const [overflow, setOverflow] = useState({ x: false, y: false })
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const [barOn, setBarOn] = useState(false)
  extentRef.current = extent
  smoothRef.current = smooth

  const measure = () => {
    const el = bodyRef.current
    if (!el) return
    metrics.current.viewH = el.clientHeight
    metrics.current.viewW = el.clientWidth
    scrollPos.current.top = el.scrollTop
    scrollPos.current.left = el.scrollLeft
    if (railY.current) metrics.current.railH = railY.current.clientHeight
    if (railX.current) metrics.current.railW = railX.current.clientWidth
  }

  const placeNow = () => {
    const el = bodyRef.current
    const viewH = metrics.current.viewH
    const viewW = metrics.current.viewW
    if (viewH <= 0 && viewW <= 0) return
    const known = extentRef.current
    // Известная высота (число строк) не требует scrollHeight: измеренный DOM прыгает на каждой пачке.
    const contentH = known ?? el?.scrollHeight ?? 0
    const contentW = known == null && el ? el.scrollWidth : viewW
    const scrollTop = scrollPos.current.top
    const scrollLeft = scrollPos.current.left
    const maxY = contentH - viewH
    const maxX = contentW - viewW
    const next = { y: maxY > 1, x: maxX > 1 }
    const edge = { top: next.y && scrollTop > 1, bottom: next.y && scrollTop < maxY - 1 }
    setOverflow((prev) => (prev.x === next.x && prev.y === next.y ? prev : next))
    setEdges((prev) => (prev.top === edge.top && prev.bottom === edge.bottom ? prev : edge))
    const yThumb = thumbY.current
    const railH = metrics.current.railH
    if (next.y && yThumb && railH > 0) {
      const target = thumbBox(viewH, contentH, railH, scrollTop)
      let height = target.height
      if (!drag.current && smoothRef.current && shown.current.h > 0 && Math.abs(target.height - shown.current.h) > 4) {
        height = shown.current.h + (target.height - shown.current.h) * 0.35
        if (Math.abs(height - target.height) > 0.6) schedule()
      }
      shown.current.h = height
      const y = target.max > 0 ? (scrollTop / target.max) * Math.max(0, railH - height) : 0
      yThumb.style.height = `${height}px`
      yThumb.style.transform = `translateY(${y}px)`
    }
    const xThumb = thumbX.current
    const railW = metrics.current.railW
    if (next.x && xThumb && railW > 0 && known == null) {
      const target = thumbBox(viewW, contentW, railW, scrollLeft)
      shown.current.w = target.height
      xThumb.style.width = `${target.height}px`
      xThumb.style.transform = `translateX(${target.y}px)`
    }
  }

  const schedule = () => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      placeNow()
    })
  }

  const reveal = () => {
    const el = bodyRef.current
    if (!el) return
    const viewH = metrics.current.viewH || el.clientHeight
    const contentH = extentRef.current ?? el.scrollHeight
    const canY = contentH - viewH > 1
    const canX = extentRef.current == null && el.scrollWidth - el.clientWidth > 1
    if (!canY && !canX) return
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

  const latest = useRef({ measure, schedule, reveal, placeNow })
  latest.current = { measure, schedule, reveal, placeNow }

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onScroll = () => {
      scrollPos.current.top = el.scrollTop
      scrollPos.current.left = el.scrollLeft
      latest.current.schedule()
      latest.current.reveal()
    }
    const onEnter = () => {
      overBody.current = true
      latest.current.reveal()
    }
    const onLeave = () => {
      overBody.current = false
      latest.current.reveal()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    const observer = new ResizeObserver(() => {
      latest.current.measure()
      latest.current.placeNow()
    })
    observer.observe(el)
    latest.current.measure()
    latest.current.placeNow()
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      observer.disconnect()
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [watch, overflow.x, overflow.y])

  useLayoutEffect(() => {
    latest.current.schedule()
  }, [extent, smooth])

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimer.current)
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
      const railH = metrics.current.railH
      const viewH = metrics.current.viewH
      if (railH <= 0 || viewH <= 0) return
      const contentH = extentRef.current ?? el.scrollHeight
      const max = contentH - viewH
      const travel = Math.max(1, railH - shown.current.h)
      el.scrollTop = state.start + ((event.clientY - state.pointer) / travel) * max
      return
    }
    const railW = metrics.current.railW
    const viewW = metrics.current.viewW
    if (railW <= 0 || viewW <= 0) return
    const max = el.scrollWidth - viewW
    const travel = Math.max(1, railW - shown.current.w)
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
  extent,
  smooth = false,
  children
}: {
  className?: string
  watch: string
  shade?: boolean
  extent?: number
  smooth?: boolean
  children: (ref: RefObject<HTMLDivElement | null>) => ReactNode
}) {
  const scroll = useAxisScroll(watch, extent, smooth)
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
