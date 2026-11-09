import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.daily(
  'remove orphan uploads',
  { hourUTC: 3, minuteUTC: 30 },
  internal.files.cleanupOrphans,
  {},
)

crons.interval(
  'morning summaries',
  { minutes: 15 },
  internal.push.runDueSummaries,
  {},
)

// Q6: repeating jobs, once a day at 01:07 UTC (just after 03:00 or 04:00 in Sofia).
crons.daily(
  'repeat jobs',
  { hourUTC: 1, minuteUTC: 7 },
  internal.repeat.run,
  {},
)

crons.daily(
  'forget old webhook deliveries',
  { hourUTC: 3, minuteUTC: 45 },
  internal.account.pruneWebhookEvents,
  {},
)

export default crons
