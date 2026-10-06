import { useEffect, useState } from 'react'
import { todayInSofia } from '../../shared/dates'

/** Today's Sofia date, rolling over at midnight while the app stays open. */
export function useToday() {
  const [today, setToday] = useState(() => todayInSofia(Date.now()))
  useEffect(() => {
    const id = window.setInterval(
      () => setToday(todayInSofia(Date.now())),
      60_000,
    )
    return () => window.clearInterval(id)
  }, [])
  return today
}
