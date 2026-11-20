import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { coverSrc, formatDuration } from '@/entities/track/lib'
import { trackAt, useEditor } from '@/features/editor/model/store'
import { CoverIcon, PauseIcon, PlayIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon, SkipNextIcon, SkipPrevIcon, VolumeIcon, VolumeOffIcon } from '@/shared/ui/icons'
import { useCoverActions } from '@/widgets/metadata-form/cover-actions'
import { getPrefs, setPlayerVolume } from '@/features/settings/prefs'
import { getPack, useI18n } from '@/shared/i18n'
import { mediaTrackUrl } from '@shared/media'

type RepeatMode = 'off' | 'all' | 'one'

const SEEK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
const FADE_MS = 400
const audioSlot = String(Date.now())

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

type Envelope = {
  move: (to: number, done?: () => void, from?: number) => void
  cut: (value: number) => void
  stop: () => void
  paint: () => void
}

function makeEnvelope(read: () => { audio: HTMLAudioElement | null; level: number }): Envelope {
  let token = 0
  let frame = 0
  let timer = 0
  let env = { from: 1, to: 1, start: 0, dur: 0 }

  const heard = () => {
    if (env.dur <= 0) return env.to
    const t = (performance.now() - env.start) / env.dur
    if (t <= 0) return env.from
    if (t >= 1) return env.to
    return env.from + (env.to - env.from) * smoothstep(t)
  }

  const paint = () => {
    const { audio, level } = read()
    if (!audio) return
    // ИЗМЕНЕНО: появление и затухание идут по квадратичной кривой (было level * heard()); ползунок громкости остаётся линейным
    const fade = heard()
    audio.volume = clamp01(level * fade * fade)
  }

  const clear = () => {
    if (frame) window.cancelAnimationFrame(frame)
    if (timer) window.clearTimeout(timer)
    frame = 0
    timer = 0
  }

  const hold = (value: number) => {
    token += 1
    clear()
    const next = clamp01(value)
    env = { from: next, to: next, start: performance.now(), dur: 0 }
    paint()
  }

  return {
    cut: hold,
    stop() {
      hold(heard())
    },
    paint,
    move(to, done, fromValue) {
      const mine = ++token
      clear()
      const target = clamp01(to)
      const from = fromValue == null ? heard() : clamp01(fromValue)
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced || Math.abs(from - target) < 0.004) {
        env = { from: target, to: target, start: performance.now(), dur: 0 }
        paint()
        done?.()
        return
      }
      env = { from, to: target, start: performance.now(), dur: FADE_MS }
      paint()
      let settled = false
      const finish = () => {
        if (settled || mine !== token) return
        settled = true
        clear()
        env = { from: target, to: target, start: performance.now(), dur: 0 }
        paint()
        done?.()
      }
      const step = () => {
        if (mine !== token) return
        if (performance.now() >= env.start + env.dur) {
          finish()
          return
        }
        paint()
        frame = window.requestAnimationFrame(step)
      }
      frame = window.requestAnimationFrame(step)
      timer = window.setTimeout(finish, FADE_MS + 40)
    },
  }
}

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

function blurUnlessKeyboard(input: Element | null | undefined) {
  if (!(input instanceof HTMLInputElement)) return
  let keyboard = false
  try {
    keyboard = input.matches(':focus-visible')
  } catch {
    keyboard = false
  }
  if (!keyboard) input.blur()
}

