import type { Infer } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { vActivityData, vActivityType } from '../validators'
import type { BusinessMutationCtx } from './auth'

type ActivityEvent = {
  type: Infer<typeof vActivityType>
  jobId?: Id<'jobs'>
  clientId?: Id<'clients'>
  itemId?: Id<'items'>
  paymentId?: Id<'payments'>
  costId?: Id<'costs'>
  data?: Infer<typeof vActivityData>
}

/** Records one change for the timelines. Every mutation calls this. */
export async function logActivity(
  ctx: BusinessMutationCtx,
  event: ActivityEvent,
) {
  const { data = {}, ...links } = event
  await ctx.db.insert('activity', {
    businessId: ctx.business._id,
    actorId: ctx.member._id,
    ...links,
    data,
  })
}
