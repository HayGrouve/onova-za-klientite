import {
  ArrowsLeftRightIcon,
  CalendarBlankIcon,
  CheckIcon,
  CoinsIcon,
  FlagIcon,
  PlusIcon,
  UserIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { formatMoment } from '#/components/job-row'
import { RuleReminderSheet } from '#/components/reminders/rule-reminder-sheet'
import { ListExtras } from '#/components/list-extras'
import { StageBadge } from '#/components/stage-badge'
import { Tip } from '#/components/tip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import { useMoveJob } from '#/hooks/use-move-job'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { GROUP_LABEL } from '#/i18n/groups'
import { m } from '#/paraglide/messages.js'
import { isOverdue } from '../../../shared/dates'
import { formatMoney } from '../../../shared/money'
import { filterJobs, isFiltering, owedCents } from '../../../shared/board'
import type { JobFilter } from '../../../shared/board'
import { STAGE_GROUPS } from '../../../shared/stages'
import type { StageGroup } from '../../../shared/stages'

type Board = FunctionReturnType<typeof api.jobs.board>
type Card = Board['columns'][number]['jobs'][number]
type Stage = Board['stages'][number]
/** Where a dragged job lands: a stage, or Cancelled when it has no stage left. */
type Target = Stage | 'cancelled'

const MOVE_TOAST = 'board-move'

// The dot by a column's name carries its group's meaning: open work blue,
// done green, cancelled red, as on the stage badges (D53).
const GROUP_DOT: Record<StageGroup, string> = {
  new: 'bg-blue-300',
  in_progress: 'bg-blue-600',
  done: 'bg-green-600',
  cancelled: 'bg-red-500',
}

/**
 * The jobs board on a wide screen: four columns, one per stage group. A card
 * moves by dragging it onto a column (or onto one stage of a column with
 * several), or from its "move" menu, which also serves the keyboard.
 */
export function JobsBoard({
  filter,
  today,
}: {
  filter: JobFilter
  today: string
}) {
  const { business, businesses } = useViewer()
  const role = businesses.find((item) => item._id === business._id)?.role
  // Level 2: a Worker cannot change stages, so their cards don't move.
  const canMove = role === 'owner' || role === 'manager'
  const board = useQuery(api.jobs.board, { businessId: business._id })
  const move = useMoveJob()
  const [ruleFor, setRuleFor] = useState<Card | null>(null)
  // A move into Cancelled waits here for a yes. It stays set while the
  // question closes, so the dialog keeps its words through the animation.
  const [asking, setAsking] = useState<{ card: Card; target: Target } | null>(
    null,
  )
  const [askOpen, setAskOpen] = useState(false)

  const stagesOf = (group: StageGroup) =>
    board?.stages.filter((stage) => stage.group === group) ?? []
  // Tells the person where the job went, with a way back to where it was.
  const announce = (card: Card, target: Target) => {
    const previous = board?.stages.find((stage) => stage._id === card.stageId)
    const group = target === 'cancelled' ? 'cancelled' : target.group
    const undo = previous
      ? {
          label: m.undo(),
          onClick: () => void move({ ...card, stageGroup: group }, previous),
        }
      : undefined
    toast.success(
      m.job_stage_moved({
        stage: target === 'cancelled' ? GROUP_LABEL.cancelled() : target.name,
      }),
      { id: MOVE_TOAST, duration: 6000, action: undo },
    )
  }
  const moveNow = (card: Card, target: Target) => {
    void move(card, target, () => announce(card, target)).then(
      (offer) => offer && setRuleFor(card),
    )
  }
  const moveTo = (card: Card, target: Target) => {
    if (target !== 'cancelled' && target._id === card.stageId) return
    const toCancelled = target === 'cancelled' || target.group === 'cancelled'
    // Cancelled jobs stop counting as owed, so ask before a job goes there.
    if (toCancelled && card.stageGroup !== 'cancelled') {
      setAsking({ card, target })
      setAskOpen(true)
      return
    }
    moveNow(card, target)
  }
  const { drag, press, wasDragged } = useCardDrag((card, key) => {
    const [kind, id] = key.split(':')
    if (kind === 'zone') {
      const stage = board?.stages.find((item) => item._id === id)
      if (stage) moveTo(card, stage)
      return
    }
    const target = columnTarget(id as StageGroup, stagesOf(id as StageGroup))
    if (target && id !== card.stageGroup) moveTo(card, target)
  })

  if (!board) return <BoardSkeleton />

  const filtering = isFiltering(filter)

  return (
    <>
      <div className="grid min-h-[60dvh] grid-cols-4 items-start gap-3 px-4">
        {board.columns.map((column) => (
          <Column
            key={column.group}
            column={column}
            cards={filterJobs(column.jobs, filter, today)}
            filter={filter}
            filtering={filtering}
            stages={stagesOf(column.group)}
            allStages={board.stages}
            canMove={canMove}
            drag={drag}
            today={today}
            onPress={press}
            wasDragged={wasDragged}
            onMove={moveTo}
          />
        ))}
      </div>
      {/* The card under the pointer while it is dragged. */}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 animate-lift overflow-hidden surface shadow-xl ring-2 ring-primary/40"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
          }}
        >
          <CardFace card={drag.card} today={today} />
        </div>
      )}
      <RuleReminderSheet job={ruleFor} onClose={() => setRuleFor(null)} />
      <AlertDialog open={askOpen} onOpenChange={setAskOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.stage_cancel_question({
                title: asking?.card.title ?? '',
                stage:
                  asking?.target === 'cancelled'
                    ? GROUP_LABEL.cancelled()
                    : (asking?.target.name ?? ''),
              })}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* First in the page order, so focus lands on it, as in ConfirmAction. */}
            <AlertDialogCancel>{m.back()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (asking) moveNow(asking.card, asking.target)
                setAskOpen(false)
              }}
            >
              {m.stage_cancel_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Where a drop on a column lands: its first stage. A column with no stage
 * takes none, except Cancelled: cancelling brings its stage back (jobs.cancel).
 */
function columnTarget(group: StageGroup, stages: Stage[]): Target | null {
  return stages.at(0) ?? (group === 'cancelled' ? 'cancelled' : null)
}

type Drag = {
  card: Card
  /** The pointer, and where on the card it took hold. */
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  /** The drop target under the pointer: `column:<group>` or `zone:<stageId>`. */
  over: string | null
}

// How far a mouse moves before a press becomes a drag, and how long a finger
// holds still first, so a swipe still scrolls the page.
const DRAG_DISTANCE = 5
const TOUCH_HOLD_MS = 300
const EDGE = 64

/**
 * Dragging cards with pointer events, so it works the same with a mouse, a
 * pen or a finger, and in any browser. Drop targets are elements with a
 * `data-drop` key. Near the top or bottom of the window the page scrolls.
 */
function useCardDrag(onDrop: (card: Card, key: string) => void) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop
  const dragged = useRef(false)
  const cleanupRef = useRef<() => void>(undefined)
  useEffect(() => () => cleanupRef.current?.(), [])

  const press = (event: React.PointerEvent<HTMLElement>, card: Card) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const { pointerId } = event
    const start = { x: event.clientX, y: event.clientY }
    const touch = event.pointerType === 'touch'
    let pointer = start
    let held = !touch
    let active = false
    let current: Drag | null = null
    let frame = 0

    const update = () => {
      const target = document
        .elementFromPoint(pointer.x, pointer.y)
        ?.closest<HTMLElement>('[data-drop]')
      current = {
        card,
        x: pointer.x,
        y: pointer.y,
        offsetX: start.x - rect.left,
        offsetY: start.y - rect.top,
        width: rect.width,
        over: target?.dataset.drop ?? null,
      }
      setDrag(current)
    }
    const scroll = () => {
      const step =
        pointer.y < EDGE ? -12 : pointer.y > window.innerHeight - EDGE ? 12 : 0
      if (step) {
        window.scrollBy(0, step)
        update()
      }
      frame = requestAnimationFrame(scroll)
    }
    const begin = () => {
      active = true
      document.body.style.userSelect = 'none'
      // The whole page shows the grabbing hand while a card is held.
      document.documentElement.classList.add('dragging-card')
      update()
      frame = requestAnimationFrame(scroll)
    }
    const hold = touch
      ? window.setTimeout(() => {
          held = true
          begin()
        }, TOUCH_HOLD_MS)
      : 0

    const onMove = (moved: PointerEvent) => {
      if (moved.pointerId !== pointerId) return
      pointer = { x: moved.clientX, y: moved.clientY }
      const distance = Math.hypot(pointer.x - start.x, pointer.y - start.y)
      if (!active) {
        // A finger that moves before the hold is scrolling, not dragging.
        if (!held) {
          if (distance > DRAG_DISTANCE * 2) end()
        } else if (distance > DRAG_DISTANCE) begin()
        return
      }
      update()
    }
    const onUp = (released: PointerEvent) => {
      if (released.pointerId !== pointerId) return
      if (active) {
        // The click that follows a drag must not open the job.
        dragged.current = true
        window.setTimeout(() => (dragged.current = false))
        if (current?.over) dropRef.current(card, current.over)
      }
      end()
    }
    const onKey = (key: KeyboardEvent) => key.key === 'Escape' && end()
    // While dragging, a finger moves the card instead of the page.
    const onTouchMove = (moved: TouchEvent) => active && moved.preventDefault()
    const end = () => {
      window.clearTimeout(hold)
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('touchmove', onTouchMove)
      document.body.style.userSelect = ''
      document.documentElement.classList.remove('dragging-card')
      active = false
      cleanupRef.current = undefined
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', onKey)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    cleanupRef.current = end
  }

  return { drag, press, wasDragged: () => dragged.current }
}

