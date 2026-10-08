// Web Push in the browser (ADR 0011). The server side is convex/push.ts.

const OFF_KEY = 'push-off'

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Running as the installed app (Home Screen), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone
  return (
    legacy === true || window.matchMedia('(display-mode: standalone)').matches
  )
}

/** Viber, Facebook and Instagram open links in a view that can't take push (D17). */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /FBAN|FBAV|FB_IAB|Instagram|Viber/i.test(navigator.userAgent)
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** The service worker is only registered in production builds. */
export function pushAvailable(): boolean {
  return import.meta.env.PROD && pushSupported()
}

export function permissionState(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

/** The person switched push off on this device: don't subscribe again on open. */
export function pushSwitchedOff(): boolean {
  return localStorage.getItem(OFF_KEY) === '1'
}

export function rememberPushSwitch(on: boolean) {
  if (on) localStorage.removeItem(OFF_KEY)
  else localStorage.setItem(OFF_KEY, '1')
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushAvailable()) return null
  const registration = await navigator.serviceWorker.ready
  return await registration.pushManager.getSubscription()
}

/** The subscription as the `push.subscribe` mutation takes it. */
export function subscriptionArgs(subscription: PushSubscription) {
  const json = subscription.toJSON()
  const { p256dh, auth } = json.keys ?? {}
  if (!json.endpoint || !p256dh || !auth) throw new Error('bad subscription')
  return {
    endpoint: json.endpoint,
    keys: { p256dh, auth },
    userAgent: navigator.userAgent,
  }
}

async function subscribeWith(publicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready
  return (
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }))
  )
}

/**
 * Asks for permission and subscribes. Call it from a tap, never on load:
 * iPhone only shows the question for a user gesture.
 */
export async function subscribePush(
  publicKey: string,
): Promise<{ ok: true; subscription: PushSubscription } | { ok: false }> {
  if (!pushAvailable()) return { ok: false }
  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission
  if (permission !== 'granted') return { ok: false }
  return { ok: true, subscription: await subscribeWith(publicKey) }
}

/**
 * On every open: permission granted but the subscription is gone (the
 * browser dropped it, or the service dropped it after a 410), so subscribe
 * again. Returns the subscription to save on the server, if there is one.
 */
export async function resubscribeIfLost(
  publicKey: string,
): Promise<PushSubscription | null> {
  if (!pushAvailable() || Notification.permission !== 'granted') return null
  if (pushSwitchedOff()) return null
  return await subscribeWith(publicKey)
}

/** Unsubscribes this device. Returns the endpoint to remove on the server. */
export async function unsubscribePush(): Promise<string | null> {
  const subscription = await currentSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}

/**
 * Before signing out: take this device off the server and unsubscribe the
 * browser, so the next person on the phone doesn't get this account's pushes
 * (the server row would otherwise outlive the session). The browser
 * unsubscribe never waits for the server call. It never throws and waits at
 * most `timeoutMs`: signing out must still happen offline.
 */
export async function dropPushOnSignOut(
  removeOnServer: (endpoint: string) => Promise<unknown>,
  find: () => Promise<Pick<
    PushSubscription,
    'endpoint' | 'unsubscribe'
  > | null> = currentSubscription,
  timeoutMs = 4000,
): Promise<void> {
  const work = (async () => {
    const subscription = await find()
    if (!subscription) return
    // Start the server removal first: it needs the session that is about to
    // end. The browser unsubscribe is started right away and on its own, so
    // a server call that never settles (offline) can't keep the browser
    // subscribed, and neither can the timeout.
    const onServer = (async () =>
      removeOnServer(subscription.endpoint))().catch(() => undefined)
    const inBrowser = (async () => subscription.unsubscribe())().catch(
      () => undefined,
    )
    await Promise.all([onServer, inBrowser])
  })().catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([work, limit])
  clearTimeout(timer)
}
