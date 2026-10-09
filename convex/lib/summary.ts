import { nextSofiaTime, todayInSofia } from '../../shared/dates'
import { lateJobCount } from '../../shared/today'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { summaryBody, summaryTitle } from './pushText'
import { collectToday } from './todayData'
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
 * What Today would list, as counts: the very lists the Today screen shows
 * (`collectToday`), so the two cannot differ. A Done job's visit and an
 * overdue job already shown under a visit today are not counted twice. The
 * overdue count is every late job, also one listed under a visit (`lateJobCount`,
 * D110), as the Today tile counts it. A Worker's counts cover only their own
 * work, and no reminders (D89).
 */
export async function summaryCounts(
  ctx: QueryCtx,
  business: Doc<'businesses'>,
  member: Doc<'memberships'>,
  today: string,
  include: { overdue: boolean; reminders: boolean },
): Promise<SummaryCounts> {
  const arranged = await collectToday(ctx, business, member, today, {
    rest: false,
    overdue: include.overdue,
    reminders: include.reminders,
  })
  return {
    appointments: arranged.appointments.length,
    overdue: include.overdue ? lateJobCount(arranged, today) : 0,
    reminders: arranged.reminders.length,
  }
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