function Column({
  column,
  cards,
  filter,
  filtering,
  stages,
  allStages,
  canMove,
  drag,
  today,
  onPress,
  wasDragged,
  onMove,
}: {
  column: Board['columns'][number]
  cards: Card[]
  filter: JobFilter
  filtering: boolean
  stages: Stage[]
  allStages: Stage[]
  canMove: boolean
  drag: Drag | null
  today: string
  onPress: (event: React.PointerEvent<HTMLElement>, card: Card) => void
  wasDragged: () => boolean
  onMove: (card: Card, target: Target) => void
}) {
  const { words } = useViewer().business
  const { group } = column
  const dragging = drag?.card ?? null
  // In its own column a card can only move to another of the column's stages.
  const accepts =
    dragging !== null &&
    columnTarget(group, stages) !== null &&
    dragging.stageGroup !== group
  const zones =
    dragging !== null &&
    stages.length > 1 &&
    stages.some((stage) => stage._id !== dragging.stageId)
  const over = drag?.over === `column:${group}`
  const hidden = column.total - column.jobs.length
  // The header counts what is shown: with a filter on, the cards that pass it.
  const owed = filtering ? owedCents(cards) : column.owedCents

  return (
    <section
      aria-label={GROUP_LABEL[group]()}
      data-drop={accepts ? `column:${group}` : undefined}
      className={cn(
        'relative flex flex-col gap-2 rounded-2xl bg-board p-2 pt-0 transition-shadow duration-200 ease-out',
        (accepts || zones) && 'ring-2 ring-primary/25 ring-inset',
        over && 'ring-primary/70',
      )}
    >
      <header className="sticky top-0 z-10 -mx-2 flex flex-col gap-0.5 rounded-t-2xl bg-board px-3 pt-3.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn('size-2.5 shrink-0 rounded-full', GROUP_DOT[group])}
          />
          <h2 className="truncate text-sm font-semibold">
            {GROUP_LABEL[group]()}
          </h2>
          <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
            {filtering ? `${cards.length}/${column.total}` : column.total}
          </span>
          {group === 'new' && (
            <Tip label={m.new_job_label({ job: words.job.singular })}>
              <Link
                to="/new"
                aria-label={m.new_job_label({ job: words.job.singular })}
                className="-my-1 ml-auto flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-foreground/8 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <PlusIcon className="size-4" weight="bold" />
              </Link>
            </Tip>
          )}
        </div>
        {owed > 0 && (
          <span className="pl-4.5 text-xs text-muted-foreground">
            {m.balance_short({ amount: formatMoney(owed) })}
          </span>
        )}
      </header>

      {/* The cards, and over them while a card is dragged the places it can
          land. The overlay fades in over the cards instead of pushing them
          down, so nothing on the board jumps when a drag starts. */}
      <div className="relative flex min-h-24 flex-col">
        <ul className="flex stagger flex-col gap-2">
          {cards.map((card) => (
            <BoardCard
              key={card._id}
              card={card}
              stages={allStages}
              canMove={canMove}
              today={today}
              dragged={dragging?._id === card._id}
              onPress={(event) => onPress(event, card)}
              wasDragged={wasDragged}
              onMove={(target) => onMove(card, target)}
            />
          ))}
        </ul>
        {cards.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {filtering ? m.jobs_filter_none() : m.jobs_group_empty()}
          </p>
        )}
        <div
          aria-hidden
          data-drop={accepts ? `column:${group}` : undefined}
          className={cn(
            'pointer-events-none absolute -inset-1 rounded-xl bg-board/60 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 ease-out',
            (accepts || zones) && 'pointer-events-auto opacity-100',
          )}
        >
          {/* A column with several stages offers each one; another column
              takes the drop anywhere. The targets stay in view under the
              column's heading. */}
          <ul
            className={cn(
              'sticky top-20 flex translate-y-1 flex-col gap-1.5 p-1 transition-transform duration-200 ease-out',
              (accepts || zones) && 'translate-y-0',
            )}
          >
            {dragging &&
              (zones
                ? stages
                    .filter((stage) => stage._id !== dragging.stageId)
                    .map((stage) => (
                      <DropTarget
                        key={stage._id}
                        drop={`zone:${stage._id}`}
                        over={drag?.over === `zone:${stage._id}`}
                      >
                        {m.board_drop_stage({ stage: stage.name })}
                      </DropTarget>
                    ))
                : accepts && (
                    <DropTarget drop={`column:${group}`} over={over}>
                      {m.board_drop_here()}
                    </DropTarget>
                  ))}
          </ul>
        </div>
      </div>
      {hidden > 0 && (
        <p className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
          {m.board_closed_shown({
            count: column.jobs.length,
            total: column.total,
          })}
          <Link
            to="/jobs"
            search={{
              view: 'table',
              group,
              ...(filter.text?.trim() && { q: filter.text }),
              ...(filter.owing && { owing: true as const }),
              ...(filter.dueThisMonth && { due: 'month' as const }),
            }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {m.board_show_all()}
          </Link>
        </p>
      )}
    </section>
  )
}

