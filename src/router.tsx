import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { NotFoundPage } from '#/components/not-found'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // An address that matches no page shows one Bulgarian page of its own,
    // outside the signed-in shell, at any depth.
    notFoundMode: 'root',
    defaultNotFoundComponent: NotFoundPage,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  interface StaticDataRouteOption {
    /**
     * How wide the page may grow on a wide screen (the shell reads it). Pages
     * without one keep a reading width; a phone always gets one column.
     */
    layout?: 'wide' | 'full'
    /**
     * A layout route that stays put while its child pages change (the
     * settings menu): the shell fades the page in only when this route
     * opens, and the route fades its own children.
     */
    frame?: boolean
  }
}
