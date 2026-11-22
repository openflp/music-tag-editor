import { useCallback, useEffect, useState } from 'react'
import { camelotOf } from '@shared/key'
import { initialKeyOf, partsOf, roundBpm, type AnalysisResult, type StoredRhythm } from '@shared/analysis'
import { getPack } from '@/shared/i18n'
import { useEditor } from '@/features/editor/model/store'
import { monoSlice, readAudioBytes } from './decode'
import { analyzeSamples } from './worker-client'

export interface AudioAnalysisState {
  loading: boolean
  error: string | null
  result: AnalysisResult | null
  saving: boolean
  save: () => Promise<void>
}

function fromTags(bpm: number, initialKey: string): AnalysisResult {
  const parts = partsOf(initialKey)
  return {
    bpm: roundBpm(bpm),
    key: parts.key,
    scale: parts.scale,
    camelot: camelotOf(initialKey),
    initialKey
  }
}

function withDetected(stored: StoredRhythm, detected: Pick<AnalysisResult, 'bpm' | 'key' | 'scale' | 'camelot'>): AnalysisResult {
  const taggedBpm = stored.bpm && stored.bpm > 0 ? roundBpm(stored.bpm) : 0
  const taggedKey = stored.initialKey.trim()
  const analyzed: AnalysisResult = {
    ...detected,
    bpm: roundBpm(detected.bpm),
    initialKey: initialKeyOf(detected.key, detected.scale)
  }
  if (taggedBpm && taggedKey) return fromTags(taggedBpm, taggedKey)
  if (taggedBpm) return { ...analyzed, bpm: taggedBpm }
  if (taggedKey) return fromTags(analyzed.bpm, taggedKey)
  return analyzed
}

async function loadAnalysis(filePath: string): Promise<AnalysisResult> {
  const stored = await window.musicTagEditor.readRhythm(filePath)
  if (stored.bpm && stored.bpm > 0 && stored.initialKey.trim()) return fromTags(stored.bpm, stored.initialKey.trim())
  const samples = await monoSlice(await readAudioBytes(filePath))
  return withDetected(stored, await analyzeSamples(samples))
}

export function useAudioAnalysis(filePath: string | null): AudioAnalysisState {
  const noteRhythm = useEditor((state) => state.noteRhythm)
  const [loading, setLoading] = useState(Boolean(filePath))
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!filePath) {
      setLoading(false)
      setError(null)
      setResult(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setResult(null)
    setSaving(false)
    void loadAnalysis(filePath).then(
      (next) => {
        if (cancelled) return
        setResult(next)
        setLoading(false)
        const current = useEditor.getState().tracks.find((track) => track.path === filePath)
        if (!current || current.tech.bpm !== next.bpm || current.tech.key !== next.initialKey) {
          noteRhythm(filePath, next.bpm, next.initialKey)
        }
      },
      (reason: unknown) => {
        console.error(reason)
        if (cancelled) return
        setError(getPack().rhythmFail)
        setLoading(false)
      }
    )
    return () => {
      cancelled = true
    }
  }, [filePath, noteRhythm])

  const save = useCallback(async () => {
    if (!filePath || !result || saving) return
    setSaving(true)
    setError(null)
    try {
      const [written] = await window.musicTagEditor.writeTags([
        { path: filePath, patch: {}, rhythm: { bpm: result.bpm, initialKey: result.initialKey } }
      ])
      if (!written?.ok) throw new Error(written?.error || 'write')
      noteRhythm(filePath, result.bpm, result.initialKey)
      useEditor.getState().notify({ kind: 'ok', text: getPack().rhythmSaved })
    } catch (reason) {
      console.error(reason)
      setError(getPack().rhythmSaveFail)
      useEditor.getState().notify({ kind: 'err', text: getPack().rhythmSaveFail })
    } finally {
      setSaving(false)
    }
  }, [filePath, noteRhythm, result, saving])

  return { loading, error, result, saving, save }
}
