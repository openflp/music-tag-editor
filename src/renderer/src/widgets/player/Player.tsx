import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { coverSrc, formatDuration } from '@/entities/track/lib'
import { useEditor } from '@/features/editor/model/store'
import { CoverIcon, PauseIcon, PlayIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon, SkipNextIcon, SkipPrevIcon, VolumeIcon, VolumeOffIcon } from '@/shared/ui/icons'
import { useCoverActions } from '@/widgets/metadata-form/cover-actions'
import { getPrefs, setPlayerVolume } from '@/features/settings/prefs'
import { getPack, useI18n } from '@/shared/i18n'
import { mediaTrackUrl } from '@shared/media'

type RepeatMode = 'off' | 'all' | 'one'

function playableOrder(): string[] {
  const state = useEditor.getState()
  const known = new Set(state.tracks.filter((track) => !track.error).map((track) => track.path))
  const listed = state.listOrder.filter((path) => known.has(path))
  if (listed.length === known.size && known.size) return listed
  return [...known]
}

function nextPath(from: string, shuffled: boolean): string | null {
  const order = playableOrder()
  if (!order.length) return null
  if (shuffled) {
    const pool = order.filter((path) => path !== from)
    if (!pool.length) return order[0] ?? null
    return pool[Math.floor(Math.random() * pool.length)] ?? null
  }
  const index = order.indexOf(from)
  return order[(index < 0 ? 0 : index + 1) % order.length] ?? null
}

function paintBar(fill: HTMLSpanElement | null, thumb: HTMLSpanElement | null, ratio: number) {
  const clamped = Math.min(1, Math.max(0, ratio))
  const zero = clamped === 0
  if (fill) {
    fill.style.removeProperty('transform')
    fill.style.width = zero ? '0px' : `${clamped * 100}%`
  }
  if (thumb) {
    thumb.style.left = `${clamped * 100}%`
    const mark = zero ? '1' : '0'
    if (thumb.dataset.zero !== mark) thumb.dataset.zero = mark
  }
}

