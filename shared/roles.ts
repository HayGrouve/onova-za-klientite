/** What a Membership may do in its business, least to most. */
export type Role = 'worker' | 'manager' | 'owner'

const RANK: Record<Role, number> = { worker: 0, manager: 1, owner: 2 }

/** Whether `role` may do what needs at least `needed`. The server checks the same way. */
export function hasRole(role: Role, needed: Role): boolean {
  return RANK[role] >= RANK[needed]
}
