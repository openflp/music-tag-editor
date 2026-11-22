import { useI18n } from '@/shared/i18n'
import { useAudioAnalysis } from './use-audio-analysis'

export function RhythmBar({ filePath }: { filePath: string }) {
  const { pack } = useI18n()
  const { loading, error, result, saving, save } = useAudioAnalysis(filePath)
  const bpm = result ? `${result.bpm.toFixed(1)} BPM` : 'BPM'
  const camelot = result?.camelot || result?.key || '—'
  return (
    <div className="rhythm-bar">
      <span className="badge">{loading ? '…' : bpm}</span>
      <span className="badge">{loading ? '…' : camelot}</span>
      <button type="button" className="btn" disabled={!result || loading || saving} onClick={() => void save()}>
        {pack.saveRhythm}
      </button>
      {error ? <span className="rhythm-error">{error}</span> : null}
    </div>
  )
}