/** A dashed place to drop a dragged card, lit while the card is over it. */
function DropTarget({
  drop,
  over,
  children,
}: {
  drop: string
  over: boolean
  children: React.ReactNode
}) {
  return (
    <li
      data-drop={drop}
      className={cn(
        'flex h-14 items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-background/60 px-2 text-center text-sm font-medium text-primary transition-[background-color,border-color,transform] duration-150',
        over && 'scale-[1.02] border-primary bg-primary/12',
      )}
    >
      {children}
    </li>
  )
}

/** One job on the board: the card face, a link to the job, and a move menu. */
function BoardCard({
  card,
  stages,
  canMove,
  today,
  dragged,
  onPress,
  wasDragged,
  onMove,
}: {
  card: Card
  stages: Stage[]
  canMove: boolean
  today: string
  dragged: boolean
  onPress: (event: React.PointerEvent<HTMLElement>) => void
  wasDragged: () => boolean
  onMove: (target: Target) => void
}) {
  const late =
    (card.stageGroup === 'new' || card.stageGroup === 'in_progress') &&
    isOverdue(card.dueDate, today)
  return (
    <li
      onPointerDown={canMove ? onPress : undefined}
      inert={dragged}
      className={cn(
        'group/card relative overflow-hidden surface transition-[opacity,box-shadow] duration-150 row-lazy hover:shadow-md',
        canMove && 'cursor-grab touch-manipulation select-none',
        dragged && 'opacity-40',
        late && 'shadow-[inset_3px_0_0_var(--destructive)]',
      )}
    >
      <Link
        to="/jobs/$jobId"
        params={{ jobId: card._id }}
        draggable={false}
        onClick={(event) => wasDragged() && event.preventDefault()}
        className={cn(
          'block rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
          canMove && 'cursor-grab',
        )}
      >
        <CardFace card={card} today={today} />
      </Link>
      {canMove && <MoveMenu card={card} stages={stages} onMove={onMove} />}
    </li>
  )
}

