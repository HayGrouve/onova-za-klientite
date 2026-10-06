import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  vChannel,
  vConsent,
  vExtra,
  vFieldTarget,
  vFieldType,
  vJobFlow,
  vModules,
  vRole,
  vStageColor,
  vStageGroup,
  vWords,
} from './validators'

// Milestone 1 holds the tables setup and the seed need. The rest of the
// schema draft in docs/implementation-plan.md lands in milestone 2.
export default defineSchema({
  // ── People and access ───────────────────────────────────────────────
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    activeBusinessId: v.optional(v.id('businesses')),
  }).index('by_token', ['tokenIdentifier']),

  businesses: defineTable({
    name: v.string(),
    logoFileId: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    words: vWords,
    modules: vModules,
    jobFlow: vJobFlow,
    depositsOnNewJob: v.boolean(),
    repeatDefault: v.optional(
      v.object({
        every: v.number(),
        unit: v.union(v.literal('week'), v.literal('month')),
      }),
    ),
    reminderRule: v.optional(v.object({ months: v.number() })),
    setup: v.object({
      answers: v.optional(v.any()),
      completedAt: v.optional(v.number()),
    }),
    noClientId: v.optional(v.id('clients')),
    storageBytes: v.number(),
    /** Set only on dev seed businesses, so the seed can find and rebuild them. */
    seedKey: v.optional(v.string()),
  }).index('by_seed_key', ['seedKey']),

  memberships: defineTable({
    businessId: v.id('businesses'),
    userId: v.id('users'),
    role: vRole,
    deactivatedAt: v.optional(v.number()),
    notify: v.object({
      morningSummary: v.boolean(),
      remindersDue: v.boolean(),
      overdue: v.boolean(),
    }),
    nextSummaryAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_business_user', ['businessId', 'userId'])
    .index('by_next_summary', ['nextSummaryAt']),

  // ── Clients and items ──────────────────────────────────────────────
  clients: defineTable({
    businessId: v.id('businesses'),
    kind: v.union(v.literal('person'), v.literal('company')),
    name: v.string(),
    isNoClient: v.boolean(),
    phones: v.array(
      v.object({ e164: v.string(), label: v.optional(v.string()) }),
    ),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    note: v.optional(v.string()),
    preferredChannel: v.optional(vChannel),
    consent: v.object({
      service: v.optional(vConsent),
      marketing: v.optional(vConsent),
    }),
    extra: vExtra,
    creditCents: v.number(),
    searchText: v.string(),
    anonymizedAt: v.optional(v.number()),
    mergedIntoId: v.optional(v.id('clients')),
  })
    .index('by_business_name', ['businessId', 'name'])
    .searchIndex('search', {
      searchField: 'searchText',
      filterFields: ['businessId'],
    }),

  clientPhones: defineTable({
    businessId: v.id('businesses'),
    clientId: v.id('clients'),
    e164: v.string(),
  })
    .index('by_business_e164', ['businessId', 'e164'])
    .index('by_client', ['clientId']),

  items: defineTable({
    businessId: v.id('businesses'),
    clientId: v.id('clients'),
    name: v.string(),
    extra: vExtra,
    searchText: v.string(),
  })
    .index('by_client', ['clientId'])
    .index('by_business', ['businessId'])
    .searchIndex('search', {
      searchField: 'searchText',
      filterFields: ['businessId'],
    }),

  // ── Work ───────────────────────────────────────────────────────────
  stages: defineTable({
    businessId: v.id('businesses'),
    name: v.string(),
    order: v.number(),
    color: vStageColor,
    group: vStageGroup,
    clientName: v.optional(v.string()),
    visibleToClient: v.boolean(),
  }).index('by_business_order', ['businessId', 'order']),

  services: defineTable({
    businessId: v.id('businesses'),
    name: v.string(),
    priceCents: v.number(),
    order: v.number(),
    archivedAt: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
  }).index('by_business_order', ['businessId', 'order']),

  // ── Customization ──────────────────────────────────────────────────
  fields: defineTable({
    businessId: v.id('businesses'),
    target: vFieldTarget,
    name: v.string(),
    type: vFieldType,
    options: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          archivedAt: v.optional(v.number()),
        }),
      ),
    ),
    showInList: v.boolean(),
    order: v.number(),
    archivedAt: v.optional(v.number()),
    visibleToClient: v.boolean(),
  }).index('by_business_target_order', ['businessId', 'target', 'order']),
})
