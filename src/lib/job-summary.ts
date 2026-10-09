import { createElement } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { m } from '#/paraglide/messages.js'
import { formatMoney, lineTotalCents } from '../../shared/money'
import { formatQuantity } from '../../shared/quantity'

/** The Job summary (Q16: a PNG only, Q18: no job number). Never an invoice. */

export const SUMMARY_WIDTH = 1080

export type SummaryInput = {
  business: {
    name: string
    phone?: string
    email?: string
    address?: string
  }
  /** Missing for a job without a client. */
  clientName?: string
  title: string
  /** The day the summary is made, "YYYY-MM-DD". */
  date: string
  dueDate?: string
  lines: {
    id: string
    description: string
    quantity: number
    unitPriceCents: number
  }[]
  priceCents: number
  paidCents: number
  balanceCents: number
}

export type SummaryRow = {
  id: string
  description: string
  /** "2 × 150 €" */
  detail: string
  totalCents: number
  total: string
}

/** One row per job line. A job without lines has none: the price says it all. */
export function summaryRows(lines: SummaryInput['lines']): SummaryRow[] {
  return lines.map((line) => {
    const totalCents = lineTotalCents(line.quantity, line.unitPriceCents)
    return {
      id: line.id,
      description: line.description,
      detail: `${formatQuantity(line.quantity)} × ${formatMoney(line.unitPriceCents)}`,
      totalCents,
      total: formatMoney(totalCents),
    }
  })
}

/** The business's phone, email and address, whichever are filled in. */
export function summaryContacts(business: SummaryInput['business']): string[] {
  return [business.phone, business.email, business.address]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value !== '')
}

/** "2026-10-07" as "07.10.2026". */
export function formatSummaryDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}`
}

/** The short text for Viber, when the image can't be sent. */
export function summaryText(input: SummaryInput): string {
  return [
    input.title,
    `${m.job_price()}: ${formatMoney(input.priceCents)}`,
    `${m.job_paid()}: ${formatMoney(input.paidCents)}`,
    `${m.job_balance()}: ${formatMoney(input.balanceCents)}`,
    m.summary_not_invoice(),
  ].join('\n')
}

export function viberTextHref(text: string): string {
  return `viber://forward?text=${encodeURIComponent(text)}`
}

const INK = '#18202f'
const MUTED = '#5f6b7e'
const ACCENT = '#2f4fa8'
const SOFT = '#eef1f7'
const LOGO_BOX = 150

type Style = CSSProperties
type Child = ReactElement | string | false | undefined

// Satori lays everything out as flexbox, so every box says so.
function box(style: Style, ...children: Child[]): ReactElement {
  return createElement(
    'div',
    { style: { display: 'flex', ...style } },
    ...children.filter((child) => child !== false && child !== undefined),
  )
}

function label(content: string, style: Style): ReactElement {
  return box({ wordBreak: 'break-word', ...style }, content)
}

function moneyRow(name: string, value: string, strong: boolean) {
  return box(
    {
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 24,
      color: strong ? ACCENT : INK,
    },
    label(name, { fontSize: strong ? 44 : 36, fontWeight: strong ? 700 : 400 }),
    label(value, { fontSize: strong ? 52 : 38, fontWeight: 700 }),
  )
}

