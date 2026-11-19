import { useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Hint } from '@/components/ui/tooltip'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { FadeText } from '@/shared/ui/fade-text'
import { CheckIcon, ChevronDownIcon, HelpIcon, YearNextIcon, YearPrevIcon } from '@/shared/ui/icons'
import { historyChoices } from '@shared/history'
import { useI18n } from '@/shared/i18n'

interface Counted {
  value: string
  count: number
}

interface CompositeProps {
  label: string
  value: string
  mixed: boolean
  disabled?: boolean
  onChange: (value: string) => void
  combo?: boolean
  options?: Counted[]
  history?: string[]
  multiline?: boolean
}

export function CompositeField({ label, value, mixed, disabled, onChange, combo, options = [], history = [], multiline }: CompositeProps) {
  const id = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const fileValues = useMemo(() => options.map((item) => item.value), [options])
  const historyOptions = useMemo(() => historyChoices(history, fileValues, ''), [history, fileValues])
  const current = mixed ? '' : value
  const { pack } = useI18n()

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const controlProps = {
    id,
    disabled,
    value: current,
    placeholder: mixed ? pack.mixed : '',
    autoComplete: 'off',
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!combo || event.key !== 'ArrowDown') return
      event.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div className={multiline ? 'form-row top' : 'form-row'}>
      <label className="form-label" htmlFor={id}>
        <FadeText>{label}</FadeText>
      </label>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <Popover.Anchor asChild>
          <div className={multiline ? 'fld area' : 'fld'}>
            {multiline ? <textarea {...controlProps} /> : <input {...controlProps} />}
            {combo ? (
              <Popover.Trigger asChild>
                <button type="button" className="chevron" data-no-track-nav="" aria-label={pack.historyOf(label)} disabled={disabled}>
                  <ChevronDownIcon />
                </button>
              </Popover.Trigger>
            ) : null}
          </div>
        </Popover.Anchor>
        {combo ? (
          <Popover.Portal>
            <Popover.Content
              className="hist-menu"
              align="start"
              sideOffset={6}
              data-no-track-nav=""
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                searchRef.current?.focus()
              }}
              onCloseAutoFocus={(event) => event.preventDefault()}
              onFocusOutside={(event) => event.preventDefault()}
            >
              <Command>
                <CommandInput ref={searchRef} onValueChange={setQuery} placeholder={pack.historySearch} aria-label={pack.historySearch} />
                <AxisScroll watch={`${query}:${options.length}:${historyOptions.length}`} shade>
                  {(ref) => (
                <CommandList ref={ref} className="cmd-scroll-body">
                  <CommandEmpty>{pack.nothingFound}</CommandEmpty>
                  {options.length ? (
                    <CommandGroup heading={pack.fromFiles}>
                      {options.map((item) => (
                        <CommandItem key={`f-${item.value}`} value={item.value} onSelect={() => choose(item.value)}>
                          <span className="hist-value">{item.value}</span>
                          <span className="hist-count">{item.count}</span>
                          <span className="hist-mark">{sameText(item.value, current) ? <CheckIcon /> : null}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {options.length && historyOptions.length ? <CommandSeparator /> : null}
                  {historyOptions.length ? (
                    <CommandGroup heading={pack.history}>
                      {historyOptions.map((item) => (
                        <CommandItem key={`h-${item}`} value={item} onSelect={() => choose(item)}>
                          <span className="hist-value">{item}</span>
                          <span className="hist-mark">{sameText(item, current) ? <CheckIcon /> : null}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                </CommandList>
                  )}
                </AxisScroll>
              </Command>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    </div>
  )
}

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

interface NumberProps {
  label: string
  value: number | null
  mixed: boolean
  disabled?: boolean
  onChange: (value: number | null) => void
  stepper?: boolean
  narrow?: boolean
}

export function commitNumber(raw: string, onChange: (value: number | null) => void): void {
  if (raw === '') onChange(null)
  else if (/^\d{1,4}$/.test(raw)) onChange(Number(raw))
}

export function stepNumber(value: number | null, mixed: boolean, direction: 1 | -1, blank?: number): number | null {
  const empty = blank ?? (direction > 0 ? new Date().getFullYear() - 1 : new Date().getFullYear() + 1)
  const base = mixed || value === null ? empty : value
  const next = Math.min(9999, Math.max(0, base + direction))
  return next === 0 ? null : next
}

function StepButton({ less, disabled, onClick }: { less: boolean; disabled?: boolean; onClick: () => void }) {
  const { pack } = useI18n()
  return (
    <button type="button" className="year-step" aria-label={less ? pack.less : pack.moreNum} disabled={disabled} onClick={onClick}>
      {less ? <YearPrevIcon /> : <YearNextIcon />}
    </button>
  )
}

function SteppedNumber({ id, value, mixed, disabled, onChange, narrow, blank }: { id?: string; value: number | null; mixed: boolean; disabled?: boolean; onChange: (value: number | null) => void; narrow?: boolean; blank?: number }) {
  const { pack } = useI18n()
  return (
    <div className={narrow ? 'fld stepped narrow' : 'fld stepped'} data-no-track-nav="">
      <StepButton less disabled={disabled} onClick={() => onChange(stepNumber(value, mixed, -1, blank))} />
      <NumberInput id={id} value={value} mixed={mixed} disabled={disabled} onChange={onChange} />
      <StepButton less={false} disabled={disabled} onClick={() => onChange(stepNumber(value, mixed, 1, blank))} />
    </div>
  )
}

function NumberInput({ id, value, mixed, disabled, onChange }: { id?: string; value: number | null; mixed: boolean; disabled?: boolean; onChange: (value: number | null) => void }) {
  const { pack } = useI18n()
  const shown = mixed || value === null ? '' : String(value)
  return (
    <input
      id={id}
      inputMode="numeric"
      disabled={disabled}
      value={shown}
      placeholder={mixed ? pack.mixed : ''}
      onChange={(event) => commitNumber(event.target.value, onChange)}
    />
  )
}

export function NumberField({ label, value, mixed, disabled, onChange, stepper }: NumberProps) {
  const id = useId()
  return (
    <div className="form-row">
      <label className="form-label" htmlFor={id}>
        <FadeText>{label}</FadeText>
      </label>
      <div className="fl">
        {stepper ? (
          <SteppedNumber id={id} value={value} mixed={mixed} disabled={disabled} onChange={onChange} />
        ) : (
          <div className="fld">
            <NumberInput id={id} value={value} mixed={mixed} disabled={disabled} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  )
}

export function IndexRow({
  label,
  leftId,
  left,
  right,
  disabled,
  onLeft,
  onRight
}: {
  label: string
  leftId?: string
  left: { value: number | null; mixed: boolean }
  right: { value: number | null; mixed: boolean }
  disabled?: boolean
  onLeft: (value: number | null) => void
  onRight: (value: number | null) => void
}) {
  const autoId = useId()
  const id = leftId ?? autoId
  const { pack } = useI18n()
  return (
    <div className="form-row">
      <label className="form-label" htmlFor={id}>
        <FadeText>{label}</FadeText>
      </label>
      <div className="fl">
        <SteppedNumber id={id} narrow blank={0} value={left.value} mixed={left.mixed} disabled={disabled} onChange={onLeft} />
        <span className="between">{pack.of}</span>
        <SteppedNumber narrow blank={0} value={right.value} mixed={right.mixed} disabled={disabled} onChange={onRight} />
      </div>
    </div>
  )
}

export function FieldGroup({ title, aside, asideTitle, asideHint, children }: { title: string; aside?: ReactNode; asideTitle?: string; asideHint?: string; children: ReactNode }) {
  const { pack } = useI18n()
  const head = (
    <div className="group-head">
      <span>{title}</span>
    </div>
  )
  if (!aside) {
    return (
      <section>
        {head}
        <div className="group-card">{children}</div>
      </section>
    )
  }
  return (
    <section>
      <div className="group-split">
        <div className="group-head">
          <span className="group-title">
            <span>{asideTitle}</span>
            {asideHint ? (
              <Hint label={asideHint} side="top" align="start">
                <button type="button" className="help" aria-label={pack.hintCover}>
                  <HelpIcon />
                </button>
              </Hint>
            ) : null}
          </span>
        </div>
        {head}
      </div>
      <div className="group-body">
        {aside}
        <div className="group-card">{children}</div>
      </div>
    </section>
  )
}
