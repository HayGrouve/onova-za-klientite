import { useEffect } from 'react'
import { pageTitle } from '#/lib/page-title'

/**
 * Names the browser tab after the page while it is open. A hook rather than a
 * route's `head`, because the title is often data (a job's title) that the
 * page only has once it has loaded. The tab goes back to the app's name when
 * the page closes, so a page without a title never keeps the last one's.
 */
export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    document.title = pageTitle(title)
    return () => {
      document.title = pageTitle(undefined)
    }
  }, [title])
}
