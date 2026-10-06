import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { PageTitle } from '#/components/page'
import { Button } from '#/components/ui/button'
import {
  applyTimingFlag,
  clearTimings,
  formatDuration,
  readTimings,
} from '#/lib/timing'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/timing')({ component: TimingPage })

const FLOW_LABEL = { setup: m.timing_flow_setup, newJob: m.timing_flow_new_job }

/** Q15: times recorded on this device while `?timing` is on. Never sent anywhere. */
function TimingPage() {
  const [records, setRecords] = useState(readTimings)
  return (
    <>
      <PageTitle>{m.timing_title()}</PageTitle>
      <div className="flex flex-col gap-4 px-4">
        {records.length === 0 ? (
          <p className="text-muted-foreground">{m.timing_empty()}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {records.map((record) => (
              <li
                key={record.at}
                className="flex items-center justify-between px-4 py-3"
              >
                <span>{FLOW_LABEL[record.flow]()}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {new Date(record.at).toLocaleString('bg-BG')}
                </span>
                <span className="font-medium tabular-nums">
                  {formatDuration(record.ms)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="xl"
            onClick={() => {
              clearTimings()
              setRecords([])
            }}
          >
            {m.timing_clear()}
          </Button>
          <Button
            variant="ghost"
            size="xl"
            onClick={() => applyTimingFlag('?timing=off')}
          >
            {m.timing_off()}
          </Button>
        </div>
      </div>
    </>
  )
}
