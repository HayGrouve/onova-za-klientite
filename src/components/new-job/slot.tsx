import { PencilSimpleIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { useId, useState } from 'react'
import { m } from '#/paraglide/messages.js'

type Shown = {
  show: string
  quiet: boolean
  node: React.ReactNode
  motion: 'lift' | 'fade' | null
  /** What was shown before a change, fading out under the new value. */
  leaving: React.ReactNode
  turn: number
}

/**
 * A slot's value, answering the typing (D118): a value that replaces the
 * default lifts in, a value that changes cross-fades, and nothing moves on
 * its own. `show` names what is shown, so a change of it is a change of value.
 * Reduced motion turns both off (the global rule in styles.css).
 */
function SlotValue({
  show,
  quiet,
  still,
  children,
}: {
  show: string
  quiet: boolean
  /** Being fixed by hand: it follows the input without moving. */
  still: boolean
  children: React.ReactNode
}) {
  const [state, setState] = useState<Shown>({
    show,
    quiet,
    node: children,
    motion: null,
    leaving: null,
    turn: 0,
  })
  if (state.show !== show) {
    const lift = state.quiet && !quiet
    setState({
      show,
      quiet,
      node: children,
      motion: still ? null : lift ? 'lift' : 'fade',
      leaving: still || lift ? null : state.node,
      turn: state.turn + 1,
    })
  }
  return (
    <span className="grid min-w-0">
      {state.leaving !== null && (
        <span
          aria-hidden
          key={`out-${state.turn}`}
          className="pointer-events-none animate-out duration-150 fill-mode-forwards [grid-area:1/1] fade-out motion-reduce:hidden"
          onAnimationEnd={() =>
            setState((current) => ({ ...current, leaving: null }))
          }
        >
          {state.leaving}
        </span>
      )}
      <span
        key={`in-${state.turn}`}
        className={cn(
          'min-w-0 [grid-area:1/1]',
          state.motion === 'lift' &&
            'slide-in-from-bottom-1.5 animate-in duration-250 ease-out fade-in',
          state.motion === 'fade' && 'animate-in duration-200 fade-in',
          'motion-reduce:animate-none',
        )}
      >
        {children}
      </span>
    </span>
  )
}

/**
 * One read-back slot: its label, what the line was read as, and a note under
 * it. An empty slot shows its default as the value it is, in quieter ink. A
 * slot that can be fixed is one button that opens its fixer in place under it.
 */
export function Slot({
  label,
  show,
  quiet = false,
  note,
  onFix,
  fixing = false,
  missing,
  errorId,
  children,
  value,
}: {
  label: string
  /** What the value says, as text: a change of it animates the value. */
  show: string
  /** A default, not something read or picked: quieter ink. */
  quiet?: boolean
  value: React.ReactNode
  note?: React.ReactNode
  /** Opens or closes the fixer. Left out for a slot that is changed by tapping what it shows. */
  onFix?: () => void
  fixing?: boolean
  missing?: string | false
  /** Where the missing message can be found, to move focus to it. */
  errorId?: string
  children?: React.ReactNode
}) {
  const valueId = useId()
  const body = (
    <>
      <span className="w-24 shrink-0 pt-px text-sm text-muted-foreground">
        {label}
      </span>
      {/* Announces what the line was read as. */}
      <span
        id={valueId}
        aria-live="polite"
        className="flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <SlotValue show={show} quiet={quiet} still={fixing}>
          <span
            className={cn(
              'block text-base break-words',
              quiet ? 'text-muted-foreground' : 'font-medium',
            )}
          >
            {value}
          </span>
          {note && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              {note}
            </span>
          )}
        </SlotValue>
      </span>
    </>
  )
  return (
    <div className="flex flex-col">
      {onFix ? (
        <button
          type="button"
          aria-label={`${m.new_fix()}: ${label}`}
          aria-describedby={valueId}
          aria-expanded={fixing}
          onClick={onFix}
          className={cn(
            'flex min-h-14 w-full items-baseline gap-3 pressable px-4 py-3 text-start',
            fixing && 'bg-accent/45',
          )}
        >
          {body}
          <PencilSimpleIcon
            aria-hidden
            className="size-4 shrink-0 self-center text-muted-foreground/70"
          />
        </button>
      ) : (
        <div className="flex min-h-14 items-baseline gap-3 px-4 py-3">
          {body}
        </div>
      )}
      {missing && (
        <p
          id={errorId}
          role="alert"
          tabIndex={-1}
          className="-mt-1 px-4 pb-3 text-sm text-destructive outline-none sm:ps-31"
        >
          {missing}
        </p>
      )}
      {/* The fixer takes the full width on a phone, under the value beside it. */}
      {children && <div className="px-4 pb-4 sm:ps-31">{children}</div>}
    </div>
  )
}
