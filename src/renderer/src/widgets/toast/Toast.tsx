import { useEffect, useRef } from 'react'
import { useEditor } from '@/features/editor/model/store'
import { AlertIcon, CheckIcon, CloseIcon } from '@/shared/ui/icons'
import { tr, useI18n } from '@/shared/i18n'

export function Toast() {
  const toast = useEditor((state) => state.toast)
  const dismissToast = useEditor((state) => state.dismissToast)
  const holdToast = useEditor((state) => state.holdToast)
  const resumeToast = useEditor((state) => state.resumeToast)
  const { pack } = useI18n()
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cardRef.current?.matches(':hover')) holdToast()
  }, [toast, holdToast])

  if (!toast) return null
  const ok = toast.kind === 'ok'
  return (
    <div className="toasts">
      <div
        key={toast.id}
        ref={cardRef}
        className={ok ? 'toast ok' : 'toast err'}
        role="status"
        onPointerEnter={holdToast}
        onPointerLeave={resumeToast}
      >
        <span className="toast-ico">{ok ? <CheckIcon /> : <AlertIcon />}</span>
        <div className="toast-copy">
          <strong>{ok ? pack.done : pack.failed}</strong>
          <p>{tr(toast.text)}</p>
        </div>
        <button type="button" className="icon-btn" aria-label={pack.closeToast} onClick={dismissToast}>
          <CloseIcon />
        </button>
        <span className="toast-bar" />
      </div>
    </div>
  )
}
