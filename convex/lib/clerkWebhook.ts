/** Svix (Clerk's webhook sender) rejects messages older than five minutes. */
const SIGNATURE_TOLERANCE_SECONDS = 300

const SECRET_PREFIX = 'whsec_'

export interface SvixHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function hmacSha256Base64(
  key: Uint8Array<ArrayBuffer>,
  message: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(message),
  )
  return bytesToBase64(new Uint8Array(signature))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

/**
 * Checks Clerk's Svix headers against the raw request body: a base64 HMAC of
 * `{svix-id}.{svix-timestamp}.{body}` under the endpoint secret (`whsec_…`,
 * base64 after the prefix), signed within the last five minutes. The header
 * may carry several space-separated `v1,<signature>` entries during rotation.
 */
export async function verifyClerkWebhook(input: {
  payload: string
  headers: SvixHeaders
  secret: string
  nowMs: number
}): Promise<boolean> {
  const { id, timestamp, signature } = input.headers
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  const ageSeconds = Math.abs(input.nowMs / 1000 - Number(timestamp))
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false

  const key = base64ToBytes(
    input.secret.startsWith(SECRET_PREFIX)
      ? input.secret.slice(SECRET_PREFIX.length)
      : input.secret,
  )
  if (!key) return false

  const expected = await hmacSha256Base64(
    key,
    `${id}.${timestamp}.${input.payload}`,
  )
  return signature
    .split(' ')
    .some(
      (entry) =>
        entry.startsWith('v1,') && timingSafeEqual(entry.slice(3), expected),
    )
}

export interface ClerkEventSummary {
  type: string
  /** The Clerk user the event is about (`data.id` on `user.*` events). */
  userId: string | null
}

/** Reads the event type and user id from a verified webhook body. */
export function parseClerkEvent(payload: string): ClerkEventSummary | null {
  let event: unknown
  try {
    event = JSON.parse(payload)
  } catch {
    return null
  }
  if (!event || typeof event !== 'object') return null
  const type = Reflect.get(event, 'type')
  if (typeof type !== 'string') return null
  const data = Reflect.get(event, 'data')
  const id = data && typeof data === 'object' ? Reflect.get(data, 'id') : null
  return { type, userId: typeof id === 'string' ? id : null }
}
