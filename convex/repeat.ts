import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { todayInSofia } from '../shared/dates'
import { createNextInSeries } from './lib/repeat'

const BATCH = 50

/**
 * The daily repeat run (Q6): every job whose date has arrived gets its next
 * job. Idempotent, and it reschedules itself while there is more to do.
 * `today` is for tests; the cron passes nothing.
 */
export const run = internalMutation({
  args: { today: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const today = args.today ?? todayInSofia(Date.now())
    const due = await ctx.db
      .query('jobs')
      .withIndex('by_next_repeat', (q) =>
        q.gt('nextRepeatOn', '').lte('nextRepeatOn', today),
      )
      .take(BATCH)
    let created = 0
    for (const job of due) {
      if (await createNextInSeries(ctx, job)) created += 1
    }
    return created
  },
})
