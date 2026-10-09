#!/bin/sh
# Vercel's build command (vercel.json): push the Convex functions, build the
# app against that deployment, and keep what Convex derives from the jobs built.
#
# - Every deploy: `convex deploy` typechecks and pushes the functions and the
#   schema, runs `pnpm build` with VITE_CONVEX_URL set, and, on a new preview
#   deployment only, seeds it (`seed:preview`).
# - Production only: `counts:backfill` (D105, D106) then rebuilds the job
#   counts and Worker assignment rows. `convex deploy` has no flag for running
#   a function after a production push, so it is a second command (`--prod`
#   is ignored for a production deploy key, and picks production for a project
#   key). It is cheap and idempotent: a business that is already right isn't
#   written. It only schedules the rebuild, so the build doesn't wait for it,
#   and until a business is rebuilt the screens count its jobs from the jobs
#   themselves.
#
# `set -e`: a failed push fails the Vercel build. A failed backfill call does
# not: the functions are already live by then, the screens recount an unbuilt
# business themselves, and failing here would leave the new functions behind
# the old app. It is logged loudly instead; re-run it by hand.
set -eu

npx convex deploy --cmd 'pnpm build' --preview-run 'seed:preview'

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "convex: scheduling counts:backfill on the production deployment"
  if npx convex run counts:backfill '{}' --prod; then
    echo "convex: counts:backfill scheduled"
  else
    echo "convex: WARNING counts:backfill failed; run it by hand: npx convex run counts:backfill '{}' --prod" >&2
  fi
fi
