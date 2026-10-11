/**
 * The row-to-job morph (D120): the title of the row that was tapped turns
 * into the job page's heading, with the browser's View Transitions. Only the
 * tapped row carries the name, and only from the tap, so two elements never
 * share it; a browser without the API, or with reduced motion, just opens the
 * page.
 */
export const JOB_TITLE_MORPH = 'job-title'

/** Marks the title inside a tapped row, before the router starts the transition. */
export function markJobTitle(event: React.MouseEvent<HTMLElement>) {
  event.currentTarget
    .querySelector<HTMLElement>('[data-job-title]')
    ?.style.setProperty('view-transition-name', JOB_TITLE_MORPH)
}
