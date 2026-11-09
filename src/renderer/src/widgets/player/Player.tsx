import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { coverSrc, formatDuration } from '@/entities/track/lib'
import { useEditor } from '@/features/editor/model/store'
import { CoverIcon, PauseIcon, PlayIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon, SkipNextIcon, SkipPrevIcon, VolumeIcon, VolumeOffIcon } from '@/shared/ui/icons'
import { useCoverActions } from '@/widgets/metadata-form/cover-actions'
import { getPrefs, setPlayerVolume } from '@/features/settings/prefs'
import { useI18n } from '@/shared/i18n'

type RepeatMode = 'off' | 'all' | 'one'

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
  const positionRef = useRef(0)
  const advanceRef = useRef(false)
  const seekingRef = useRef(false)
  const secondRef = useRef(-1)
  const fillRef = useRef<HTMLSpanElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const paintRef = useRef<(ms: number, total: number) => void>(() => {})
  const volumeFillRef = useRef<HTMLSpanElement>(null)
  const volumeThumbRef = useRef<HTMLSpanElement>(null)

  const cover = coverActions.cover
  const duration = durationMs ? formatDuration(durationMs) : '0:00'
  const repeatLabel = repeat === 'one' ? pack.loopOne : repeat === 'all' ? pack.loopAll : pack.loopOff

  paintRef.current = (ms: number, total: number) => {
    const ratio = total > 0 ? Math.min(1, Math.max(0, ms / total)) : 0
    paintBar(fillRef.current, thumbRef.current, ratio)
    if (seekRef.current && !seekingRef.current) {
      const next = String(Math.min(ms, Math.max(total, 1)))
      if (seekRef.current.value !== next) seekRef.current.value = next
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
    paintRef.current(0, 0)
    if (advanceRef.current) {
      advanceRef.current = false
      return
    }
    setPlaying(false)
  }, [currentPath])

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
    if (durationMs > 0 && positionRef.current >= durationMs - 50) {
      positionRef.current = 0
      secondRef.current = -1
      paintRef.current(0, durationMs)
    }
    setPlaying(true)
  }, [playCommand, currentPath, durationMs])

  useEffect(() => {
    const path = playing && currentPath ? currentPath : null
    if (useEditor.getState().nowPlaying !== path) useEditor.setState({ nowPlaying: path })
  }, [playing, currentPath])

  useEffect(() => {
    if (!playing || durationMs <= 0) return
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const next = positionRef.current + (now - last)
      last = now
      if (seekingRef.current) {
        last = now
        frame = requestAnimationFrame(tick)
        return
      }
      if (next >= durationMs) {
        if (repeat === 'one') {
          positionRef.current = 0
          paintRef.current(0, durationMs)
          frame = requestAnimationFrame(tick)
          return
        }
        if (repeat === 'all') {
          const state = useEditor.getState()
          const order = state.tracks.map((track) => track.path)
          const current = currentPath || null
          const index = current ? order.indexOf(current) : -1
          const following = order.length ? order[(Math.max(index, 0) + 1) % order.length] : null
          if (following && following !== current) {
            advanceRef.current = true
            select(following, 'single')
            return
          }
          positionRef.current = 0
          paintRef.current(0, durationMs)
          frame = requestAnimationFrame(tick)
          return
        }
        positionRef.current = durationMs
        paintRef.current(durationMs, durationMs)
        setPlaying(false)
        return
      }
      positionRef.current = next
      paintRef.current(next, durationMs)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, durationMs, repeat, currentPath, select])

  return (
    <footer className={hidden ? 'player player-off' : 'player'} aria-label={pack.player} aria-hidden={hidden || undefined} inert={hidden ? true : undefined}>
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
        <button type="button" className="icon-btn player-skip" aria-label={pack.prevFile} disabled={!trackCount || saving} onClick={() => selectDelta(-1)}>
          <SkipPrevIcon />
        </button>
        <button type="button" className={playing ? 'icon-btn player-play on' : 'icon-btn player-play'} aria-label={playing ? pack.pause : pack.play} aria-pressed={playing} disabled={!trackCount || saving || pickedCount !== 1} onClick={() => {
          if (!playing && durationMs > 0 && positionRef.current >= durationMs) {
            positionRef.current = 0
            secondRef.current = -1
            paintRef.current(0, durationMs)
          }
          setPlaying((on) => !on)
        }}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="icon-btn player-skip" aria-label={pack.nextFile} disabled={!trackCount || saving} onClick={() => selectDelta(1)}>
          <SkipNextIcon />
        </button>
        <button type="button" className={repeat === 'off' ? 'icon-btn player-aux' : 'icon-btn player-aux on'} aria-label={repeatLabel} aria-pressed={repeat !== 'off'} disabled={!trackCount} onClick={() => setRepeat((mode) => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off')}>
          {repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
        </button>
      </div>
      <label className="player-seek">
        <span ref={elapsedRef}>0:00</span>
        <span
          className={seeking ? 'player-bar hot' : 'player-bar'}
          onMouseLeave={() => {
            if (seekingRef.current) return
            seekRef.current?.blur()
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
            max={Math.max(durationMs, 1)}
            step="any"
            defaultValue={0}
            disabled={!durationMs}
            aria-label={pack.position}
            onPointerDown={(event) => {
              seekingRef.current = true
              setSeeking(true)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerUp={(event) => {
              seekingRef.current = false
              setSeeking(false)
              event.currentTarget.blur()
            }}
            onLostPointerCapture={() => {
              seekingRef.current = false
              setSeeking(false)
            }}
            onInput={(event) => {
              const next = Number(event.currentTarget.value)
              positionRef.current = next
              secondRef.current = -1
              paintRef.current(next, durationMs)
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
