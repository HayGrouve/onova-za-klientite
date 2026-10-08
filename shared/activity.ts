// The activity log's events and the details each one carries. The server
// writes an event only with its own details; the timelines read them back.

export const ACTIVITY_TYPES = [
  'job.created',
  'job.edited',
  'job.stageChanged',
  'job.linesChanged',
  'job.itemsChanged',
  'job.writtenOff',
  'job.writeOffRemoved',
  'job.cancelled',
  'payment.added',
  'payment.edited',
  'payment.removed',
  'credit.used',
  'cost.added',
  'cost.edited',
  'cost.removed',
  'client.created',
  'client.merged',
  'client.anonymized',
  'client.edited',
  'item.created',
  'item.edited',
  'item.moved',
  'stage.added',
  'stage.edited',
  'stage.removed',
  'stages.reordered',
  'field.added',
  'field.edited',
  'field.archived',
  'field.restored',
  'setup.applied',
  'settings.changed',
  'reminder.added',
  'reminder.closed',
  'reminder.moved',
  'reminder.reopened',
  'job.repeatSet',
  'job.repeatStopped',
  'job.repeated',
  'appointment.added',
  'appointment.changed',
  'appointment.cancelled',
  'file.added',
  'file.removed',
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

type None = Record<string, never>
type Named = { name: string }
type Renamed = { from: string; to: string }
type Money = { amountCents: number }
/** A payment's amount is negative for a refund. */
type Payment = Money & { note?: string }
/** A stage, a field: its name and id. */
type Setting = { name: string; toId: string }
type StageMove = {
  from?: string
  to: string
  fromId?: string
  toId: string
  /** Why the job was cancelled. */
  note?: string
}
/** A moment as `stampMoment` writes it: the date, and the time if set. */
type Appointment = { to: string; note?: string }

/** What each event records about the change, as `logActivity` writes it. */
export type ActivityDetails = {
  'job.created': Named
  'job.edited': None
  'job.stageChanged': StageMove
  'job.cancelled': StageMove
  /** How many lines there were, and are. */
  'job.linesChanged': Renamed
  'job.itemsChanged': None
  'job.writtenOff': Money & { note?: string }
  'job.writeOffRemoved': Money
  'payment.added': Payment
  'payment.edited': Payment
  'payment.removed': Money
  'credit.used': Money
  'cost.added': Money & Named
  'cost.edited': Money
  'cost.removed': Money & Named
  'client.created': Named
  /** The merged client's name, and the ids it moved from and into. */
  'client.merged': { from: string; fromId: string; toId: string }
  'client.anonymized': None
  'client.edited': Renamed
  'item.created': Named
  'item.edited': None
  /** The clients the item moved from and to. */
  'item.moved': { fromId: string; toId: string }
  'stage.added': Setting
  'stage.edited': Renamed & { toId: string }
  /** Where its jobs went, if it had any. */
  'stage.removed': { name: string; fromId: string; toId?: string }
  'stages.reordered': None
  'field.added': Setting
  /** Renamed, or (an option added) just named. */
  'field.edited': (Renamed & { toId: string }) | Setting
  'field.archived': Setting
  'field.restored': Setting
  /** The business name before and after. */
  'setup.applied': Renamed
  'settings.changed': {
    name:
      'profile' | 'words' | 'modules' | 'reminderRule' | 'newJob' | 'services'
  }
  'reminder.added': { to: string; note: string }
  'reminder.closed': { to: 'done' | 'dismissed'; note: string }
  'reminder.moved': Renamed & { note: string }
  'reminder.reopened': { note: string }
  /** "<every> <unit>". */
  'job.repeatSet': { to: string }
  'job.repeatStopped': None
  /** The next job's date and id. */
  'job.repeated': { to: string; toId: string }
  'appointment.added': Appointment
  'appointment.changed': Appointment
  'appointment.cancelled': { note?: string }
  /** A photo has no name. */
  'file.added': { name?: string }
  'file.removed': { name?: string }
}

/** An event's details: optional for the types that record none. */
export type WithDetails<TType extends ActivityType> =
  None extends ActivityDetails[TType]
    ? { data?: ActivityDetails[TType] }
    : { data: ActivityDetails[TType] }

/**
 * A logged event as a timeline reads it. Rows written before a detail was
 * recorded may lack it, so every detail may be missing.
 */
export type LoggedActivity = {
  [TType in ActivityType]: {
    type: TType
    data: Partial<ActivityDetails[TType]>
  }
}[ActivityType]

/** A stored event, read as its type's details. */
export const asLogged = (event: { type: ActivityType; data: object }) =>
  event as LoggedActivity