export function Player({ hidden = false }: { hidden?: boolean }) {
  const trackCount = useEditor((state) => state.tracks.length)
  const soloPath = useEditor((state) => (state.selected.length === 1 ? state.selected[0] : ''))
  // Ctrl/Shift-клик, который расширяет выделение, уже содержащее играющий трек, не должен рвать
  // звук и сбрасывать позицию (аудит B1). Пока загруженный трек остаётся в выделении — держим его.
  const loadedPathRef = useRef('')
  const keepLoaded = useEditor(
    (state) => state.selected.length > 1 && loadedPathRef.current !== '' && state.selected.includes(loadedPathRef.current)
  )
  const currentPath = soloPath || (keepLoaded ? loadedPathRef.current : '')
  useEffect(() => {
    loadedPathRef.current = currentPath
  }, [currentPath])
  const durationMs = useEditor((state) => (currentPath ? trackAt(state.tracks, currentPath)?.tech.durationMs || 0 : 0))
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
  const draggingRef = useRef(false)
  const pendingSeekRef = useRef<number | null>(null)
  const lastVolumeRef = useRef(volume > 0 ? volume : 80)
  const volumeTimer = useRef<number | null>(null)
  const volumePending = useRef<number | null>(null)
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
  const levelRef = useRef(0)
  const envelopeRef = useRef<Envelope | null>(null)
  const swapLock = useRef(false)
  const keepRef = useRef(false)
  const [clip, setClip] = useState(0)

  const cover = coverActions.cover
  const totalMs = heardMs || durationMs
  const totalRef = useRef(0)
  if (!envelopeRef.current) {
    envelopeRef.current = makeEnvelope(() => ({
      audio: audioRef.current,
      level: levelRef.current,
    }))
  }
  levelRef.current = (muted ? 0 : volume) / 100
  const duration = totalMs ? formatDuration(totalMs) : '0:00'
  const repeatLabel = repeat === 'one' ? pack.loopOne : repeat === 'all' ? pack.loopAll : pack.loopOff

  useLayoutEffect(() => {
    totalRef.current = totalMs
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
        const text = formatDuration(ms) || '0:00'
        elapsedRef.current.textContent = text
        if (seek) seek.setAttribute('aria-valuetext', text)
      }
    }
  })

  useLayoutEffect(() => {
    paintBar(fillRef.current, thumbRef.current, 0)
  }, [])

  useLayoutEffect(() => {
    paintBar(volumeFillRef.current, volumeThumbRef.current, (muted ? 0 : volume) / 100)
  }, [muted, volume])

  useEffect(() => {
    const audio = audioRef.current
    let cancelled = false
    let queued = false

    const apply = () => {
      if (cancelled) return
      swapLock.current = false
      positionRef.current = 0
      secondRef.current = -1
      failedRef.current = ''
      holdMs.current = null
      pendingSeekRef.current = null
      setHeardMs(0)
      paintRef.current(0, 0)
      if (!audio) return
      if (!currentPath) {
        audio.pause()
        audio.removeAttribute('src')
        delete audio.dataset.path
        envelopeRef.current?.cut(0)
        return
      }
      if (audio.dataset.path !== currentPath) {
        envelopeRef.current?.cut(0)
        audio.dataset.path = currentPath
        audio.src = mediaTrackUrl(currentPath)
      }
    }

    const previous = audio?.dataset.path || ''
    const live = Boolean(audio && previous && previous !== currentPath && !audio.paused && !audio.ended)
    if (live && audio) {
      queued = true
      swapLock.current = true
      envelopeRef.current?.move(0, () => {
        if (cancelled) return
        apply()
        setClip((n) => n + 1)
      })
    } else {
      apply()
    }

    if (advanceRef.current) {
      advanceRef.current = false
      keepRef.current = true
    } else {
      keepRef.current = false
      setPlaying(false)
    }

    return () => {
      cancelled = true
      if (!queued) return
      swapLock.current = false
    }
    // ИЗМЕНЕНО: audioSlot убран из зависимостей (это константа модуля)
  }, [currentPath])

  useEffect(() => {
    levelRef.current = (muted ? 0 : volume) / 100
    envelopeRef.current?.paint()
  }, [muted, volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (swapLock.current) return () => {}
    let cancelled = false

    const release = () => {
      if (cancelled) return
      audio.pause()
      if (!currentPath) {
        audio.removeAttribute('src')
        delete audio.dataset.path
      }
    }

    if (!playing || !keepRef.current || !currentPath) {
      if (audio.paused || audio.ended) {
        release()
        return
      }
      envelopeRef.current?.move(0, release)
      return () => {
        cancelled = true
      }
    }

    const start = () => {
      if (cancelled) return
      const quiet = audio.paused || audio.ended
      envelopeRef.current?.move(1, undefined, quiet ? 0 : undefined)
      void audio.play().catch(() => {
        if (!cancelled) {
          keepRef.current = false
          setPlaying(false)
        }
      })
    }
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) start()
    else audio.addEventListener('canplay', start, { once: true })
    return () => {
      cancelled = true
      audio.removeEventListener('canplay', start)
    }
  }, [playing, currentPath, clip])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const restart = () => {
      audio.currentTime = 0
      positionRef.current = 0
      secondRef.current = -1
      paintRef.current(0, totalRef.current)
      envelopeRef.current?.move(1, undefined, 0)
      void audio.play().catch(() => {
        keepRef.current = false
        setPlaying(false)
      })
    }
    const onMeta = () => {
      const ms = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0
      setHeardMs(ms)
      const pending = pendingSeekRef.current
      if (pending != null) {
        pendingSeekRef.current = null
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          const seconds = Math.min(Math.max(0, audio.duration - 0.05), Math.max(0, pending / 1000))
          holdMs.current = seconds * 1000
          try {
            audio.currentTime = seconds
          } catch {
            holdMs.current = null
          }
        }
      }
    }
    const onSeeked = () => {
      if (!audio.seeking) holdMs.current = null
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
      keepRef.current = false
      setPlaying(false)
    }
    const onError = () => {
      if (!currentPath || audio.dataset.path !== currentPath || failedRef.current === currentPath) return
      if (audio.error?.code === MediaError.MEDIA_ERR_ABORTED) return
      failedRef.current = currentPath
      keepRef.current = false
      setPlaying(false)
      useEditor.getState().notify({ kind: 'err', text: getPack().playFail })
    }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('seeked', onSeeked)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('seeked', onSeeked)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('error', onError)
    }
  }, [currentPath, repeat, shuffle, select])

  const playCommand = useEditor((state) => state.playCommand)
  const playSeen = useRef(useEditor.getState().playCommand?.id ?? 0)
  const hiddenRef = useRef(hidden)
  useEffect(() => {
    const wasHidden = hiddenRef.current
    hiddenRef.current = hidden
    if (hidden && !wasHidden) {
      keepRef.current = false
      setPlaying(false)
    }
  }, [hidden])

  useEffect(() => {
    if (!playCommand || playCommand.id === playSeen.current) return
    playSeen.current = playCommand.id
    if (playCommand.type === 'pause') {
      keepRef.current = false
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
    keepRef.current = true
    setPlaying(true)
  }, [playCommand, currentPath])

  useEffect(() => {
    const path = playing && currentPath ? currentPath : null
    if (useEditor.getState().nowPlaying !== path) useEditor.setState({ nowPlaying: path })
  }, [playing, currentPath])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      envelopeRef.current?.stop()
      if (useEditor.getState().nowPlaying !== null) useEditor.setState({ nowPlaying: null })
    }
  }, [])

  useEffect(() => {
    return () => {
      if (volumeTimer.current != null) {
        window.clearTimeout(volumeTimer.current)
        volumeTimer.current = null
        const pending = volumePending.current
        volumePending.current = null
        if (pending != null) setPlayerVolume(pending)
      }
    }
  }, [])

  useEffect(() => {
    // ИЗМЕНЕНО: цикл обновления полоски работает, пока звук реально играет,
    // в том числе во время затухания после нажатия паузы
    if (!playing && (audioRef.current?.paused ?? true)) return
    let frame = 0
    const tick = () => {
      const audio = audioRef.current
      if (!playing && (!audio || audio.paused)) return
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

  const saveVolume = (value: number) => {
    volumePending.current = value
    if (volumeTimer.current != null) window.clearTimeout(volumeTimer.current)
    volumeTimer.current = window.setTimeout(() => {
      volumeTimer.current = null
      const pending = volumePending.current
      volumePending.current = null
      if (pending != null) setPlayerVolume(pending)
    }, 200)
  }

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
    if (!audio) return
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      pendingSeekRef.current = Math.max(0, ms)
      return
    }
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

  const toggleMute = () => {
    const silent = muted || volume === 0
    if (!silent) {
      setMuted(true)
      return
    }
    const restore = volume === 0 ? lastVolumeRef.current || 80 : volume
    if (volume === 0) {
      setVolume(restore)
      if (getPrefs().rememberVolume) saveVolume(restore)
    }
    setMuted(false)
  }

  return (
    <footer className={hidden ? 'player player-off' : 'player'} aria-label={pack.player} aria-hidden={hidden || undefined} inert={hidden ? true : undefined}>
      <audio key={audioSlot} ref={audioRef} preload="auto" />
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
        <button type="button" className={playing ? 'icon-btn player-play on' : 'icon-btn player-play'} aria-label={playing ? pack.pause : pack.play} aria-pressed={playing} disabled={!trackCount || saving || !currentPath} onClick={() => {
          if (!playing && totalMs > 0 && positionRef.current >= totalMs) {
            const audio = audioRef.current
            if (audio) audio.currentTime = 0
            positionRef.current = 0
            secondRef.current = -1
            paintRef.current(0, totalMs)
          }
          keepRef.current = !playing
          setPlaying(!playing)
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
            blurUnlessKeyboard(seekRef.current)
          }}
          onPointerDown={(event) => {
            if (!totalRef.current || event.button !== 0) return
            seekingRef.current = true
            draggingRef.current = true
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
            draggingRef.current = false
            setSeeking(false)
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={(event) => {
            seekingRef.current = false
            draggingRef.current = false
            setSeeking(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onLostPointerCapture={() => {
            seekingRef.current = false
            draggingRef.current = false
            setSeeking(false)
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
            onKeyDown={(event) => {
              if (SEEK_KEYS.has(event.key)) seekingRef.current = true
            }}
            onKeyUp={(event) => {
              if (SEEK_KEYS.has(event.key) && !draggingRef.current) seekingRef.current = false
            }}
            onBlur={() => {
              if (!draggingRef.current) seekingRef.current = false
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
          blurUnlessKeyboard(event.currentTarget.querySelector('input'))
        }}
      >
        <button
          type="button"
          className="icon-btn player-aux"
          aria-label={muted || volume === 0 ? pack.unmute : pack.mute}
          aria-pressed={muted || volume === 0}
          onClick={toggleMute}
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
                if (next > 0) lastVolumeRef.current = next
                setVolume(next)
                setMuted(next === 0)
                if (getPrefs().rememberVolume) saveVolume(next)
              }}
            />
          </span>
        </span>
      </div>
    </footer>
  )
}