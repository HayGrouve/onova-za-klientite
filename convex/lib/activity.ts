import type { ActivityType, WithDetails } from '../../shared/activity'
import type { Id } from '../_generated/dataModel'
import type { BusinessMutationCtx } from './auth'

/** An event of one type, with that type's details and the records it is about. */
type ActivityEvent = {
  [TType in ActivityType]: {
    type: TType
    jobId?: Id<'jobs'>
    clientId?: Id<'clients'>
    itemId?: Id<'items'>
    paymentId?: Id<'payments'>
    costId?: Id<'costs'>
  } & WithDetails<TType>
}[ActivityType]

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
