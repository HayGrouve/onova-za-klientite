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
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { formatMoment } from '#/components/job-row'
import { RuleReminderSheet } from '#/components/reminders/rule-reminder-sheet'
import { StageBadge } from '#/components/stage-badge'
import { Tip } from '#/components/tip'
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
import { nameMatches } from '../../../shared/search'
import { STAGE_GROUPS } from '../../../shared/stages'
import type { StageGroup } from '../../../shared/stages'

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
  filter,
  today,
}: {
  filter: string
  today: string
}) {
  const { business, businesses } = useViewer()
  const role = businesses.find((item) => item._id === business._id)?.role
  // Level 2: a Worker cannot change stages, so their cards don't move.
  const canMove = role === 'owner' || role === 'manager'
  const board = useQuery(api.jobs.board, { businessId: business._id })
  const move = useMoveJob()
  const [dragging, setDragging] = useState<Card | null>(null)
  const [ruleFor, setRuleFor] = useState<Card | null>(null)

  if (!board) return <BoardSkeleton />

  const stagesOf = (group: StageGroup) =>
    board.stages.filter((stage) => stage.group === group)
  const moveTo = (card: Card, target: Target) => {
    if (target !== 'cancelled' && target._id === card.stageId) return
    void move(card, target).then((offer) => offer && setRuleFor(card))
  }
  const matches = (card: Card) =>
    !filter.trim() ||
    nameMatches(
      filter,
      `${card.title} ${card.isNoClient ? '' : card.clientName}`,
    )

  return (
    <>
      <div className="grid min-h-[60dvh] grid-cols-4 items-start gap-3 px-4">
        {board.columns.map((column) => (
          <Column
            key={column.group}
            column={column}
            cards={column.jobs.filter(matches)}
            filtering={filter.trim() !== ''}
            stages={stagesOf(column.group)}
            allStages={board.stages}
            canMove={canMove}
            dragging={dragging}
            today={today}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onMove={moveTo}
          />
        ))}
      </div>
      <RuleReminderSheet job={ruleFor} onClose={() => setRuleFor(null)} />
    </>
  )
}

