import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { stagesFor } from '../../shared/stages'
import { defaultBusiness } from '../../shared/setup'
import type { BusinessDefaults } from '../../shared/setup'
import { buildSearchText } from '../../shared/search'
import { NO_CLIENT_NAME } from '../../shared/clients'

/**
 * A new business with everything it needs to work before setup runs: the
 * stages for its job flow, the built-in "No client", and the owner membership.
 */
export async function createBusiness(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  overrides: Partial<BusinessDefaults> & { seedKey?: string } = {},
): Promise<Id<'businesses'>> {
  const { seedKey, ...settings } = overrides
  const defaults = { ...defaultBusiness(), ...settings }
  const businessId = await ctx.db.insert('businesses', {
    name: defaults.name,
    words: defaults.words,
    modules: defaults.modules,
    jobFlow: defaults.jobFlow,
    depositsOnNewJob: defaults.depositsOnNewJob,
    setup: {},
    storageBytes: 0,
    ...(seedKey ? { seedKey } : {}),
  })

  const stages = stagesFor(defaults.jobFlow)
  for (const [order, stage] of stages.entries()) {
    await ctx.db.insert('stages', {
      businessId,
      ...stage,
      order,
      visibleToClient: false,
    })
  }

  const noClientId = await ctx.db.insert('clients', {
    businessId,
    kind: 'person',
    name: NO_CLIENT_NAME,
    isNoClient: true,
    phones: [],
    consent: {},
    extra: {},
    creditCents: 0,
    searchText: buildSearchText([NO_CLIENT_NAME]),
  })
  await ctx.db.patch('businesses', businessId, { noClientId })

  await ctx.db.insert('memberships', {
    businessId,
    userId: ownerId,
    role: 'owner',
    notify: { morningSummary: true, remindersDue: true, overdue: true },
  })

  return businessId
}
