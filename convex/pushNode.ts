'use node'

import { v } from 'convex/values'
import webpush from 'web-push'
import { internal } from './_generated/api'
import { internalAction, env } from './_generated/server'

/** A summary that can't be delivered within 6 hours is no longer news. */
const TTL_SECONDS = 6 * 60 * 60

/** The declarative payload needs an absolute https address (ADR 0011). */
function absoluteUrl(url: string): string {
  const origin = env.APP_URL?.replace(/\/+$/, '')
  return origin ? new URL(url, `${origin}/`).toString() : url
}

/**
 * Sends one notification to every device of one user, as Declarative Web Push
 * (ADR 0011). Subscriptions the push service reports gone are deleted. A 429 or
 * a 5xx throws after the others were tried, so the workpool retries it.
 */
export const send = internalAction({
  args: {
    userId: v.id('users'),
    title: v.string(),
    body: v.string(),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, title, body, url }) => {
    const publicKey = env.VAPID_PUBLIC_KEY
    const privateKey = env.VAPID_PRIVATE_KEY
    const subject = env.VAPID_SUBJECT
    if (!publicKey || !privateKey || !subject) return null

    const subscriptions = await ctx.runQuery(internal.push.subscriptionsOf, {
      userId,
    })
    if (subscriptions.length === 0) return null

    const payload = JSON.stringify({
      web_push: 8030,
      notification: { title, body, navigate: absoluteUrl(url), lang: 'bg' },
    })
    const vapidDetails = { subject, publicKey, privateKey }

    const delivered: Array<(typeof subscriptions)[number]['_id']> = []
    const gone: typeof delivered = []
    let retry: string | null = null
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload,
          { vapidDetails, TTL: TTL_SECONDS, urgency: 'normal' },
        )
        delivered.push(subscription._id)
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(subscription._id)
        else if (status === 429 || (status !== undefined && status >= 500)) {
          retry = `push service answered ${status}`
        }
        // Anything else (a bad key, a 400) won't get better by retrying.
      }
    }
    await ctx.runMutation(internal.push.recordSendResults, { delivered, gone })
    if (retry) throw new Error(retry)
    return null
  },
})
