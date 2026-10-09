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
import type { FunctionReturnType } from 'convex/server'
import { cn } from 'cn'
import { memo, useMemo, useState } from 'react'
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
import { useCardDrag } from '#/hooks/use-card-drag'
import { useMoveJob } from '#/hooks/use-move-job'
import { useNow } from '#/hooks/use-now'
import { useQueryKeepPrevious } from '#/hooks/use-query-keep-previous'
import { useStableCallback } from '#/hooks/use-stable-callback'
import { useViewer } from '#/hooks/use-viewer'
import { formatDay } from '#/i18n/dates'
import { GROUP_LABEL } from '#/i18n/groups'
import { planMove } from '#/lib/move-plan'
import { m } from '#/paraglide/messages.js'
import { jobOwedCents } from '../../../shared/allocation'
import { formatMoney } from '../../../shared/money'
import {
  filterJobs,
  filterToSearch,
  isFiltering,
  owedCents,
} from '../../../shared/board'
import type { JobFilter } from '../../../shared/board'
import { STAGE_GROUPS, isJobLate } from '../../../shared/stages'
import type { StageGroup } from '../../../shared/stages'
import { hasRole } from '../../../shared/roles'

type Board = FunctionReturnType<typeof api.jobs.board>
type Card = Board['columns'][number]['jobs'][number]
type Stage = Board['stages'][number]
/** Where a dragged job lands: a stage, or Cancelled when it has no stage left. */
type Target = Stage | 'cancelled'

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
  filter: incoming,
  today,
}: {
  filter: JobFilter
  today: string
}) {
  const { business } = useViewer()
  // The page builds a new filter object on every render, but only its three
  // fields matter. A steady object keeps the memoized columns from rendering.
  const { text, owing, dueThisMonth } = incoming
  const filter = useMemo<JobFilter>(
    () => ({ text, owing, dueThisMonth }),
    [text, owing, dueThisMonth],
  )
  // Level 2: a Worker cannot change stages, so their cards don't move.
  const canMove = hasRole(business.role, 'manager')
  const now = useNow()
  const board = useQueryKeepPrevious(api.jobs.board, {
    businessId: business._id,
    now,
  })
  const { moveAndAnnounce, ruleOffer, closeRuleOffer } = useMoveJob()
  // A move into Cancelled waits here for a yes. It keeps the job's id, not
  // the card: the card is read again when the answer comes. It stays set while
  // the question closes, so the dialog keeps its words through the animation.
  const [asking, setAsking] = useState<{
    jobId: Card['_id']
    title: string
    target: Target
  } | null>(null)
  const [askOpen, setAskOpen] = useState(false)

  const stagesByGroup = useMemo(() => {
    const byGroup: Record<StageGroup, Stage[]> = {
      new: [],
      in_progress: [],
      done: [],
      cancelled: [],
    }
    for (const stage of board?.stages ?? []) byGroup[stage.group].push(stage)
    return byGroup
  }, [board?.stages])
  // What each column shows, worked out once per change of data or filter.
  const shown = useMemo(
    () =>
      board?.columns.map((column) =>
        filterJobs(
          // The owing filter finds every Done job that owes, not only the latest.
          filter.owing ? [...column.jobs, ...column.olderOwing] : column.jobs,
          filter,
          today,
        ),
      ),
    [board?.columns, filter, today],
  )
  // The card as the board has it now, or nothing once it is gone.
  const currentCard = (jobId: Card['_id']) => {
    for (const column of board?.columns ?? []) {
      const found =
        column.jobs.find((job) => job._id === jobId) ??
        column.olderOwing.find((job) => job._id === jobId)
      if (found) return found
    }
    return undefined
  }
  const moveNow = (card: Card, target: Target) =>
    void moveAndAnnounce(
      card,
      target,
      board?.stages.find((stage) => stage._id === card.stageId),
    )
  // Steady for the memoized cards and columns; it reads the latest board.
  const moveTo = useStableCallback((pressed: Card, target: Target) => {
    // The card may have moved since it was pressed or its menu was drawn.
    const card = currentCard(pressed._id)
    const plan = planMove(card, target)
    if (!card || plan === 'skip') return
    // Cancelled jobs stop counting as owed, so ask before a job goes there.
    if (plan === 'ask') {
      setAsking({ jobId: card._id, title: card.title, target })
      setAskOpen(true)
      return
    }
    moveNow(card, target)
  })
  // The answer: the job may have moved while the question was open, so it
  // is looked up again and only moved if it still needs to go there.
  const confirmAsked = () => {
    setAskOpen(false)
    if (!asking) return
    const card = currentCard(asking.jobId)
    if (card && planMove(card, asking.target) === 'ask') {
      moveNow(card, asking.target)
    }
  }
  const { drag, floatRef, press, wasDragged } = useCardDrag<Card>(
    (card, key) => {
      const [kind, id] = key.split(':')
      if (kind === 'zone') {
        const stage = board?.stages.find((item) => item._id === id)
        if (stage) moveTo(card, stage)
        return
      }
      const target = columnTarget(
        id as StageGroup,
        stagesByGroup[id as StageGroup],
      )
      if (target && id !== card.stageGroup) moveTo(card, target)
    },
  )

  if (!board) return <BoardSkeleton />

  const filtering = isFiltering(filter)

  return (
    <>
      <div className="grid min-h-[60dvh] grid-cols-4 items-start gap-3 px-4">
        {board.columns.map((column, index) => (
          <Column
            key={column.group}
            column={column}
            cards={shown?.[index] ?? []}
            filter={filter}
            filtering={filtering}
            stages={stagesByGroup[column.group]}
            allStages={board.stages}
            canMove={canMove}
            dragging={drag?.item ?? null}
            over={overIn(
              drag?.over ?? null,
              column.group,
              stagesByGroup[column.group],
            )}
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
          ref={floatRef}
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
          style={{
            transform: `translate3d(${drag.left}px, ${drag.top}px, 0)`,
            width: drag.width,
          }}
        >
          {/* The lift animation owns its own transform, so it sits inside. */}
          <div className="animate-lift overflow-hidden surface shadow-xl ring-2 ring-primary/40">
            <CardFace card={drag.item} today={today} />
          </div>
        </div>
      )}
      <RuleReminderSheet job={ruleOffer} onClose={closeRuleOffer} />
      <AlertDialog open={askOpen} onOpenChange={setAskOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.stage_cancel_question({
                title: asking?.title ?? '',
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
            <AlertDialogAction variant="destructive" onClick={confirmAsked}>
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

/**
 * The drop target under the pointer, if it is in this column: the column
 * itself or one of its stages. Other columns get null, so a drag moving
 * between targets renders only the columns it leaves and enters.
 */
function overIn(over: string | null, group: StageGroup, stages: Stage[]) {
  if (over === null) return null
  if (over === `column:${group}`) return over
  return stages.some((stage) => over === `zone:${stage._id}`) ? over : null
}

const Column = memo(function Column({
  column,
  cards,
  filter,
  filtering,
  stages,
  allStages,
  canMove,
  dragging,
  over: overKey,
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
  /** The card being dragged, and the drop target under it if it is here. */
  dragging: Card | null
  over: string | null
  today: string
  onPress: (event: React.PointerEvent<HTMLElement>, card: Card) => void
  wasDragged: () => boolean
  onMove: (card: Card, target: Target) => void
}) {
  const { words } = useViewer().business
  const { group } = column
  // In its own column a card can only move to another of the column's stages.
  const accepts =
    dragging !== null &&
    columnTarget(group, stages) !== null &&
    dragging.stageGroup !== group
  const zones =
    dragging !== null &&
    stages.length > 1 &&
    stages.some((stage) => stage._id !== dragging.stageId)
  const over = overKey === `column:${group}`
  const hidden = column.total - column.jobs.length
  const total = column.total
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
            {filtering ? `${cards.length}/${total}` : total}
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
              onPress={onPress}
              wasDragged={wasDragged}
              onMove={onMove}
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
                        over={overKey === `zone:${stage._id}`}
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
            total,
          })}
          <Link
            to="/jobs"
            search={{
              view: 'table',
              group,
              ...filterToSearch(filter),
            }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {m.board_show_all()}
          </Link>
        </p>
      )}
    </section>
  )
})

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
const BoardCard = memo(function BoardCard({
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
  onPress: (event: React.PointerEvent<HTMLElement>, card: Card) => void
  wasDragged: () => boolean
  onMove: (card: Card, target: Target) => void
}) {
  const late = isJobLate(card, today)
  return (
    <li
      onPointerDown={canMove ? (event) => onPress(event, card) : undefined}
      inert={dragged}
      className={cn(
        'group/card relative overflow-hidden surface transition-[opacity,box-shadow] duration-150 row-lazy hover:shadow-md',
        canMove &&
          'cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]',
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
      {canMove && (
        <MoveMenu
          card={card}
          stages={stages}
          onMove={(target) => onMove(card, target)}
        />
      )}
    </li>
  )
})

/**
 * What a card shows: the title with its stage joined to the top-right corner
 * (as on the phone's rows), the client, when, and what is still owed.
 */
function CardFace({ card, today }: { card: Card; today: string }) {
  const late = isJobLate(card, today)
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
  const owes = jobOwedCents(card) > 0

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
