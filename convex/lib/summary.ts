import {
  addDays,
  nextSofiaTime,
  sofiaTimeToUtc,
  todayInSofia,
} from '../../shared/dates'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { summaryBody, summaryTitle } from './pushText'
import { isWorker, seesAppointment, seesJob } from './scope'
import type { SummaryCounts } from './pushText'

const SUMMARY_HOUR = 7
const SUMMARY_MINUTE = 30
/** A summary this late is stale (the cron was down): skip it, don't send at noon. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000
const BATCH = 200

/** The next 07:30 in Sofia, strictly after `now` (Q14, D13). */
export function nextSummaryTime(now: number): number {
  return nextSofiaTime(now, SUMMARY_HOUR, SUMMARY_MINUTE)
}

/**
 * What Today would list, as counts (convex/today.ts has the same rules):
 * appointments that aren't cancelled, New and In progress jobs past their due
 * date (Q17), and open reminders due today or earlier. A Worker's counts
 * cover only their own work, and no reminders (D89).
 */
export async function summaryCounts(
  ctx: QueryCtx,
  business: Doc<'businesses'>,
  member: Doc<'memberships'>,
  today: string,
  include: { overdue: boolean; reminders: boolean },
): Promise<SummaryCounts> {
  const businessId = business._id
  const dayStart = sofiaTimeToUtc(today, 0, 0)
  const tomorrowStart = sofiaTimeToUtc(addDays(today, 1), 0, 0)

  let appointments = 0
  const items = await ctx.db
    .query('appointments')
    .withIndex('by_business_start', (q) =>
      q
        .eq('businessId', businessId)
        .gte('start', dayStart)
        .lt('start', tomorrowStart),
    )
    .collect()
  for (const item of items) {
    if (item.cancelledAt !== undefined) continue
    const job = item.jobId ? await ctx.db.get('jobs', item.jobId) : null
    if (job?.stageGroup === 'cancelled') continue
    if (!seesAppointment(member, item, job)) continue
    appointments += 1
  }

  let overdue = 0
  if (include.overdue) {
    for (const group of ['new', 'in_progress'] as const) {
      const late = await ctx.db
        .query('jobs')
        .withIndex('by_business_group_due', (q) =>
          q
            .eq('businessId', businessId)
            .eq('stageGroup', group)
            .gt('dueDate', '')
            .lt('dueDate', today),
        )
        .collect()
      overdue += late.filter((job) => seesJob(member, job)).length
    }
  }

  let reminders = 0
  if (include.reminders && business.modules.reminders && !isWorker(member)) {
    reminders = (
      await ctx.db
        .query('reminders')
        .withIndex('by_business_status_date', (q) =>
          q
            .eq('businessId', businessId)
            .eq('status', 'open')
            .lte('date', today),
        )
        .collect()
    ).length
  }

  return { appointments, overdue, reminders }
}

export type PushMessage = {
  userId: Id<'users'>
  title: string
  body: string
  url: string
}

/**
 * The memberships whose summary time has come. Each is moved on to the next
 * 07:30 whether or not anything is sent, and a message is returned only when
 * there is something to say (Q14). The caller enqueues the sends.
 */
export async function collectDueSummaries(
  ctx: MutationCtx,
  now: number,
): Promise<PushMessage[]> {
  const due = await ctx.db
    .query('memberships')
    .withIndex('by_next_summary', (q) =>
      q.gt('nextSummaryAt', 0).lte('nextSummaryAt', now),
    )
    .take(BATCH)
  const today = todayInSofia(now)
  const messages: PushMessage[] = []
  for (const member of due) {
    const scheduledFor = member.nextSummaryAt ?? now
    const subscription = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', member.userId))
      .first()
    if (
      member.deactivatedAt !== undefined ||
      !member.notify.morningSummary ||
      !subscription
    ) {
      await ctx.db.patch('memberships', member._id, {
        nextSummaryAt: undefined,
      })
      continue
    }
    await ctx.db.patch('memberships', member._id, {
      nextSummaryAt: nextSummaryTime(now),
    })
    if (now - scheduledFor > STALE_AFTER_MS) continue
    const business = await ctx.db.get('businesses', member.businessId)
    if (!business) continue
    const counts = await summaryCounts(ctx, business, member, today, {
      overdue: member.notify.overdue,
      reminders: member.notify.remindersDue,
    })
    const body = summaryBody(counts, business.words.appointment.plural)
    if (!body) continue
    messages.push({
      userId: member.userId,
      title: summaryTitle(business.name),
      body,
      url: '/',
    })
  }
  return messages
}

/**
 * Keeps `nextSummaryAt` true to the rule: set while the user has a push
 * subscription and the membership's morning summary is on, clear otherwise.
 */
export async function syncSummaryTimes(
  ctx: MutationCtx,
  userId: Id<'users'>,
  now: number,
) {
  const subscription = await ctx.db
    .query('pushSubscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first()
  const members = await ctx.db
    .query('memberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  for (const member of members) {
    const wanted =
      subscription &&
      member.deactivatedAt === undefined &&
      member.notify.morningSummary
        ? (member.nextSummaryAt ?? nextSummaryTime(now))
        : undefined
    if (wanted !== member.nextSummaryAt) {
      await ctx.db.patch('memberships', member._id, { nextSummaryAt: wanted })
    }
  }
}
