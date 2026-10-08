const DAY = 24 * 60 * 60 * 1000

/**
 * "Now" for a query. A query's result only recomputes when its data changes,
 * so `Date.now()` inside one goes stale; the device passes the time instead,
 * rounded to 5 minutes (`roundedNow`), and the query reruns when that changes.
 * A missing, non-finite or wildly off value falls back to the server clock.
 */
export function queryNow(now: number | undefined) {
  const server = Date.now()
  return now !== undefined &&
    Number.isFinite(now) &&
    Math.abs(now - server) < DAY
    ? now
    : server
}
