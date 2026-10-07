/**
 * The few Clerk Backend API calls the suite needs: create a throw-away
 * `+clerk_test` user and delete it again. Plain fetch, so no extra package.
 */
const API = 'https://api.clerk.com/v1'

function secretKey() {
  const key = process.env.CLERK_SECRET_KEY
  if (!key) throw new Error('CLERK_SECRET_KEY is not set (see AGENTS.md).')
  return key
}

async function call(path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
  })
}

export type TestUser = { id: string; email: string }

/** A fresh user. `+clerk_test` emails take the fixed code 424242 and skip real mail. */
export async function createTestUser(): Promise<TestUser> {
  const email = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}+clerk_test@example.com`
  const response = await call('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [email],
      skip_password_requirement: true,
    }),
  })
  if (!response.ok) {
    throw new Error(`Clerk createUser failed: ${response.status}`)
  }
  const user = (await response.json()) as { id: string }
  return { id: user.id, email }
}

export async function clerkUserExists(id: string): Promise<boolean> {
  const response = await call(`/users/${id}`)
  return response.status !== 404
}

/** Deletes the Clerk user. Already gone (404) counts as done. */
export async function deleteClerkUser(id: string): Promise<void> {
  const response = await call(`/users/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Clerk deleteUser failed: ${response.status}`)
  }
}
