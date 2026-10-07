import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.daily(
  'remove orphan uploads',
  { hourUTC: 3, minuteUTC: 30 },
  internal.files.cleanupOrphans,
  {},
)

export default crons
