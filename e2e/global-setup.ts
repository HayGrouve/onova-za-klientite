import { clerkSetup } from '@clerk/testing/playwright'

/** Fetches a Clerk Testing Token for the dev instance (needs CLERK_SECRET_KEY). */
export default async function globalSetup() {
  await clerkSetup()
}
