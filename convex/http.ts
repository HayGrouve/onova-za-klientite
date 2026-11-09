import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { env, httpAction } from './_generated/server'
import { parseClerkEvent, verifyClerkWebhook } from './lib/clerkWebhook'

const http = httpRouter()

/**
 * Clerk webhooks (Svix), set up on the Clerk instance with `user.deleted`
 * only. When someone deletes their Акаунт on the hub, their data here goes
 * with the same erase as Изтрий данните (ADR 0012). 503 until the signing
 * secret is set, so Clerk keeps retrying instead of losing the event.
 */
http.route({
  path: '/clerk/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const secret = env.CLERK_WEBHOOK_SIGNING_SECRET
    if (!secret) {
      return new Response('Clerk webhooks are not configured', { status: 503 })
    }

    const payload = await request.text()
    const eventId = request.headers.get('svix-id')
    const verified = await verifyClerkWebhook({
      payload,
      headers: {
        id: eventId,
        timestamp: request.headers.get('svix-timestamp'),
        signature: request.headers.get('svix-signature'),
      },
      secret,
      nowMs: Date.now(),
    })
    if (!verified || !eventId) {
      return new Response('Invalid signature', { status: 400 })
    }

    const event = parseClerkEvent(payload)
    if (!event) return new Response('Malformed event', { status: 400 })

    if (event.type === 'user.deleted' && event.userId) {
      await ctx.runMutation(internal.account.recordUserDeleted, {
        eventId,
        clerkUserId: event.userId,
      })
    }
    return new Response(null, { status: 200 })
  }),
})

export default http