function Column({
  column,
  cards,
  filtering,
  stages,
  allStages,
  canMove,
  dragging,
  today,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  column: Board['columns'][number]
  cards: Card[]
  filtering: boolean
  stages: Stage[]
  allStages: Stage[]
  canMove: boolean
  dragging: Card | null
  today: string
  onDragStart: (card: Card) => void
  onDragEnd: () => void
  onMove: (card: Card, target: Target) => void
}) {
  const { words } = useViewer().business
  const [over, setOver] = useState(false)
  const { group } = column
  // A drop on another column lands in its first stage. A column with no
  // stage takes none, except Cancelled: cancelling brings its stage back
  // (jobs.cancel). In its own column a card can only move to another stage.
  const columnTarget: Target | null =
    stages.at(0) ?? (group === 'cancelled' ? 'cancelled' : null)
  const accepts =
    dragging !== null && columnTarget !== null && dragging.stageGroup !== group
  const zones =
    dragging !== null &&
    stages.length > 1 &&
    stages.some((stage) => stage._id !== dragging.stageId)
  const dropOn = (target: Target | null) => (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setOver(false)
    if (dragging && target) onMove(dragging, target)
    onDragEnd()
  }
  const hidden = column.total - column.jobs.length

  return (
    <section
      aria-label={GROUP_LABEL[group]()}
      onDragOver={(event) => {
        if (!accepts) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(false)
        }
      }}
      onDrop={dropOn(columnTarget)}
      className={cn(
        'relative flex flex-col gap-2 rounded-2xl bg-board p-2 pt-0 transition-shadow duration-150',
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
        {column.owedCents > 0 && (
          <span className="pl-4.5 text-xs text-muted-foreground">
            {m.balance_short({ amount: formatMoney(column.owedCents) })}
          </span>
        )}
      </header>

      {/* While dragging, a column with several stages offers each one. */}
      {zones && (
        <ul className="flex flex-col gap-1.5">
          {stages.map((stage) => (
            <StageDropZone
              key={stage._id}
              stage={stage}
              current={stage._id === dragging.stageId}
              onDrop={dropOn(stage)}
            />
          ))}
        </ul>
      )}
      {accepts && stages.length < 2 && (
        <div className="flex h-12 items-center justify-center rounded-xl border-2 border-dashed border-primary/40 text-sm font-medium text-primary">
          {m.board_drop_here()}
        </div>
      )}

      <ul className="flex stagger flex-col gap-2">
        {cards.map((card) => (
          <BoardCard
            key={card._id}
            card={card}
            showStage={stages.length > 1}
            stages={allStages}
            canMove={canMove}
            today={today}
            dragged={dragging?._id === card._id}
            onDragStart={() => onDragStart(card)}
            onDragEnd={onDragEnd}
            onMove={(target) => onMove(card, target)}
          />
        ))}
      </ul>
      {cards.length === 0 && !accepts && !zones && (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          {filtering ? m.jobs_filter_none() : m.jobs_group_empty()}
        </p>
      )}
      {hidden > 0 && (
        <p className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
          {m.board_closed_shown({
            count: column.jobs.length,
            total: column.total,
          })}
          <Link
            to="/jobs"
            search={{ view: 'table', group }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {m.board_show_all()}
          </Link>
        </p>
      )}
    </section>
  )
}

function StageDropZone({
  stage,
  current,
  onDrop,
}: {
  stage: Stage
  current: boolean
  onDrop: (event: React.DragEvent) => void
}) {
  const [over, setOver] = useState(false)
  if (current) return null
  return (
    <li
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        onDrop(event)
      }}
      className={cn(
        'flex h-11 items-center justify-center rounded-xl border-2 border-dashed border-primary/40 px-2 text-center text-sm font-medium text-primary transition-colors',
        over && 'border-primary bg-primary/10',
      )}
    >
      {m.board_drop_stage({ stage: stage.name })}
    </li>
  )
}

/** One job on the board: title, client, when, what is owed, and a move menu. */
function BoardCard({
  card,
  showStage,
  stages,
  canMove,
  today,
  dragged,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: Card
  showStage: boolean
  stages: Stage[]
  canMove: boolean
  today: string
  dragged: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (target: Target) => void
}) {
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
    <li
      draggable={canMove}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', card.title)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group/card relative surface transition-[opacity,box-shadow] duration-150 hover:shadow-md',
        canMove && 'cursor-grab active:cursor-grabbing',
        dragged && 'opacity-40',
        late && 'shadow-[inset_3px_0_0_var(--destructive)]',
      )}
    >
      <Link
        to="/jobs/$jobId"
        params={{ jobId: card._id }}
        draggable={false}
        className="flex flex-col gap-1.5 rounded-[inherit] p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="line-clamp-2 pr-7 text-sm leading-snug font-medium">
          {card.title}
        </span>
        <span className="flex flex-col gap-1 text-xs text-muted-foreground">
          {!card.isNoClient && (
            <Meta icon={UserIcon}>
              <span className="truncate">{card.clientName}</span>
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
        </span>
        {(showStage || owes) && (
          <span className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {showStage ? (
              <StageBadge
                name={card.stageName}
                group={card.stageGroup}
                className="h-5 px-2 text-[0.6875rem]"
              />
            ) : (
              <span />
            )}
            {owes && (
              <Meta icon={CoinsIcon} className="text-xs text-foreground/80">
                {formatMoney(card.balanceCents)}
              </Meta>
            )}
          </span>
        )}
      </Link>
      {canMove && <MoveMenu card={card} stages={stages} onMove={onMove} />}
    </li>
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
          className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,background-color] outline-none group-hover/card:opacity-100 hover:bg-foreground/8 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:opacity-100"
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
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <IconComponent aria-hidden className="size-3.5 shrink-0 opacity-80" />
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
