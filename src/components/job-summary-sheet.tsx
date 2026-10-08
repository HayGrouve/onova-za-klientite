import { cn } from 'cn'
import {
  CopyIcon,
  DownloadSimpleIcon,
  ShareNetworkIcon,
} from '@phosphor-icons/react'
import { useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button, buttonVariants } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useToday } from '#/hooks/use-today'
import { renderSummaryPng, summaryText, viberTextHref } from '#/lib/job-summary'
import type { SummaryInput } from '#/lib/job-summary'
import { m } from '#/paraglide/messages.js'

const FILE_NAME = 'summary.png'

type Made = {
  blob: Blob
  file: File
  url: string
  /** The picture's own size, so its place is kept before it has loaded. */
  size?: { width: number; height: number }
}

/** Makes the PNG as soon as the input is known, so a tap can share at once. */
function useSummaryImage(input: SummaryInput | undefined, logoUrl?: string) {
  const [made, setMade] = useState<Made>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const key = input ? JSON.stringify([input, logoUrl]) : undefined

  useEffect(() => {
    if (!input || key === undefined) return
    let cancelled = false
    // A function, so the check after an await isn't narrowed away.
    const stale = () => cancelled
    let url: string | undefined
    setFailed(false)
    renderSummaryPng(input, logoUrl).then(
      async (blob) => {
        if (stale()) return
        const size = await createImageBitmap(blob).then(
          (bitmap) => {
            const found = { width: bitmap.width, height: bitmap.height }
            bitmap.close()
            return found
          },
          () => undefined,
        )
        if (stale()) return
        url = URL.createObjectURL(blob)
        setMade({
          blob,
          file: new File([blob], FILE_NAME, { type: 'image/png' }),
          url,
          size,
        })
      },
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // The key stands for input and logoUrl.
  }, [key, attempt])

  return { made, failed, retry: () => setAttempt((n) => n + 1) }
}

function canShareFile(file: File | undefined): boolean {
  return (
    file !== undefined &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

const canCopyImage =
  typeof ClipboardItem !== 'undefined' &&
  'clipboard' in navigator &&
  typeof navigator.clipboard.write === 'function'

function SummaryBody({
  businessId,
  jobId,
}: {
  businessId: Id<'businesses'>
  jobId: Id<'jobs'>
}) {
  const today = useToday()
  const data = useQuery(api.jobs.get, { businessId, jobId })
  const settings = useQuery(api.businesses.settings, { businessId })

  // Costs and profit are not read: the summary is for the client.
  const input = useMemo<SummaryInput | undefined>(() => {
    if (!data || !settings) return undefined
    const { job, client } = data
    return {
      business: {
        name: settings.name,
        phone: settings.phone ?? undefined,
        email: settings.email ?? undefined,
        address: settings.address ?? undefined,
      },
      clientName: client && !client.isNoClient ? client.name : undefined,
      title: job.title,
      date: today,
      dueDate: job.dueDate,
      lines: job.lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
      priceCents: job.priceCents,
      paidCents: job.paidCents,
      balanceCents: job.balanceCents,
    }
  }, [data, settings, today])

  const { made, failed, retry } = useSummaryImage(
    input,
    settings?.logoUrl ?? undefined,
  )

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">{m.summary_failed()}</p>
        <Button variant="outline" className="h-10" onClick={retry}>
          {m.summary_retry()}
        </Button>
      </div>
    )
  }
  if (!made || !input) {
    return (
      <p
        role="status"
        className="px-4 py-12 text-center text-sm text-muted-foreground"
      >
        {m.summary_preparing()}
      </p>
    )
  }

  const share = () => {
    // Straight from the tap: the file is already made.
    navigator.share({ files: [made.file] }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error(m.summary_failed())
    })
  }
  const copy = () => {
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': made.blob })])
      .then(
        () => toast.success(m.summary_copied()),
        () => toast.error(m.summary_copy_failed()),
      )
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        <img
          src={made.url}
          width={made.size?.width}
          height={made.size?.height}
          alt={m.summary_preview_alt()}
          className="mx-auto h-auto w-full max-w-sm rounded-xl border bg-white"
        />
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {canShareFile(made.file) && (
          <Button className="h-12 text-base" onClick={share}>
            <ShareNetworkIcon data-icon="inline-start" />
            {m.summary_share()}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={made.url}
            download={FILE_NAME}
            className={cn(
              buttonVariants({
                variant: 'outline',
                className: 'h-11',
              }),
            )}
          >
            <DownloadSimpleIcon data-icon="inline-start" />
            {m.summary_download()}
          </a>
          {canCopyImage && (
            <Button variant="outline" className="h-11" onClick={copy}>
              <CopyIcon data-icon="inline-start" />
              {m.summary_copy()}
            </Button>
          )}
        </div>
        <a
          href={viberTextHref(summaryText(input))}
          className={buttonVariants({ variant: 'ghost', className: 'h-11' })}
        >
          {m.summary_viber()}
        </a>
      </div>
    </>
  )
}

export function JobSummaryButton({
  businessId,
  jobId,
}: {
  businessId: Id<'businesses'>
  jobId: Id<'jobs'>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        className="h-11 lg:h-9"
        onClick={() => setOpen(true)}
      >
        {m.summary_button()}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] rounded-t-3xl"
          aria-describedby={undefined}
        >
          <SheetHeader>
            <SheetTitle>{m.summary_title()}</SheetTitle>
          </SheetHeader>
          {open && <SummaryBody businessId={businessId} jobId={jobId} />}
        </SheetContent>
      </Sheet>
    </>
  )
}