/**
 * What a card shows: the title with its stage joined to the top-right corner
 * (as on the phone's rows), the client, when, and what is still owed.
 */
function CardFace({ card, today }: { card: Card; today: string }) {
  const late =
    (card.stageGroup === 'new' || card.stageGroup === 'in_progress') &&
    isOverdue(card.dueDate, today)
  const timing: { icon: Icon; text: string } | null =
    late && card.dueDate
      ? {
          icon: WarningCircleIcon,
          text: m.late_since({ date: formatDay(card.dueDate, today) }),
        }
      : card.nextAppointment
        ? {
            icon: CalendarBlankIcon,
            text: formatMoment(
              card.nextAppointment.start,
              card.nextAppointment.allDay,
              today,
            ),
          }
        : card.dueDate
          ? {
              icon: FlagIcon,
              text: m.due_short({ date: formatDay(card.dueDate, today) }),
            }
          : null
  const owes = card.owes && card.balanceCents > 0

  return (
    <span className="flex flex-col gap-1.5 p-3">
      {/* On a narrow column the stage sits on its own line above the title, so
          the title gets the card's whole width; from xl it shares the line. */}
      <span className="flex flex-col-reverse gap-1.5 xl:flex-row xl:items-start xl:justify-between xl:gap-2">
        <span className="line-clamp-2 min-w-0 text-sm leading-snug font-medium break-words">
          {card.title}
        </span>
        {/* Pulled over the card's padding onto its top and right edges. */}
        <StageBadge
          name={card.stageName}
          group={card.stageGroup}
          corner
          className="-mt-3 -mr-3 h-6 self-end px-2.5 text-[0.6875rem] xl:self-auto"
        />
      </span>
      <span className="flex flex-col gap-1 pr-7 text-xs text-muted-foreground">
        {!card.isNoClient && (
          <Meta icon={UserIcon}>
            <span className="line-clamp-2 min-w-0 break-words">
              {card.clientName}
            </span>
          </Meta>
        )}
        {timing && (
          <Meta
            icon={timing.icon}
            className={cn(late && 'font-medium text-destructive')}
          >
            {timing.text}
          </Meta>
        )}
        {owes && (
          <Meta icon={CoinsIcon} className="text-foreground/80">
            {m.balance_short({ amount: formatMoney(card.balanceCents) })}
          </Meta>
        )}
        <ListExtras target="job" values={card.listExtra} className="text-xs" />
      </span>
    </span>
  )
}

