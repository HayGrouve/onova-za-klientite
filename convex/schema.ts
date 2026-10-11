import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  vActivityData,
  vActivityType,
  vChannel,
  vConsent,
  vExtra,
  vFieldTarget,
  vFieldType,
  vGroupCounts,
  vJobFlow,
  vJobLine,
  vModules,
  vPaymentMethod,
  vRepeatUnit,
  vRole,
  vSetupAnswers,
  vStageColor,
  vStageGroup,
  vWords,
} from './validators'

// The schema draft from docs/implementation-plan.md. Amounts are integer euro
// cents (ADR 0007). Calendar dates are "YYYY-MM-DD" in Europe/Sofia, moments
// are epoch ms (D1). Cached values are written only by recompute (ADR 0008).
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
    logoFileId: v.optional(v.id('files')),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    words: vWords,
    modules: vModules,
    jobFlow: vJobFlow,
    depositsOnNewJob: v.boolean(),
    repeatDefault: v.optional(
      v.object({ every: v.number(), unit: vRepeatUnit }),
    ),
    reminderRule: v.optional(v.object({ months: v.number() })),
    setup: v.object({
      answers: v.optional(vSetupAnswers),
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
    .index('by_business_credit', ['businessId', 'creditCents'])
    .index('by_merged_into', ['mergedIntoId'])
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

  jobs: defineTable({
    businessId: v.id('businesses'),
    clientId: v.id('clients'),
    title: v.string(),
    stageId: v.id('stages'),
    stageGroup: vStageGroup,
    stageChangedAt: v.number(),
    doneAt: v.optional(v.number()),
    lines: v.array(vJobLine),
    typedPriceCents: v.optional(v.number()),
    dueDate: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    itemIds: v.array(v.id('items')),
    assigneeIds: v.array(v.id('memberships')),
    source: v.union(
      v.literal('manual'),
      v.literal('phone'),
      v.literal('online'),
    ),
    repeat: v.optional(
      v.object({
        every: v.number(),
        unit: vRepeatUnit,
        nextJobId: v.optional(v.id('jobs')),
        stoppedAt: v.optional(v.number()),
        /** The day of the month a monthly series keeps (shared/repeat.ts). */
        anchorDay: v.optional(v.number()),
      }),
    ),
    nextRepeatOn: v.optional(v.string()),
    seriesId: v.optional(v.id('jobs')),
    writeOff: v.optional(
      v.object({
        amountCents: v.number(),
        note: v.string(),
        at: v.number(),
        by: v.id('memberships'),
      }),
    ),
    cancelReason: v.optional(v.string()),
    extra: vExtra,
    // Cached, ADR 0008. Only recomputeJob writes these.
    priceCents: v.number(),
    paidCents: v.number(),
    costCents: v.number(),
    balanceCents: v.number(),
    owes: v.boolean(),
    searchText: v.string(),
    createdBy: v.id('memberships'),
  })
    // In creation order, which the recount of the job counts pages through (D105).
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes
    .index('by_business', ['businessId'])
    .index('by_business_group_due', ['businessId', 'stageGroup', 'dueDate'])
    .index('by_business_group_done', ['businessId', 'stageGroup', 'doneAt'])
    .index('by_business_stage', ['businessId', 'stageId'])
    .index('by_business_owes', ['businessId', 'owes', 'stageGroup'])
    .index('by_client', ['clientId'])
    .index('by_next_repeat', ['nextRepeatOn'])
    .searchIndex('search', {
      searchField: 'searchText',
      filterFields: ['businessId', 'stageGroup'],
    }),

  // Derived from `jobs`, written only through convex/lib/ledger.ts (D105): how
  // many jobs each stage group and each stage holds, so no list reads every job
  // to count. One row for the business (no `membershipId`) and one per member
  // with assigned jobs, which is what a Worker is counted by.
  jobCounts: defineTable({
    businessId: v.id('businesses'),
    membershipId: v.optional(v.id('memberships')),
    groups: vGroupCounts,
    /** The business row only. A stage with no jobs has no entry. */
    stages: v.optional(v.record(v.id('stages'), v.number())),
  }).index('by_business_member', ['businessId', 'membershipId']),

  // The counts of a business being recounted by `counts:backfill` (D105): the
  // jobs up to `after` (a `_creationTime`) are counted here, and every change
  // to such a job is added here too, so the recount ends exact however the
  // jobs changed meanwhile. At most one row per business; gone when it ends.
  jobCountRebuilds: defineTable({
    businessId: v.id('businesses'),
    /** Which run this belongs to: a run that finds another's id stops. */
    runId: v.string(),
    after: v.number(),
    groups: vGroupCounts,
    stages: v.record(v.id('stages'), v.number()),
    members: v.record(v.id('memberships'), vGroupCounts),
  }).index('by_business', ['businessId']),

  // Derived from `jobs.assigneeIds` (D106): one row per job and assignee, so a
  // Worker's jobs are an index read instead of a scan of the business's jobs.
  // The group, due date, client and `owes` are copies, kept in step by the ledger.
  jobAssignments: defineTable({
    businessId: v.id('businesses'),
    jobId: v.id('jobs'),
    membershipId: v.id('memberships'),
    clientId: v.id('clients'),
    stageGroup: vStageGroup,
    dueDate: v.optional(v.string()),
    owes: v.boolean(),
    // The job's `searchText`, so a Worker's search is limited to their own
    // jobs by `membershipId` (D109). Optional only until the backfill has
    // filled the rows made before it.
    searchText: v.optional(v.string()),
  })
    .index('by_member_group_due', ['membershipId', 'stageGroup', 'dueDate'])
    .index('by_member_owes_group', ['membershipId', 'owes', 'stageGroup'])
    .index('by_job', ['jobId'])
    .index('by_business', ['businessId'])
    .searchIndex('search', {
      searchField: 'searchText',
      filterFields: ['membershipId'],
    }),

  jobItems: defineTable({
    businessId: v.id('businesses'),
    jobId: v.id('jobs'),
    itemId: v.id('items'),
  })
    .index('by_item', ['itemId'])
    .index('by_job', ['jobId'])
    .index('by_business', ['businessId']),

  appointments: defineTable({
    businessId: v.id('businesses'),
    jobId: v.optional(v.id('jobs')),
    clientId: v.optional(v.id('clients')),
    start: v.number(),
    end: v.optional(v.number()),
    allDay: v.boolean(),
    label: v.optional(v.string()),
    assigneeIds: v.array(v.id('memberships')),
    resourceIds: v.optional(v.array(v.string())),
    doneAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index('by_business_start', ['businessId', 'start'])
    .index('by_job', ['jobId'])
    .index('by_client', ['clientId']),

  services: defineTable({
    businessId: v.id('businesses'),
    name: v.string(),
    priceCents: v.number(),
    order: v.number(),
    archivedAt: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
  }).index('by_business_order', ['businessId', 'order']),

  reminders: defineTable({
    businessId: v.id('businesses'),
    date: v.string(),
    note: v.string(),
    clientId: v.optional(v.id('clients')),
    jobId: v.optional(v.id('jobs')),
    itemId: v.optional(v.id('items')),
    source: v.union(v.literal('manual'), v.literal('rule')),
    status: v.union(
      v.literal('open'),
      v.literal('done'),
      v.literal('dismissed'),
    ),
    closedAt: v.optional(v.number()),
  })
    .index('by_business_status_date', ['businessId', 'status', 'date'])
    .index('by_client', ['clientId'])
    .index('by_job', ['jobId'])
    .index('by_item', ['itemId']),

  // ── Money ──────────────────────────────────────────────────────────
  payments: defineTable({
    businessId: v.id('businesses'),
    clientId: v.id('clients'),
    amountCents: v.number(),
    date: v.string(),
    method: vPaymentMethod,
    label: v.optional(v.string()),
    note: v.optional(v.string()),
    allocatedCents: v.number(),
    createdBy: v.id('memberships'),
  })
    .index('by_business_date', ['businessId', 'date'])
    .index('by_client', ['clientId']),

  allocations: defineTable({
    businessId: v.id('businesses'),
    paymentId: v.id('payments'),
    jobId: v.id('jobs'),
    clientId: v.id('clients'),
    amountCents: v.number(),
  })
    .index('by_payment', ['paymentId'])
    .index('by_job', ['jobId'])
    .index('by_client', ['clientId'])
    .index('by_business', ['businessId']),

  costs: defineTable({
    businessId: v.id('businesses'),
    jobId: v.optional(v.id('jobs')),
    amountCents: v.number(),
    date: v.string(),
    label: v.string(),
    note: v.optional(v.string()),
  })
    .index('by_business_date', ['businessId', 'date'])
    .index('by_job', ['jobId']),

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

  // ── Files, history, messages ───────────────────────────────────────
  files: defineTable({
    businessId: v.id('businesses'),
    storageId: v.id('_storage'),
    kind: v.union(v.literal('photo'), v.literal('file')),
    mimeType: v.string(),
    size: v.number(),
    name: v.optional(v.string()),
    jobId: v.optional(v.id('jobs')),
    clientId: v.optional(v.id('clients')),
    itemId: v.optional(v.id('items')),
    fieldId: v.optional(v.id('fields')),
    visibleToClient: v.boolean(),
    uploadedBy: v.id('memberships'),
  })
    .index('by_job', ['jobId'])
    .index('by_client', ['clientId'])
    .index('by_item', ['itemId'])
    .index('by_storage', ['storageId'])
    .index('by_business', ['businessId']),

  activity: defineTable({
    businessId: v.id('businesses'),
    actorId: v.id('memberships'),
    type: vActivityType,
    jobId: v.optional(v.id('jobs')),
    clientId: v.optional(v.id('clients')),
    itemId: v.optional(v.id('items')),
    paymentId: v.optional(v.id('payments')),
    costId: v.optional(v.id('costs')),
    data: vActivityData,
  })
    .index('by_job', ['jobId'])
    .index('by_client', ['clientId'])
    .index('by_item', ['itemId'])
    .index('by_business', ['businessId']),

  messages: defineTable({
    businessId: v.id('businesses'),
    clientId: v.id('clients'),
    jobId: v.optional(v.id('jobs')),
    channel: vChannel,
    recipient: v.string(),
    kind: v.union(v.literal('manual'), v.literal('automatic')),
    template: v.optional(v.string()),
    status: v.union(
      v.literal('logged'),
      v.literal('queued'),
      v.literal('sent'),
      v.literal('delivered'),
      v.literal('failed'),
    ),
    note: v.optional(v.string()),
    by: v.optional(v.id('memberships')),
  })
    .index('by_client', ['clientId'])
    .index('by_job', ['jobId'])
    .index('by_business', ['businessId']),

  shareLinks: defineTable({
    businessId: v.id('businesses'),
    tokenHash: v.string(),
    target: v.object({
      kind: v.union(v.literal('job'), v.literal('client')),
      id: v.string(),
    }),
    permission: v.union(
      v.literal('view'),
      v.literal('approve'),
      v.literal('book'),
    ),
    expiresAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    createdBy: v.id('memberships'),
  })
    .index('by_token_hash', ['tokenHash'])
    .index('by_business', ['businessId']),

  pushSubscriptions: defineTable({
    userId: v.id('users'),
    endpoint: v.string(),
    keys: v.object({ p256dh: v.string(), auth: v.string() }),
    userAgent: v.optional(v.string()),
    lastSuccessAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_endpoint', ['endpoint']),

  // Deleting an account, or one business alone (D124): then there is no user.
  deletionJobs: defineTable({
    userId: v.optional(v.id('users')),
    businessIds: v.array(v.id('businesses')),
    table: v.string(),
    status: v.union(v.literal('running'), v.literal('done')),
  }),
})
