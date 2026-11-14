import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '@/shared/i18n'

export interface CrashInfo {
  message: string
  stack: string
}

function describeError(error: unknown): CrashInfo {
  if (error instanceof Error) {
    const message = error.message.trim()
    const title = error.name && message && error.name !== 'Error' ? `${error.name}: ${message}` : message || error.name
    return { message: title, stack: error.stack?.trim() ?? '' }
  }
  if (typeof error === 'string') return { message: error.trim(), stack: '' }
  return { message: '', stack: '' }
}

function reportText(info: CrashInfo): string {
  return [info.message, info.stack].filter(Boolean).join('\n\n')
}

export function CrashScreen({ info }: { info: CrashInfo }) {
  const { pack } = useI18n()
  const message = info.message || pack.crashUnknown
  const details = [message, info.stack].filter(Boolean).join('\n\n')
  return (
    <div className="crash-screen" role="alert">
      <div className="crash-card">
        <h1>{pack.crashTitle}</h1>
        <p>{pack.crashLead}</p>
        <h2>{pack.crashDetails}</h2>
        <pre className="crash-details">{details}</pre>
        <div className="crash-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              if (window.musicTagEditor) void window.musicTagEditor.reloadWindow()
              else window.location.reload()
            }}
          >
            {pack.crashReload}
          </button>
          <button type="button" className="btn" onClick={() => void window.musicTagEditor?.openIssues(reportText({ message, stack: info.stack }))}>
            {pack.crashReport}
          </button>
        </div>
      </div>
    </div>
  )
}

interface BoundaryState {
  info: CrashInfo | null
}

const waiting: CrashInfo[] = []
let publish: ((info: CrashInfo) => void) | null = null

function remember(error: unknown): void {
  const info = describeError(error)
  if (!info.message && !info.stack) return
  if (publish) publish(info)
  else waiting.push(info)
}

function installCrashHooks(): void {
  const host = window as Window & { __mteCrash?: boolean }
  if (host.__mteCrash) return
  host.__mteCrash = true
  window.addEventListener('error', (event) => {
    if (event.target && event.target !== window) return
    remember(event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    remember(event.reason)
  })
}

export class CrashBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { info: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { info: describeError(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const base = describeError(error)
    const stack = [base.stack, info.componentStack?.trim()].filter(Boolean).join('\n\n')
    this.setState({ info: { message: base.message, stack } })
  }

  componentDidMount(): void {
    installCrashHooks()
    publish = (info) => {
      this.setState((state) => (state.info ? state : { info }))
    }
    const queued = waiting.shift()
    if (queued) this.setState((state) => (state.info ? state : { info: queued }))
  }

  componentWillUnmount(): void {
    if (publish) publish = null
  }

  render(): ReactNode {
    if (this.state.info) return <CrashScreen info={this.state.info} />
    return this.props.children
  }
}
