# ADR 0010: Offline means a read-only snapshot, served by an SPA shell

**Status:** Proposed. Milestone 1 builds the shell. Milestone 10 builds the snapshot.

## Context

The design doc says: view offline, edit online. Today's jobs, client contacts and open job details must stay readable with no signal, with no local-first sync engine. Convex data arrives over a websocket, so a service worker can't cache it, and Convex deliberately has no offline or stale-data mode ([convex-js#77](https://github.com/get-convex/convex-js/issues/77)). The app is entirely behind sign-in, so server rendering gains nothing.

## Decision

- **Shell:**
  - TanStack Start in SPA mode (`spa: { enabled: true }`), which prerenders a static `/_shell.html`.
  - A small hand-written service worker, emitted by a tiny Vite plugin from the client bundle's file list:
    - it precaches the hashed assets, icons, fonts and the shell;
    - it answers every navigation with the cached shell;
    - it passes Clerk, Convex and `/_serverFn/*` straight through.
  - `vite-plugin-pwa` is not used, because it doesn't support the Vite Environment API that Start builds on ([vite-plugin-pwa#786](https://github.com/vite-pwa/vite-plugin-pwa/pull/786)).
  - A new service worker shows "Има нова версия" instead of taking over silently.
- **Data:**
  - One Convex query, `offline.snapshot`, returns what must survive a basement: today's and open jobs with their details, and clients with contacts.
  - The client writes its latest result to IndexedDB (`idb-keyval`), keyed by user, and wipes it on sign-out.
  - When the connection is down, the screens that support it render from the snapshot with "Последно обновено в 14:32".
  - The app asks for `navigator.storage.persist()`.
- **Connection state:**
  - Offline is decided from three signals: the browser's `online`/`offline` events, Convex's `useConvexConnectionState()`, and a 2–3 s debounce so a phone waking up doesn't flash a banner.
  - Editing controls are disabled offline with a plain message: "Без връзка. Може да разглеждате, но не и да променяте."
  - If the websocket stays down for 15 s after the browser reports `online`, the app reloads. This guards against a known hang, [convex-js#181](https://github.com/get-convex/convex-js/issues/181).
- **Offline rendering doesn't wait for auth.** The cached view uses the last signed-in user id, because Clerk's web SDK can't load offline.

## Consequences

- The response headers of `/sw.js`, `/_shell.html` and the manifest must be checked on the first Vercel preview, because Nitro's Vercel preset can cache public files for a year.
- SPA mode with `@clerk/tanstack-react-start` is unconfirmed. Milestone 1 spikes it, with `@clerk/react` as the fallback, since Convex is what verifies tokens.
- The snapshot is a copy of personal data on the phone. It is wiped on sign-out and limited to what the doc lists.