/** The element tree for satori: a 1080px wide portrait page. */
export function summaryTree(
  input: SummaryInput,
  logoDataUrl?: string,
  logoSize?: { width: number; height: number },
): ReactElement {
  const contacts = summaryContacts(input.business)
  const rows = summaryRows(input.lines)
  const dates = [
    formatSummaryDate(input.date),
    input.dueDate
      ? m.due_short({ date: formatSummaryDate(input.dueDate) })
      : '',
  ].filter((value) => value !== '')

  const logo =
    logoDataUrl && logoSize
      ? createElement('img', {
          src: logoDataUrl,
          width: logoSize.width,
          height: logoSize.height,
          style: { objectFit: 'contain' },
        })
      : undefined

  return box(
    {
      flexDirection: 'column',
      width: SUMMARY_WIDTH,
      padding: 72,
      gap: 48,
      backgroundColor: '#ffffff',
      color: INK,
      fontFamily: FONT_FAMILY,
    },
    box(
      { alignItems: 'center', gap: 36 },
      logo && box({ width: LOGO_BOX, justifyContent: 'center' }, logo),
      box(
        { flexDirection: 'column', gap: 8, flexGrow: 1, flexShrink: 1 },
        label(input.business.name, {
          fontSize: 60,
          fontWeight: 700,
          lineHeight: 1.1,
        }),
        ...contacts.map((contact) =>
          label(contact, { fontSize: 32, color: MUTED }),
        ),
      ),
    ),
    box({ height: 4, backgroundColor: SOFT }),
    box(
      { flexDirection: 'column', gap: 12 },
      input.clientName
        ? label(input.clientName, { fontSize: 38, color: ACCENT })
        : undefined,
      label(input.title, { fontSize: 64, fontWeight: 700, lineHeight: 1.1 }),
      box(
        { gap: 28 },
        ...dates.map((date) => label(date, { fontSize: 32, color: MUTED })),
      ),
    ),
    rows.length > 0 &&
      box(
        { flexDirection: 'column', gap: 28 },
        ...rows.map((row) =>
          box(
            {
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 32,
            },
            box(
              { flexDirection: 'column', flexShrink: 1, gap: 4 },
              label(row.description, { fontSize: 38 }),
              label(row.detail, { fontSize: 30, color: MUTED }),
            ),
            label(row.total, { fontSize: 38, fontWeight: 700, flexShrink: 0 }),
          ),
        ),
      ),
    box(
      {
        flexDirection: 'column',
        gap: 20,
        padding: 40,
        borderRadius: 32,
        backgroundColor: SOFT,
      },
      moneyRow(m.job_price(), formatMoney(input.priceCents), false),
      moneyRow(m.job_paid(), formatMoney(input.paidCents), false),
      box({ height: 2, backgroundColor: '#cfd6e4' }),
      moneyRow(m.job_balance(), formatMoney(input.balanceCents), true),
    ),
    // A footnote, not a frame: a bordered box reads as a button on a phone.
    box(
      { justifyContent: 'center', color: MUTED },
      label(m.summary_not_invoice(), { fontSize: 34 }),
    ),
  )
}

type Font = {
  name: string
  data: ArrayBuffer
  weight: 400 | 700
  style: 'normal'
}

// Satori reads TTF, OTF and WOFF, not WOFF2. Each weight comes as a Latin and a
// Cyrillic file. They are two families, which satori tries one after the other
// for every character (the font-family below lists both).
const FONT_FAMILY = 'Sofia Sans Latin, Sofia Sans Cyrillic'
const FONT_FILES = [
  {
    file: 'sofia-sans-latin-400-normal.woff',
    name: 'Sofia Sans Latin',
    weight: 400,
  },
  {
    file: 'sofia-sans-cyrillic-400-normal.woff',
    name: 'Sofia Sans Cyrillic',
    weight: 400,
  },
  {
    file: 'sofia-sans-latin-700-normal.woff',
    name: 'Sofia Sans Latin',
    weight: 700,
  },
  {
    file: 'sofia-sans-cyrillic-700-normal.woff',
    name: 'Sofia Sans Cyrillic',
    weight: 700,
  },
] as const

let fonts: Promise<Font[]> | undefined

function loadFonts(): Promise<Font[]> {
  fonts ??= Promise.all(
    FONT_FILES.map(async ({ file, name, weight }) => {
      const response = await fetch(`/fonts/${file}`)
      if (!response.ok) throw new Error(`font ${file}: ${response.status}`)
      return {
        name,
        data: await response.arrayBuffer(),
        weight,
        style: 'normal' as const,
      }
    }),
  ).catch((error: unknown) => {
    fonts = undefined
    throw error
  })
  return fonts
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image'))
    image.src = src
  })
}

/**
 * The logo as a small PNG data URL, which satori embeds. Drawing it on a canvas
 * also turns any format the browser reads (WebP, JPEG) into PNG. No logo, or a
 * logo that fails to load, leaves the page without one.
 */
async function loadLogo(url: string | null | undefined) {
  if (!url) return undefined
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    const blobUrl = URL.createObjectURL(await response.blob())
    try {
      const image = await loadImage(blobUrl)
      const scale = Math.min(
        1,
        (LOGO_BOX * 2) / Math.max(image.naturalWidth, image.naturalHeight),
      )
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas
        .getContext('2d')
        ?.drawImage(image, 0, 0, canvas.width, canvas.height)
      const fit = Math.min(LOGO_BOX / canvas.width, LOGO_BOX / canvas.height)
      return {
        dataUrl: canvas.toDataURL('image/png'),
        size: {
          width: Math.round(canvas.width * fit),
          height: Math.round(canvas.height * fit),
        },
      }
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  } catch {
    return undefined
  }
}

/** satori to SVG, then the canvas to PNG. */
export async function renderSummaryPng(
  input: SummaryInput,
  logoUrl?: string | null,
): Promise<Blob> {
  const [{ default: satori }, loadedFonts, logo] = await Promise.all([
    import('satori'),
    loadFonts(),
    loadLogo(logoUrl),
  ])
  const svg = await satori(summaryTree(input, logo?.dataUrl, logo?.size), {
    width: SUMMARY_WIDTH,
    fonts: loadedFonts,
  })
  const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  )
  try {
    const image = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('png'))),
        'image/png',
      ),
    )
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
