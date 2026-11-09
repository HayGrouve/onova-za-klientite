import { m } from '#/paraglide/messages.js'

/** The hub's legal pages, this app's own sections on them (ADR 0012). */
export const LEGAL_URLS = {
  privacy: 'https://onovaza.com/poveritelnost#klientite',
  terms: 'https://onovaza.com/usloviya#klientite',
  processing: 'https://onovaza.com/obrabotvane-na-danni',
} as const

/** Privacy, terms and the data processing terms, as a quiet row of links. */
export function LegalLinks({ className }: { className?: string }) {
  const links = [
    [LEGAL_URLS.privacy, m.legal_privacy()],
    [LEGAL_URLS.terms, m.legal_terms()],
    [LEGAL_URLS.processing, m.legal_processing()],
  ] as const
  return (
    <nav aria-label={m.legal_label()} className={className}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {links.map(([href, label]) => (
          <li key={href}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
