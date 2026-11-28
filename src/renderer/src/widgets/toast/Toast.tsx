import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, type Toast as ToastModel } from '@/features/editor/model/store'
import { AlertIcon, CheckIcon, CloseIcon } from '@/shared/ui/icons'
import { tr, useI18n } from '@/shared/i18n'

const TOAST_EXIT_MS = 240

export function Toast() {
  const toast = useEditor((state) => state.toast)
  const dismissToast = useEditor((state) => state.dismissToast)
  const holdToast = useEditor((state) => state.holdToast)
  const resumeToast = useEditor((state) => state.resumeToast)
  const { pack } = useI18n()
  const cardRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<ToastModel | null>(toast)
  const [on, setOn] = useState(false)

  useLayoutEffect(() => {
    if (toast) setShown(toast)
  }, [toast])

  useEffect(() => {
    if (toast) {
      const frame = requestAnimationFrame(() => setOn(true))
      return () => cancelAnimationFrame(frame)
    }
    setOn(false)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setShown(null), reduce ? 0 : TOAST_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (cardRef.current?.matches(':hover')) holdToast()
  }, [toast, holdToast])

  if (!shown) return null
  const ok = shown.kind === 'ok'
  const leaving = !toast
  return createPortal(
    <div className="toasts">
      <div
        ref={cardRef}
        className={ok ? `toast ok${on ? ' on' : ''}` : `toast err${on ? ' on' : ''}`}
        role="status"
        aria-hidden={leaving ? true : undefined}
        inert={leaving ? true : undefined}
        onPointerEnter={holdToast}
        onPointerLeave={resumeToast}
      >
        <span className="toast-ico">{ok ? <CheckIcon /> : <AlertIcon />}</span>
        <div className="toast-copy">
          <strong>{ok ? pack.done : pack.failed}</strong>
          <p>{tr(shown.text)}</p>
        </div>
        <button type="button" className="icon-btn" aria-label={pack.closeToast} onClick={dismissToast}>
          <CloseIcon />
        </button>
        <span key={shown.id} className="toast-bar" />
      </div>
    </div>,
    document.body
  )
}
