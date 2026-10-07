import { m } from '#/paraglide/messages.js'

/** The browser tab's title: the page first, so a row of tabs tells them apart. */
export function pageTitle(title: string | undefined): string {
  const page = title?.trim()
  return page ? `${page} · ${m.app_name()}` : m.app_name()
}
