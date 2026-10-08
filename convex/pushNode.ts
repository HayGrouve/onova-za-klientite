'use node'

import { v } from 'convex/values'
import webpush from 'web-push'
import { isPushEndpoint } from '../shared/push-endpoint'
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
 * Sends one notification to one device, as Declarative Web Push (ADR 0011).
 * It is one action per device, so when the push service answers a 429 or a
 * 5xx the workpool retries this device only and the others don't get a second
 * copy. A subscription the service reports gone is deleted.
 */
export const send = internalAction({
  args: {
    subscriptionId: v.id('pushSubscriptions'),
    title: v.string(),
    body: v.string(),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { subscriptionId, title, body, url }) => {
    const publicKey = env.VAPID_PUBLIC_KEY
    const privateKey = env.VAPID_PRIVATE_KEY
    const subject = env.VAPID_SUBJECT
    if (!publicKey || !privateKey || !subject) return null

    const subscription = await ctx.runQuery(internal.push.subscriptionById, {
      subscriptionId,
    })
    if (!subscription) return null
    // Checked again here: rows saved before the check existed must not be sent to either.
    if (!isPushEndpoint(subscription.endpoint)) {
      await ctx.runMutation(internal.push.recordSendResults, {
        delivered: [],
        gone: [subscriptionId],
      })
      return null
    }

    const payload = JSON.stringify({
      web_push: 8030,
      notification: { title, body, navigate: absoluteUrl(url), lang: 'bg' },
    })
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        payload,
        {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: TTL_SECONDS,
          urgency: 'normal',
        },
      )
      await ctx.runMutation(internal.push.recordSendResults, {
        delivered: [subscriptionId],
        gone: [],
      })
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await ctx.runMutation(internal.push.recordSendResults, {
          delivered: [],
          gone: [subscriptionId],
        })
      } else if (status === 429 || (status !== undefined && status >= 500)) {
        throw new Error(`push service answered ${status}`)
      }
      // Anything else (a bad key, a 400) won't get better by retrying.
    }
    return null
  },
})
