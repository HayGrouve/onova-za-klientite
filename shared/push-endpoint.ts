// Push subscriptions come from the browser. The server only ever posts to
// the browsers' own push services, so a crafted endpoint can't aim it elsewhere.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]
const PUSH_HOST_SUFFIXES = [
  '.push.apple.com',
  '.notify.windows.com',
  '.push.services.mozilla.com',
]

export const MAX_ENDPOINT_LENGTH = 1000

export function isPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username ||
    url.password
  )
    return false
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  return (
    PUSH_HOSTS.includes(host) ||
    PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  )
}