/** "Move to": every stage by group. The keyboard's way to do what dragging does. */
function MoveMenu({
  card,
  stages,
  onMove,
}: {
  card: Card
  stages: Stage[]
  onMove: (target: Target) => void
}) {
  const label = `${m.board_move()}: ${card.title}`
  const hasCancelled = stages.some((stage) => stage.group === 'cancelled')
  return (
    <DropdownMenu>
      <Tip label={m.board_move_to()}>
        <DropdownMenuTrigger
          aria-label={label}
          data-no-drag
          className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,background-color] outline-none group-hover/card:opacity-100 hover:bg-foreground/8 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-[''] [@media(hover:none)]:opacity-100"
        >
          <ArrowsLeftRightIcon className="size-4" />
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{m.board_move_to()}</DropdownMenuLabel>
        </DropdownMenuGroup>
        {STAGE_GROUPS.map((group) => {
          const inGroup = stages.filter((stage) => stage.group === group)
          if (inGroup.length === 0 && !(group === 'cancelled' && !hasCancelled))
            return null
          return (
            <DropdownMenuGroup key={group}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">
                {GROUP_LABEL[group]()}
              </DropdownMenuLabel>
              {inGroup.length === 0 ? (
                <DropdownMenuItem
                  className="min-h-9"
                  onClick={() => onMove('cancelled')}
                >
                  {GROUP_LABEL.cancelled()}
                </DropdownMenuItem>
              ) : (
                inGroup.map((stage) => {
                  const current = stage._id === card.stageId
                  return (
                    <DropdownMenuItem
                      key={stage._id}
                      className="min-h-9"
                      disabled={current}
                      onClick={() => onMove(stage)}
                    >
                      <CheckIcon
                        aria-hidden
                        className={cn(!current && 'invisible')}
                      />
                      {stage.name}
                    </DropdownMenuItem>
                  )
                })
              )}
            </DropdownMenuGroup>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Meta({
  icon: IconComponent,
  className,
  children,
}: {
  icon: Icon
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-start gap-1', className)}>
      <IconComponent
        aria-hidden
        className="mt-px size-3.5 shrink-0 opacity-80"
      />
      {children}
    </span>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-4 items-start gap-3 px-4">
      {STAGE_GROUPS.map((group) => (
        <div
          key={group}
          className="flex flex-col gap-2 rounded-2xl bg-board p-2"
        >
          <Skeleton className="m-1.5 h-5 w-24" />
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  )
}