export function Player({ hidden = false }: { hidden?: boolean }) {
  const trackCount = useEditor((state) => state.tracks.length)
  const pickedCount = useEditor((state) => state.selected.length)
  const currentPath = useEditor((state) => (state.selected.length === 1 ? state.selected[0] : ''))
  const durationMs = useEditor((state) => {
    if (state.selected.length !== 1) return 0
    const path = state.selected[0]
    for (const track of state.tracks) {
      if (track.path === path) return track.tech.durationMs || 0
    }
    return 0
  })
  const saving = useEditor((state) => state.saving)
  const select = useEditor((state) => state.select)
  const selectDelta = useEditor((state) => state.selectDelta)
  const coverActions = useCoverActions()
  const { pack } = useI18n()
  const [playing, setPlaying] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [volume, setVolume] = useState(() => {
    const prefs = getPrefs()
    return prefs.rememberVolume ? prefs.volume : 80
  })
  const [muted, setMuted] = useState(false)
  const [volumeHold, setVolumeHold] = useState(false)
  const [seeking, setSeeking] = useState(false)
  const [heardMs, setHeardMs] = useState(0)
  const positionRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const failedRef = useRef('')
  const advanceRef = useRef(false)
  const seekingRef = useRef(false)
  const holdMs = useRef<number | null>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const secondRef = useRef(-1)
  const fillRef = useRef<HTMLSpanElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const paintRef = useRef<(ms: number, total: number) => void>(() => {})
  const volumeFillRef = useRef<HTMLSpanElement>(null)
  const volumeThumbRef = useRef<HTMLSpanElement>(null)

  const cover = coverActions.cover
  const totalMs = heardMs || durationMs
  const totalRef = useRef(0)
  totalRef.current = totalMs
  const duration = totalMs ? formatDuration(totalMs) : '0:00'
  const repeatLabel = repeat === 'one' ? pack.loopOne : repeat === 'all' ? pack.loopAll : pack.loopOff

  paintRef.current = (ms: number, total: number) => {
    const ratio = total > 0 ? Math.min(1, Math.max(0, ms / total)) : 0
    paintBar(fillRef.current, thumbRef.current, ratio)
    const seek = seekRef.current
    if (seek && !seekingRef.current) {
      const next = String(Math.min(ms, Math.max(total, 1)))
      if (seek.value !== next) seek.value = next
    }
    const shown = Math.round(ms / 1000)
    if (elapsedRef.current && shown !== secondRef.current) {
      secondRef.current = shown
      elapsedRef.current.textContent = formatDuration(ms) || '0:00'
    }
  }

  useLayoutEffect(() => {
    paintBar(fillRef.current, thumbRef.current, 0)
  }, [])

  useLayoutEffect(() => {
    paintBar(volumeFillRef.current, volumeThumbRef.current, (muted ? 0 : volume) / 100)
  }, [muted, volume])

  useEffect(() => {
    positionRef.current = 0
    secondRef.current = -1
    failedRef.current = ''
    holdMs.current = null
    setHeardMs(0)
    paintRef.current(0, 0)
    const audio = audioRef.current
    if (audio) {
      if (!currentPath) {
        audio.pause()
        audio.removeAttribute('src')
        delete audio.dataset.path
      } else if (audio.dataset.path !== currentPath) {
        audio.dataset.path = currentPath
        audio.src = mediaTrackUrl(currentPath)
      }
    }
    if (advanceRef.current) {
      advanceRef.current = false
      return
    }
    setPlaying(false)
  }, [currentPath])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = (muted ? 0 : volume) / 100
  }, [muted, volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let cancelled = false
    const start = () => {
      if (cancelled) return
      void audio.play().catch(() => {
        if (!cancelled) setPlaying(false)
      })
    }
    if (!playing || hidden || !currentPath) {
      audio.pause()
      return
    }
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) start()
    else audio.addEventListener('canplay', start, { once: true })
    return () => {
      cancelled = true
      audio.removeEventListener('canplay', start)
    }
  }, [playing, hidden, currentPath])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const restart = () => {
      audio.currentTime = 0
      positionRef.current = 0
      secondRef.current = -1
      paintRef.current(0, totalRef.current)
      void audio.play().catch(() => setPlaying(false))
    }
    const onMeta = () => {
      const ms = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0
      setHeardMs(ms)
    }
    const onEnd = () => {
      if (seekingRef.current || holdMs.current != null) return
      if (repeat === 'one') {
        restart()
        return
      }
      const next = repeat === 'all' || shuffle ? nextPath(currentPath, shuffle) : null
      if (next && next !== currentPath) {
        advanceRef.current = true
        select(next, 'single')
        return
      }
      if (next && repeat !== 'off') {
        restart()
        return
      }
      positionRef.current = totalRef.current
      paintRef.current(totalRef.current, totalRef.current)
      setPlaying(false)
    }
    const onError = () => {
      if (!currentPath || audio.dataset.path !== currentPath || failedRef.current === currentPath) return
      if (audio.error?.code === MediaError.MEDIA_ERR_ABORTED) return
      failedRef.current = currentPath
      setPlaying(false)
      useEditor.getState().notify({ kind: 'err', text: getPack().playFail })
    }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('error', onError)
    }
  }, [currentPath, repeat, shuffle, select])

  const playCommand = useEditor((state) => state.playCommand)
  const playSeen = useRef(0)
  const hiddenRef = useRef(hidden)
  useEffect(() => {
    const wasHidden = hiddenRef.current
    hiddenRef.current = hidden
    if (hidden && !wasHidden) setPlaying(false)
  }, [hidden])

  useEffect(() => {
    if (!playCommand || playCommand.id === playSeen.current) return
    playSeen.current = playCommand.id
    if (playCommand.type === 'pause') {
      setPlaying(false)
      return
    }
    if (currentPath !== playCommand.path) return
    const audio = audioRef.current
    const end = totalRef.current
    if (audio && (audio.ended || (end > 0 && positionRef.current >= end - 50))) {
      audio.currentTime = 0
      positionRef.current = 0
      secondRef.current = -1
      paintRef.current(0, end)
    }
    setPlaying(true)
  }, [playCommand, currentPath])

  useEffect(() => {
    const path = playing && currentPath ? currentPath : null
    if (useEditor.getState().nowPlaying !== path) useEditor.setState({ nowPlaying: path })
  }, [playing, currentPath])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const audio = audioRef.current
      if (audio && !seekingRef.current && !audio.paused) {
        const held = holdMs.current
        const actual = audio.currentTime * 1000
        const ms = held != null && Math.abs(actual - held) > 400 ? held : actual
        if (held != null && ms === actual) holdMs.current = null
        positionRef.current = ms
        paintRef.current(ms, totalRef.current)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const moveSeek = (clientX: number) => {
    const bar = barRef.current
    const total = totalRef.current
    if (!bar || total <= 0) return
    const rect = bar.getBoundingClientRect()
    const ratio = rect.width <= 0 ? 0 : Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const next = ratio * total
    positionRef.current = next
    secondRef.current = -1
    paintRef.current(next, total)
    const seek = seekRef.current
    if (seek) {
      const value = String(next)
      if (seek.value !== value) seek.value = value
    }
    return next
  }

  const applySeek = (ms: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return
    const seconds = Math.min(Math.max(0, audio.duration - 0.05), Math.max(0, ms / 1000))
    holdMs.current = seconds * 1000
    if (Math.abs(audio.currentTime - seconds) < 0.03) {
      holdMs.current = null
      return
    }
    try {
      audio.currentTime = seconds
    } catch {
      holdMs.current = null
    }
  }

  const step = (direction: 1 | -1) => {
    const before = currentPath
    if (shuffle && direction === 1) {
      const next = before ? nextPath(before, true) : null
      if (!next || next === before) return
      if (playing) advanceRef.current = true
      select(next, 'single')
      return
    }
    selectDelta(direction)
    const picked = useEditor.getState().selected
    const after = picked.length === 1 ? picked[0] : ''
    if (playing && after && after !== before) advanceRef.current = true
  }

  return (
    <footer className={hidden ? 'player player-off' : 'player'} aria-label={pack.player} aria-hidden={hidden || undefined} inert={hidden ? true : undefined}>
      <audio ref={audioRef} preload="auto" />
      <div className="player-art">
        {cover ? <img alt="" src={coverSrc(cover.mime, cover.dataBase64)} /> : (
          <span className="player-art-empty">
            <CoverIcon size={18} />
          </span>
        )}
      </div>
      <div className="player-controls">
        <button type="button" className={shuffle ? 'icon-btn player-aux on' : 'icon-btn player-aux'} aria-label={pack.shuffle} aria-pressed={shuffle} disabled={!trackCount} onClick={() => setShuffle((on) => !on)}>
          <ShuffleIcon />
        </button>
        <button type="button" className="icon-btn player-skip" aria-label={pack.prevFile} disabled={!trackCount || saving} onClick={() => step(-1)}>
          <SkipPrevIcon />
        </button>
        <button type="button" className={playing ? 'icon-btn player-play on' : 'icon-btn player-play'} aria-label={playing ? pack.pause : pack.play} aria-pressed={playing} disabled={!trackCount || saving || pickedCount !== 1} onClick={() => {
          if (!playing && totalMs > 0 && positionRef.current >= totalMs) {
            const audio = audioRef.current
            if (audio) audio.currentTime = 0
            positionRef.current = 0
            secondRef.current = -1
            paintRef.current(0, totalMs)
          }
          setPlaying((on) => !on)
        }}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="icon-btn player-skip" aria-label={pack.nextFile} disabled={!trackCount || saving} onClick={() => step(1)}>
          <SkipNextIcon />
        </button>
        <button type="button" className={repeat === 'off' ? 'icon-btn player-aux' : 'icon-btn player-aux on'} aria-label={repeatLabel} aria-pressed={repeat !== 'off'} disabled={!trackCount} onClick={() => setRepeat((mode) => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off')}>
          {repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
        </button>
      </div>
      <label className="player-seek">
        <span ref={elapsedRef}>0:00</span>
        <span
          ref={barRef}
          className={seeking ? 'player-bar hot' : 'player-bar'}
          onMouseLeave={() => {
            if (seekingRef.current) return
            seekRef.current?.blur()
          }}
          onPointerDown={(event) => {
            if (!totalRef.current || event.button !== 0) return
            seekingRef.current = true
            setSeeking(true)
            event.currentTarget.setPointerCapture(event.pointerId)
            moveSeek(event.clientX)
          }}
          onPointerMove={(event) => {
            if (!seekingRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
            moveSeek(event.clientX)
          }}
          onPointerUp={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            const next = moveSeek(event.clientX)
            if (next != null) applySeek(next)
            seekingRef.current = false
            setSeeking(false)
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={(event) => {
            seekingRef.current = false
            setSeeking(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
        >
          <span className="player-bar-track">
            <span className="player-bar-fill" ref={fillRef} />
          </span>
          <span className="player-bar-thumb" ref={thumbRef} />
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={Math.max(totalMs, 1)}
            step="any"
            defaultValue={0}
            disabled={!totalMs}
            aria-label={pack.position}
            onKeyDown={() => {
              seekingRef.current = true
            }}
            onKeyUp={() => {
              seekingRef.current = false
            }}
            onInput={(event) => {
              const next = Number(event.currentTarget.value)
              if (!Number.isFinite(next)) return
              positionRef.current = next
              secondRef.current = -1
              paintRef.current(next, totalRef.current)
              applySeek(next)
            }}
          />
        </span>
        <span>{duration}</span>
      </label>
      <div
        className={volumeHold ? 'player-volume hot' : 'player-volume'}
        onMouseLeave={(event) => {
          if (volumeHold) return
          const input = event.currentTarget.querySelector('input')
          if (input instanceof HTMLInputElement) input.blur()
        }}
      >
        <button
          type="button"
          className="icon-btn player-aux"
          aria-label={muted || volume === 0 ? pack.unmute : pack.mute}
          aria-pressed={muted || volume === 0}
          onClick={() => setMuted((on) => !on)}
        >
          {muted || volume === 0 ? <VolumeOffIcon /> : <VolumeIcon />}
        </button>
        <span className="player-volume-rail">
          <span className="player-bar">
            <span className="player-bar-track">
              <span className="player-bar-fill" ref={volumeFillRef} />
            </span>
            <span className="player-bar-thumb" ref={volumeThumbRef} />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={muted ? 0 : volume}
              aria-label={pack.volume}
              onPointerDown={(event) => {
                setVolumeHold(true)
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerUp={(event) => {
                setVolumeHold(false)
                event.currentTarget.blur()
              }}
              onLostPointerCapture={() => setVolumeHold(false)}
              onChange={(event) => {
                const next = Number(event.target.value)
                setVolume(next)
                setMuted(next === 0)
                if (getPrefs().rememberVolume) setPlayerVolume(next)
              }}
            />
          </span>
        </span>
      </div>
    </footer>
  )
}
