# ADR 0011: Web Push sent from Convex

**Status:** Proposed

## Context

The owner gets push notifications: a morning summary, reminders due and overdue jobs. Android Chrome supports Web Push in the browser. iPhone supports it only in a Home Screen web app, with the permission asked from a tap ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). The sibling app has no push, and there is no Convex component for Web Push.

## Decision

- **Sending:** the `web-push` library in a `"use node"` Convex action, with VAPID keys in Convex env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) and a `mailto:` subject, because Apple rejects anything else. The public key also goes to the client as `VITE_VAPID_PUBLIC_KEY`.
- **Fan-out:**
  - Crons are UTC only, so each membership stores its next send time, `nextSummaryAt`.
  - A cron every 15 minutes finds the due ones and sends them through the `workpool` component.
  - A subscription that returns 404 or 410 is deleted. A 429 is retried later.
- **Payload:** the Declarative Web Push shape (`{ web_push: 8030, notification, navigate }`). iOS 18.4+ shows it without running the service worker, and the service worker's `push` handler reads the same shape everywhere else. The handler always calls `showNotification`, and a tap opens the deep link. There are no action buttons, because iOS doesn't support them.
- **Asking:**
  - Never on load. The ask comes from a "Известия" switch in Settings, or from a one-time card after setup, with one line on why.
  - On iPhone outside the Home Screen app, the card shows how to add it first.
  - On every app open, if permission is granted but the subscription is gone, the app subscribes again.

## Consequences

- Push messages pass through Google's, Apple's and Mozilla's push services. Payloads stay short, with no amounts or client details beyond a name.
- `web-push` was last released in January 2024. It is small and stable, but a WebCrypto-based library (`@pushforge/builder`) is the fallback if it breaks.
